import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireAuth } from "@/middleware/auth.middleware";
import { matchAccess } from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";
import {
  matchStartCode,
  sameCode,
  START_CODE_TRIES,
} from "@/lib/court-referee";

type Context = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "private, no-store" } };

/** The referee types the 4-digit code from the control desk to open a match. */
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const { code } = z
      .object({
        code: z.string().regex(/^\d{4}$/, "Kode terdiri dari 4 angka"),
      })
      .parse(await req.json());
    await matchAccess(user, id);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM matches WHERE id = ${id} FOR UPDATE`;
      const m = await tx.match.findUniqueOrThrow({ where: { id } });
      if (m.startUnlockedAt) return { unlocked: true };
      if (m.startCodeFails >= START_CODE_TRIES)
        return { blocked: true as const };
      if (sameCode(matchStartCode(id), code)) {
        await tx.match.update({
          where: { id },
          data: { startUnlockedAt: new Date() },
        });
        return { unlocked: true };
      }
      const fails = m.startCodeFails + 1;
      await tx.match.update({ where: { id }, data: { startCodeFails: fails } });
      return { left: START_CODE_TRIES - fails };
    });
    if ("blocked" in result || result.left === 0)
      throw new AppError(
        423,
        "START_BLOCKED",
        "Kode salah terlalu sering. Minta panitia membuka laga ini dari meja kontrol.",
      );
    if ("left" in result)
      throw AppError.badRequest(
        `Kode salah. Sisa ${result.left} kali percobaan.`,
      );
    return NextResponse.json({ data: { unlocked: true } }, noStore);
  } catch (e) {
    return handleApiError(e);
  }
}
