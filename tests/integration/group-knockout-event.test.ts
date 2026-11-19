// Rookie event format: 5 groups of 4, "total 4 games" in groups, golden
// point, all 10 group winners and runners-up into a seeded knockout with
// 6 byes, race to 4 until the final and race to 6 in the final.
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { POST as v2Post } from "@/app/api/v2/[...path]/route";
import { claimMatch } from "@/services/v2/scoring";

let userId: string, orgId: string, token: string, categoryId: string;
const tournamentId = randomUUID();
const user = () => ({ userId, role: "ORGANIZER" as const });
const request = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": orgId,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
const qualify = () =>
  v2Post(request(`/api/v2/categories/${categoryId}/qualify`, {}), {
    params: Promise.resolve({
      path: ["categories", categoryId, "qualify"],
    }),
  });

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `rookie-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Rookie organizer",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: { name: "Rookie", members: { create: { userId, role: "OWNER" } } },
    })
  ).id;
  token = generateToken(user());
  const response = await setup(
    request("/api/v2/tournaments/setup", {
      requestId: tournamentId,
      name: "Rookie test",
      location: "Full House Padel Yosodipuro",
      start: "2026-11-22T01:00:00Z",
      timezone: "Asia/Jakarta",
      category: "Rookie Women",
      courts: 2,
      preset: "TOTAL_4",
      deuce: "GOLDEN_POINT",
      knockoutPreset: "RACE_4",
      finalPreset: "RACE_6",
      format: "GROUP_KNOCKOUT",
      groups: 5,
      advancePerGroup: 2,
      bestRunnersUp: 0,
      pairs: Array.from({ length: 20 }, (_, i) => [
        `Rookie ${i + 1} A`,
        `Rookie ${i + 1} B`,
      ]),
      duration: 30,
      rest: 10,
    }),
  );
  expect(response.status).toBe(201);
  categoryId = (
    await prisma.category.findFirstOrThrow({ where: { tournamentId } })
  ).id;
});
afterAll(async () => {
  if (!userId) return;
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});

it("builds 5 groups of 4 with the total-4-games golden point rule", async () => {
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
  });
  expect(category.rulesV2).toMatchObject({
    setFormat: "TOTAL_GAMES",
    gamesPerSet: 4,
    deuce: "GOLDEN_POINT",
  });
  expect(category.qualificationPolicy).toMatchObject({
    perGroup: 2,
    groups: 5,
    knockoutRules: { setFormat: "RACE", gamesPerSet: 4 },
    finalRules: { setFormat: "RACE", gamesPerSet: 6 },
  });
  const groups = await prisma.group.findMany({
    where: { stage: { categoryId } },
    include: { matches: true },
  });
  expect(groups).toHaveLength(5);
  for (const g of groups) expect(g.matches).toHaveLength(6);
});

it("seeds the 10 qualifiers by results into the 9-match knockout and applies round rules", async () => {
  const groups = await prisma.group.findMany({
    where: { stage: { categoryId } },
    orderBy: { name: "asc" },
    include: { matches: { orderBy: { matchNumber: "asc" } } },
  });
  // Entries ranked inside each group by index. Only the last group wins 4-0,
  // so its winner has the best game difference and must be seed 1.
  for (const [gi, g] of groups.entries()) {
    const ids = [
      ...new Set(g.matches.flatMap((m) => [m.entryAId!, m.entryBId!])),
    ].sort();
    for (const m of g.matches) {
      const a = ids.indexOf(m.entryAId!),
        b = ids.indexOf(m.entryBId!);
      const aWins = a < b;
      // Winner margin: 4-0 in the last group, 3-1 elsewhere, 3-2 between 3rd and 4th.
      const close = Math.min(a, b) >= 2;
      const [w, l] = close
        ? [3, 2]
        : gi === groups.length - 1
          ? [4, 0]
          : [3, 1];
      await prisma.match.update({
        where: { id: m.id },
        data: {
          status: "FINISHED",
          approvalStatus: "APPROVED",
          winnerId: aWins ? m.entryAId : m.entryBId,
          scoreSnapshot: {
            create: {
              setsA: aWins ? 1 : 0,
              setsB: aWins ? 0 : 1,
              gamesA: [aWins ? w : l],
              gamesB: [aWins ? l : w],
            },
          },
        },
      });
    }
  }
  const response = await qualify();
  expect(response.status).toBe(201);
  const stage = await prisma.stage.findFirstOrThrow({
    where: { categoryId, type: "SINGLE_ELIMINATION" },
    include: { matches: { orderBy: { matchNumber: "asc" } } },
  });
  expect(stage.rulesOverride).toMatchObject({
    setFormat: "RACE",
    gamesPerSet: 4,
  });
  expect(stage.roundRules).toMatchObject({
    "4": { setFormat: "RACE", gamesPerSet: 6 },
  });
  const byes = stage.matches.filter((m) => m.approvalStatus === "APPROVED");
  const playable = stage.matches.filter((m) => m.approvalStatus !== "APPROVED");
  expect(stage.matches).toHaveLength(15);
  expect(byes).toHaveLength(6);
  expect(playable).toHaveLength(9);
  expect(playable.filter((m) => m.round === 1)).toHaveLength(2);
  expect(playable.filter((m) => m.round === 2)).toHaveLength(4);

  // Seed 1 is the winner of the strongest group.
  const groupE = groups.at(-1)!;
  const winnerE = [
    ...new Set(groupE.matches.flatMap((m) => [m.entryAId!, m.entryBId!])),
  ].sort()[0];
  const seed1Bye = stage.matches.find((m) => m.matchNumber === 1)!;
  expect(seed1Bye.entryAId).toBe(winnerE);

  // Round rules: quarterfinal plays race to 4, final race to 6, both golden point.
  const qf = stage.matches.find(
    (m) => m.round === 2 && m.entryAId && m.entryBId,
  )!;
  const claimedQf = await claimMatch(user(), qf.id, randomUUID());
  expect(claimedQf.rulesSnapshot).toMatchObject({
    setFormat: "RACE",
    gamesPerSet: 4,
    deuce: "GOLDEN_POINT",
  });
  const final = stage.matches.find((m) => m.round === 4)!;
  await prisma.match.update({
    where: { id: final.id },
    data: { entryAId: qf.entryAId, entryBId: qf.entryBId },
  });
  const claimedFinal = await claimMatch(user(), final.id, randomUUID());
  expect(claimedFinal.rulesSnapshot).toMatchObject({
    setFormat: "RACE",
    gamesPerSet: 6,
    deuce: "GOLDEN_POINT",
  });
}, 120000);
