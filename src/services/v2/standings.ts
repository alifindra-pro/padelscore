import { Prisma } from "@prisma/client";
import {
  standings,
  DEFAULT_STANDINGS,
  Result,
  StandingsPolicy,
} from "../../../packages/core/src";
export async function refreshGroupStandings(
  tx: Prisma.TransactionClient,
  groupId: string,
) {
  const group = await tx.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      stage: { include: { category: true } },
      matches: { include: { scoreSnapshot: true } },
    },
  });
  const ids = [
    ...new Set(
      group.matches
        .flatMap((m) => [m.entryAId, m.entryBId])
        .filter((x): x is string => !!x),
    ),
  ];
  const results: Result[] = group.matches
    .filter((m) => m.approvalStatus === "APPROVED" || m.status === "APPROVED")
    .map((m) => ({
      a: m.entryAId!,
      b: m.entryBId!,
      winner: m.winnerId,
      setsA: m.scoreSnapshot?.setsA ?? 0,
      setsB: m.scoreSnapshot?.setsB ?? 0,
      gamesA: m.scoreSnapshot?.gamesA.reduce((a, b) => a + b, 0) ?? 0,
      gamesB: m.scoreSnapshot?.gamesB.reduce((a, b) => a + b, 0) ?? 0,
    }));
  const rows = standings(
    ids,
    results,
    (group.stage.category.standingsPolicy as unknown as StandingsPolicy) ??
      DEFAULT_STANDINGS,
  );
  for (const row of rows) {
    const values = {
      played: row.played,
      won: row.won,
      lost: row.lost,
      drawn: row.played - row.won - row.lost,
      points: row.points,
      setsWon: row.setsWon,
      setsLost: row.setsLost,
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      rank: row.rank,
    };
    await tx.standing.upsert({
      where: { groupId_entryId: { groupId, entryId: row.id } },
      create: { groupId, entryId: row.id, ...values },
      update: values,
    });
  }
  return rows;
}
