import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { approveV2, claimMatch, syncActions } from "@/services/v2/scoring";
import { EntryService } from "@/services/entry.service";
import { GET as report } from "@/app/api/v2/tournaments/[id]/results/route";

// Three court referees score three matches of the same group at the same
// time, then the organizer approves all three at once. Nothing may be lost.
let ownerId: string, orgId: string, groupId: string;
const tournamentId = randomUUID();
const referees: string[] = [];
const matches: string[] = [];
const entries: string[] = [];

beforeAll(async () => {
  ownerId = (
    await prisma.user.create({
      data: {
        email: `courts-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Three courts",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Three courts",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    })
  ).id;
  const response = await setup(
    new NextRequest("http://localhost/api/v2/tournaments/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${generateToken({ userId: ownerId, role: "ORGANIZER" })}`,
        "X-Organization-Id": orgId,
      },
      body: JSON.stringify({
        requestId: tournamentId,
        name: "Three courts",
        location: "Venue",
        start: "2026-11-22T01:00:00Z",
        timezone: "Asia/Jakarta",
        category: "Rookie Women",
        courts: 3,
        preset: "TOTAL_4",
        format: "GROUP_KNOCKOUT",
        groups: 1,
        advancePerGroup: 2,
        registrationLater: true,
        slotCount: 4,
        duration: 20,
        rest: 10,
      }),
    }),
  );
  expect(response.status).toBe(201);
  const category = await prisma.category.findFirstOrThrow({
    where: { tournamentId },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId },
    orderBy: { name: "asc" },
  });
  expect(courts).toHaveLength(3);
  for (const n of [1, 2, 3, 4])
    entries.push(
      (
        await EntryService.createEntry({
          categoryId: category.id,
          name: `Court ${n}`,
          playerIds: [],
          playerNames: [`Court ${n} A`, `Court ${n} B`],
          userId: ownerId,
        })
      ).id,
    );
  const stage = await prisma.stage.create({
    data: {
      categoryId: category.id,
      name: "Penyisihan Grup",
      type: "GROUP",
      order: 1,
      config: {},
    },
  });
  groupId = (
    await prisma.group.create({ data: { stageId: stage.id, name: "Grup A" } })
  ).id;
  const pairings: [number, number][] = [
    [0, 1],
    [2, 3],
    [0, 2],
  ];
  for (const [i, court] of courts.entries()) {
    const referee = await prisma.user.create({
      data: {
        email: `court-ref-${randomUUID()}@test.invalid`,
        username: `ref_${randomUUID().slice(0, 8)}`,
        fullName: `Wasit ${court.name}`,
        role: "REFEREE",
        passwordHash: "unusable",
      },
    });
    referees.push(referee.id);
    await prisma.court.update({
      where: { id: court.id },
      data: {
        refereeUserId: referee.id,
        refereeLinkId: randomUUID().slice(0, 16),
      },
    });
    const [a, b] = pairings[i];
    matches.push(
      (
        await prisma.match.create({
          data: {
            stageId: stage.id,
            groupId,
            matchNumber: i + 1,
            round: 1,
            entryAId: entries[a],
            entryBId: entries[b],
            courtId: court.id,
            scheduledAt: new Date(),
            // The desk has read out each start code.
            startUnlockedAt: new Date(),
          },
        })
      ).id,
    );
  }
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "IN_PROGRESS" },
  });
});
afterAll(async () => {
  if (!ownerId) return;
  await prisma.auditLog.deleteMany({
    where: { userId: { in: [ownerId, ...referees] } },
  });
  await prisma.scoringAction.deleteMany({
    where: { matchId: { in: matches } },
  });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  await prisma.user.deleteMany({ where: { id: { in: referees } } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: ownerId } });
});

it("scores three courts at once and keeps every result in the standings", async () => {
  // Each referee opens their own court's match on their own phone.
  const devices = matches.map(() => randomUUID());
  const claimed = await Promise.all(
    matches.map((id, i) =>
      claimMatch({ userId: referees[i], role: "REFEREE" }, id, devices[i]),
    ),
  );
  // Pair A wins 4–0: start, 16 points (4 games, golden point), finalize.
  const script = [
    { type: "START_MATCH", at: Date.now() },
    ...Array.from({ length: 16 }, () => ({ type: "AWARD_POINT", team: "A" })),
    { type: "FINALIZE_MATCH" },
  ];
  // Sent in small batches, interleaved across the three courts.
  await Promise.all(
    matches.map(async (id, i) => {
      let version = claimed[i].version;
      let sequence = 0;
      for (let at = 0; at < script.length; at += 3) {
        const events = script.slice(at, at + 3).map((action) => ({
          id: randomUUID(),
          baseVersion: version++,
          sequence: ++sequence,
          action,
        }));
        await syncActions({ userId: referees[i], role: "REFEREE" }, id, {
          deviceId: devices[i],
          ownershipVersion: claimed[i].ownershipVersion,
          rulesVersion: 2,
          events,
        });
      }
    }),
  );
  const finished = await prisma.match.findMany({
    where: { id: { in: matches } },
    include: { scoreSnapshot: true },
  });
  for (const m of finished) {
    expect(m.status).toBe("FINISHED");
    expect(m.winnerId).toBe(m.entryAId);
    expect(m.scoreSnapshot?.gamesA).toEqual([4]);
    expect(m.scoreSnapshot?.gamesB).toEqual([0]);
  }

  // The organizer approves all three at the same moment.
  const admin = { userId: ownerId, role: "ORGANIZER" as const };
  await Promise.all(matches.map((id) => approveV2(admin, id)));

  const standings = await prisma.standing.findMany({ where: { groupId } });
  const row = (entry: string) => standings.find((s) => s.entryId === entry)!;
  expect(row(entries[0])).toMatchObject({ played: 2, won: 2 });
  expect(row(entries[2])).toMatchObject({ played: 2, won: 1 });
  expect(row(entries[1])).toMatchObject({ played: 1, won: 0 });
  expect(row(entries[3])).toMatchObject({ played: 1, won: 0 });

  // The organizer's report lists all three with score, court and referee.
  const res = await report(
    new NextRequest(
      `http://localhost/api/v2/tournaments/${tournamentId}/results`,
      {
        headers: {
          Authorization: `Bearer ${generateToken({ userId: ownerId, role: "ORGANIZER" })}`,
          "X-Organization-Id": orgId,
        },
      },
    ),
    { params: Promise.resolve({ id: tournamentId }) },
  );
  const rows = (await res.json()).data as {
    id: string;
    sets: number[][];
    state: string;
    winner: string;
    court: string;
    referee: string;
  }[];
  expect(rows).toHaveLength(3);
  for (const r of rows) {
    expect(r).toMatchObject({ sets: [[4, 0]], state: "APPROVED", winner: "A" });
    expect(r.referee).toBe(`Wasit ${r.court}`);
  }
});
