import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { AppError, handleApiError } from "@/lib/errors";
import {
  courtToken,
  matchStartCode,
  newLinkId,
  START_CODE_TRIES,
} from "@/lib/court-referee";

type Context = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "private, no-store" } };
const OPEN = ["SCHEDULED", "WARMUP", "IN_PROGRESS", "SUSPENDED"] as const;

/** Organizer desk: court referee links and tokens, and start codes per match. */
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await requireTournamentAdmin(req, id);
    const [courts, matches] = await Promise.all([
      prisma.court.findMany({
        where: { tournamentId: id },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
        include: { refereeUser: { select: { fullName: true } } },
      }),
      prisma.match.findMany({
        where: {
          stage: { category: { tournamentId: id } },
          status: { in: [...OPEN] },
          entryAId: { not: null },
          entryBId: { not: null },
        },
        select: {
          id: true,
          matchNumber: true,
          status: true,
          scheduledAt: true,
          courtId: true,
          startUnlockedAt: true,
          startCodeFails: true,
          entryA: { select: { name: true } },
          entryB: { select: { name: true } },
          stage: {
            select: { name: true, category: { select: { name: true } } },
          },
        },
        orderBy: [{ scheduledAt: "asc" }, { matchNumber: "asc" }],
        take: 300,
      }),
    ]);
    return NextResponse.json(
      {
        data: {
          courts: courts.map((c) => ({
            id: c.id,
            name: c.name,
            referee: c.refereeLinkId
              ? {
                  name: c.refereeUser?.fullName ?? `Wasit ${c.name}`,
                  linkId: c.refereeLinkId,
                  token: courtToken(c.id, c.refereeTokenVersion),
                }
              : null,
          })),
          matches: matches.map((m) => ({
            ...m,
            code: matchStartCode(m.id),
            locked: !m.startUnlockedAt && m.startCodeFails >= START_CODE_TRIES,
          })),
        },
      },
      noStore,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

const action = z.discriminatedUnion("action", [
  // Create the court's referee account, or change its token.
  z.object({ action: z.literal("court"), courtId: z.string().uuid() }),
  z.object({ action: z.literal("rotate"), courtId: z.string().uuid() }),
  // Let a match start without a code (e.g. the referee's phone failed).
  z.object({ action: z.literal("unlock"), matchId: z.string().uuid() }),
  // Undo an unlock pressed by mistake, while the match has not started.
  z.object({ action: z.literal("relock"), matchId: z.string().uuid() }),
]);

export async function POST(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await requireTournamentAdmin(req, id);
    const input = action.parse(await req.json());

    if (input.action === "unlock") {
      const { count } = await prisma.match.updateMany({
        where: { id: input.matchId, stage: { category: { tournamentId: id } } },
        data: { startUnlockedAt: new Date() },
      });
      if (!count) throw AppError.notFound("Laga tidak ditemukan");
      return NextResponse.json({ data: { ok: true } }, noStore);
    }

    if (input.action === "relock") {
      const { count } = await prisma.match.updateMany({
        where: {
          id: input.matchId,
          status: "SCHEDULED",
          stage: { category: { tournamentId: id } },
        },
        data: { startUnlockedAt: null },
      });
      if (!count)
        throw AppError.badRequest(
          "Laga sudah dimulai, izin mulai tidak bisa dibatalkan",
        );
      return NextResponse.json({ data: { ok: true } }, noStore);
    }

    const court = await prisma.court.findFirst({
      where: { id: input.courtId, tournamentId: id },
      include: { tournament: { select: { organizationId: true } } },
    });
    if (!court) throw AppError.notFound("Lapangan tidak ditemukan");

    if (input.action === "rotate") {
      if (!court.refereeUserId)
        throw AppError.badRequest("Buat akses wasit lapangan ini dahulu");
      await prisma.$transaction([
        prisma.court.update({
          where: { id: court.id },
          data: { refereeTokenVersion: { increment: 1 } },
        }),
        // Devices signed in with the old token are signed out.
        prisma.mobileSession.updateMany({
          where: { userId: court.refereeUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      return NextResponse.json({ data: { ok: true } }, noStore);
    }

    if (court.refereeUserId)
      return NextResponse.json({ data: { ok: true } }, noStore);
    const suffix = randomUUID().slice(0, 8);
    await prisma.$transaction(async (tx) => {
      // No one knows this password; the account signs in only by court token.
      const user = await tx.user.create({
        data: {
          fullName: `Wasit ${court.name}`,
          username: `wasit_${suffix}`,
          email: `wasit-${suffix}@referee.invalid`,
          role: "REFEREE",
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        },
      });
      if (court.tournament.organizationId)
        await tx.organizationMember.create({
          data: {
            organizationId: court.tournament.organizationId,
            userId: user.id,
            role: "REFEREE",
          },
        });
      await tx.tournamentMember.create({
        data: { tournamentId: id, userId: user.id, role: "REFEREE" },
      });
      await tx.court.update({
        where: { id: court.id },
        data: {
          refereeUserId: user.id,
          refereeLinkId: newLinkId(),
          refereeTokenVersion: 1,
        },
      });
    });
    return NextResponse.json(
      { data: { ok: true } },
      { status: 201, ...noStore },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
