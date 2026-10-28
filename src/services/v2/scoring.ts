import prisma from "@/lib/db";
import { refreshGroupStandings } from "./standings";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import {
  Action,
  Rules,
  ScoreState,
  initialState,
  replay,
  resolveRules,
  pointLabels,
  isTiebreak,
  serviceInfo,
} from "../../../packages/core/src";
import { AppError } from "@/lib/errors";
import { AuthUser } from "@/middleware/auth.middleware";
import { matchAccess } from "@/lib/v2/access";
import { syncSchema } from "@/lib/v2/validation";
import { matchEventBus } from "@/lib/events";
export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function claimMatch(
  user: AuthUser,
  id: string,
  deviceId: string,
  takeover = false,
) {
  const access = await matchAccess(user, id, takeover);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM categories WHERE id = ${access.stage.categoryId} FOR UPDATE`;
    const m = await tx.match.findUniqueOrThrow({
      where: { id },
      include: { stage: { include: { category: true } } },
    });
    if (m.engineVersion === 1 && m.status !== "SCHEDULED")
      throw AppError.conflict(
        "Pertandingan lama yang telah dimulai tetap menggunakan konsol lama",
      );
    if (m.approvalStatus === "APPROVED")
      throw AppError.conflict("Hasil sudah disahkan");
    if (m.deviceId && m.deviceId !== deviceId && !takeover)
      throw AppError.conflict(
        "Perangkat lain sedang mencatat. Admin dapat mengambil alih.",
      );
    if (!m.entryAId || !m.entryBId)
      throw AppError.conflict("Peserta pertandingan belum lengkap");
    if (m.deviceId === deviceId && m.stateV2) return m;
    if (!m.stage.category.rulesV2)
      throw AppError.badRequest("Pilih preset aturan kategori terlebih dahulu");
    const roundRules = m.stage.roundRules as Record<
      string,
      Partial<Rules>
    > | null;
    const rules =
      (m.rulesSnapshot as unknown as Rules) ??
      resolveRules(
        m.stage.category.rulesV2 as unknown as Rules,
        m.stage.rulesOverride as Partial<Rules> | undefined,
        roundRules?.[String(m.round)],
      );
    const state = m.stateV2 ?? json(initialState(rules));
    const update = await tx.match.updateMany({
      where: { id, version: m.version, ownershipVersion: m.ownershipVersion },
      data: {
        engineVersion: 2,
        deviceId,
        ownershipVersion: { increment: 1 },
        rulesSnapshot: json(rules),
        stateV2: state,
      },
    });
    if (update.count !== 1)
      throw AppError.conflict("Pertandingan berubah; muat ulang");
    await tx.auditLog.create({
      data: {
        userId: user.userId,
        tournamentId: m.stage.category.tournamentId,
        action: takeover ? "TAKEOVER_SCORING" : "CLAIM_SCORING",
        entityType: "Match",
        entityId: id,
        after: { deviceId },
      },
    });
    return tx.match.findUniqueOrThrow({ where: { id } });
  });
}
export async function syncActions(user: AuthUser, id: string, input: unknown) {
  const payload = syncSchema.parse(input);
  await matchAccess(user, id);
  const result = await prisma.$transaction(
    async (tx) => {
      const m = await tx.match.findUniqueOrThrow({
        where: { id },
        include: {
          stage: { include: { category: true } },
          actionEvents: { orderBy: { sequence: "asc" } },
        },
      });
      if (m.engineVersion !== 2 || !m.rulesSnapshot)
        throw AppError.conflict("Pertandingan belum diunduh ke perangkat");
      if (
        m.deviceId !== payload.deviceId ||
        m.ownershipVersion !== payload.ownershipVersion
      )
        throw AppError.conflict(
          "Kepemilikan perangkat berubah; simpan antrean untuk pemeriksaan admin",
        );
      if (m.approvalStatus === "APPROVED")
        throw AppError.conflict("Hasil telah disahkan");
      let version = m.version;
      let sequence = m.actionEvents.at(-1)?.sequence ?? 0;
      const actions = m.actionEvents.map((e) => e.action as unknown as Action);
      const accepted: string[] = [];
      for (const event of payload.events) {
        const existing = m.actionEvents.find((e) => e.id === event.id);
        if (existing) {
          if (
            existing.deviceId !== payload.deviceId ||
            existing.sequence !== event.sequence ||
            !isDeepStrictEqual(existing.action, json(event.action))
          )
            throw AppError.conflict("ID aksi digunakan untuk data berbeda");
          accepted.push(event.id);
          continue;
        }
        if (event.baseVersion !== version || event.sequence !== sequence + 1)
          throw AppError.conflict(
            "Urutan/versi skor berbeda; jangan menimpa skor server",
          );
        if ("at" in event.action && event.action.at > Date.now() + 60000)
          throw AppError.badRequest("Waktu perangkat tidak valid");
        actions.push(event.action as Action);
        try {
          replay(m.rulesSnapshot as unknown as Rules, actions);
        } catch (error) {
          throw AppError.badRequest((error as Error).message);
        }
        await tx.scoringAction.create({
          data: {
            id: event.id,
            matchId: id,
            userId: user.userId,
            deviceId: payload.deviceId,
            ownershipVersion: payload.ownershipVersion,
            sequence: event.sequence,
            baseVersion: event.baseVersion,
            action: json(event.action),
          },
        });
        sequence++;
        version++;
        accepted.push(event.id);
      }
      const state = replay(m.rulesSnapshot as unknown as Rules, actions);
      const status =
        state.status === "NOT_STARTED"
          ? "SCHEDULED"
          : ["COMPLETED", "RETIRED", "WALKOVER", "DISQUALIFIED"].includes(
                state.status,
              )
            ? "FINISHED"
            : state.status;
      const winnerId =
        state.winner === "A"
          ? m.entryAId
          : state.winner === "B"
            ? m.entryBId
            : null;
      const changed = await tx.match.updateMany({
        where: {
          id,
          version: m.version,
          ownershipVersion: payload.ownershipVersion,
        },
        data: {
          stateV2: json(state),
          version,
          status: status as "SCHEDULED",
          winnerId,
          startedAt:
            state.status !== "NOT_STARTED" && !m.startedAt
              ? new Date()
              : m.startedAt,
          finishedAt:
            status === "FINISHED" ? (m.finishedAt ?? new Date()) : null,
        },
      });
      if (changed.count !== 1)
        throw AppError.conflict("Skor berubah pada perangkat lain");
      const [pointsA, pointsB] = pointLabels(state);
      const snapshot = {
        currentSet: state.sets.length,
        pointsA,
        pointsB,
        isTiebreak: isTiebreak(state),
        tiebreakPtsA: isTiebreak(state) ? state.points[0] : 0,
        tiebreakPtsB: isTiebreak(state) ? state.points[1] : 0,
        gamesA: state.sets.map((s) => s.games[0]),
        gamesB: state.sets.map((s) => s.games[1]),
        setsA: state.sets.filter((s) => s.winner === "A").length,
        setsB: state.sets.filter((s) => s.winner === "B").length,
        server: serviceInfo(state).team,
        version,
      };
      await tx.matchScoreSnapshot.upsert({
        where: { matchId: id },
        create: { matchId: id, ...snapshot },
        update: snapshot,
      });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: m.stage.category.tournamentId,
          action: "SYNC_SCORE",
          entityType: "Match",
          entityId: id,
          after: { eventIds: accepted, version },
        },
      });
      return {
        matchId: id,
        tournamentId: m.stage.category.tournamentId,
        state,
        version,
        sequence,
        accepted,
        snapshot,
        status,
      };
    },
    { timeout: 20000 },
  );
  matchEventBus.publishMatchUpdate(id, result);
  return result;
}
export async function approveV2(user: AuthUser, id: string) {
  await matchAccess(user, id, true);
  return prisma.$transaction(async (tx) => {
    const m = await tx.match.findUniqueOrThrow({
      where: { id },
      include: { stage: true },
    });
    const state = m.stateV2 as unknown as ScoreState;
    if (!state?.finalized || m.approvalStatus === "APPROVED")
      throw AppError.badRequest(
        "Finalisasi dan sinkronkan hasil sebelum pengesahan",
      );
    await tx.match.update({
      where: { id },
      data: { approvalStatus: "APPROVED" },
    });
    const losers = m.winnerId === m.entryAId ? m.entryBId : m.entryAId;
    const config = m.stage.config as {
      draw?: {
        number: number;
        winnerTo?: [number, "a" | "b"];
        loserTo?: [number, "a" | "b"];
        conditionalReset?: boolean;
      }[];
    } | null;
    const node = config?.draw?.find((x) => x.number === m.matchNumber);
    for (const [edge, entryId] of [
      [node?.winnerTo, m.winnerId],
      [node?.loserTo, losers],
    ] as const)
      if (edge) {
        const target = await tx.match.findFirst({
          where: { stageId: m.stageId, matchNumber: edge[0] },
        });
        if (target) {
          if (target.status !== "SCHEDULED")
            throw AppError.conflict(
              "Babak lanjutan sudah dimulai. Admin harus menyelesaikan dampak koreksi.",
            );
          await tx.match.update({
            where: { id: target.id },
            data: { [edge[1] === "a" ? "entryAId" : "entryBId"]: entryId },
          });
        }
      }
    if (m.bracketSide === "FINAL" && !node?.conditionalReset) {
      const reset = config?.draw?.find((x) => x.conditionalReset);
      if (reset) {
        const target = await tx.match.findFirst({
          where: { stageId: m.stageId, matchNumber: reset.number },
        });
        if (target)
          await tx.match.update({
            where: { id: target.id },
            data:
              m.winnerId === m.entryBId
                ? { entryAId: m.entryAId, entryBId: m.entryBId }
                : { status: "CANCELLED" },
          });
      }
    }
    await tx.auditLog.create({
      data: {
        userId: user.userId,
        action: "APPROVE_V2",
        entityType: "Match",
        entityId: id,
        after: { winnerId: m.winnerId },
      },
    });
    if (m.groupId) await refreshGroupStandings(tx, m.groupId);
    return { approved: true };
  });
}
