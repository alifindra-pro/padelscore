import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "@/lib/db";
import { AUTH_CONFIG } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { courtToken, matchStartCode, sameCode } from "@/lib/court-referee";
import {
  assertLoginAllowed,
  loginKeys,
  recordLoginFailure,
} from "@/lib/login-throttle";
import { tokenHash } from "@/services/v2/auth";

const noStore = { headers: { "Cache-Control": "no-store" } };
const SESSION_DAYS = 2;
const linkId = z.string().regex(/^[A-Za-z0-9_-]{16}$/);

async function courtFor(link: string) {
  const court = await prisma.court.findUnique({
    where: { refereeLinkId: link },
    include: {
      tournament: { select: { name: true } },
      refereeUser: { select: { id: true, role: true, isActive: true } },
    },
  });
  if (!court?.refereeUser?.isActive)
    throw AppError.notFound(
      "Link wasit tidak berlaku. Minta link baru ke panitia.",
    );
  return court;
}

/** What the sign-in page shows before the token is typed. */
export async function GET(req: NextRequest) {
  try {
    const link = linkId.parse(req.nextUrl.searchParams.get("link"));
    const court = await courtFor(link);
    return NextResponse.json(
      { data: { court: court.name, tournament: court.tournament.name } },
      noStore,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Court link + the match token from the desk (4 digits) opens that match
 * straight away. The older 6-digit court token still signs in.
 */
export async function POST(req: NextRequest) {
  try {
    const input = z
      .object({ link: linkId, token: z.string().regex(/^(\d{4}|\d{6})$/) })
      .parse(await req.json());
    const keys = loginKeys(req, `court:${input.link}`);
    await assertLoginAllowed(keys);
    const court = await courtFor(input.link);
    let matchId: string | null = null;
    if (input.token.length === 4) {
      // Matches on this court still waiting to be played, earliest first.
      const waiting = await prisma.match.findMany({
        where: {
          courtId: court.id,
          status: { in: ["SCHEDULED", "WARMUP", "IN_PROGRESS", "SUSPENDED"] },
          entryAId: { not: null },
          entryBId: { not: null },
        },
        orderBy: [{ scheduledAt: "asc" }, { matchNumber: "asc" }],
        select: { id: true },
      });
      matchId =
        waiting.find((m) => sameCode(matchStartCode(m.id), input.token))?.id ??
        null;
    } else if (
      sameCode(courtToken(court.id, court.refereeTokenVersion), input.token)
    )
      matchId = "";
    if (matchId === null) {
      await recordLoginFailure(keys);
      throw AppError.unauthorized(
        "Token salah atau laga ini bukan di lapangan ini. Periksa lagi token dari panitia.",
      );
    }
    if (matchId)
      await prisma.match.updateMany({
        where: { id: matchId, startUnlockedAt: null },
        data: { startUnlockedAt: new Date() },
      });
    const user = court.refereeUser!;
    // A revocable session: changing the court token signs this device out.
    const session = await prisma.mobileSession.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(randomBytes(32).toString("base64url")),
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
      },
    });
    const token = jwt.sign(
      { userId: user.id, role: user.role, sessionId: session.id },
      AUTH_CONFIG.JWT_SECRET,
      { expiresIn: `${SESSION_DAYS}d` },
    );
    const response = NextResponse.json(
      {
        data: {
          court: court.name,
          tournament: court.tournament.name,
          matchId: matchId || null,
        },
      },
      noStore,
    );
    response.cookies.set({
      name: AUTH_CONFIG.COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return response;
  } catch (e) {
    return handleApiError(e);
  }
}
