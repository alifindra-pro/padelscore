import { randomInt } from "node:crypto";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";
import { matchAccess } from "@/lib/v2/access";
import type { AuthUser } from "@/middleware/auth.middleware";
import type { CoinToss, ScoreState } from "../../../packages/core/src";

export async function getCoinToss(user: AuthUser, id: string) {
  await matchAccess(user, id);
  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    select: { coinToss: true },
  });
  return (match.coinToss ?? null) as unknown as CoinToss | null;
}
export async function tossCoin(
  user: AuthUser,
  id: string,
  deviceId: string,
  ownershipVersion: number,
) {
  await matchAccess(user, id);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM matches WHERE id = ${id} FOR UPDATE`;
      const match = await tx.match.findUniqueOrThrow({
        where: { id },
        include: {
          stage: { select: { category: { select: { tournamentId: true } } } },
        },
      });
      if (
        match.engineVersion !== 2 ||
        !match.stateV2 ||
        match.deviceId !== deviceId ||
        match.ownershipVersion !== ownershipVersion
      )
        throw AppError.conflict(
          "Unduh pertandingan pada perangkat pencatat yang aktif terlebih dahulu",
        );
      if (
        !["NOT_STARTED", "WARMUP"].includes(
          (match.stateV2 as unknown as ScoreState).status,
        ) ||
        match.approvalStatus === "APPROVED"
      )
        throw AppError.conflict(
          "Undian hanya tersedia sebelum pertandingan dimulai",
        );
      if (!match.entryAId || !match.entryBId)
        throw AppError.conflict("Peserta belum lengkap");
      // The row lock above makes this check-then-write safe against double tosses.
      if (match.coinToss) return match.coinToss as unknown as CoinToss;
      const winner = randomInt(2) === 0 ? "A" : "B";
      const result: CoinToss = {
        winner,
        face: winner === "A" ? "KEPALA" : "EKOR",
        tossedAt: new Date().toISOString(),
      };
      await tx.match.update({ where: { id }, data: { coinToss: { ...result } } });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: match.stage.category.tournamentId,
          action: "COIN_TOSS",
          entityType: "Match",
          entityId: id,
          after: { ...result },
        },
      });
      return result;
    },
    { timeout: 20000 },
  );
}
