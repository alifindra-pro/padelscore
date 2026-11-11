import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { GET, POST } from "@/app/api/v2/matches/[id]/coin-toss/route";
import { claimMatch, syncActions } from "@/services/v2/scoring";
import { getCoinToss, tossCoin } from "@/services/v2/coin-toss";
import { serviceInfo } from "../../packages/core/src";
let userId: string, orgId: string, token: string, matchId: string;
const tournamentId = randomUUID();
const device = randomUUID();
let ownership = 0,
  version = 0;
const user = () => ({ userId, role: "ORGANIZER" as const });
const request = (path: string, body?: unknown, authenticated = true) =>
  new NextRequest(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": orgId,
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `toss-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Coin toss tester",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Toss test",
        members: { create: { userId, role: "OWNER" } },
      },
    })
  ).id;
  token = generateToken(user());
  const response = await setup(
    request("/api/v2/tournaments/setup", {
      requestId: tournamentId,
      name: "Toss test",
      location: "Court",
      start: "2026-11-12T01:00:00Z",
      timezone: "Asia/Jakarta",
      category: "Open",
      courts: 1,
      preset: "POINTS",
      format: "SINGLE_ELIMINATION",
      pairs: [
        ["Toss A1", "Toss A2"],
        ["Toss B1", "Toss B2"],
      ],
      duration: 30,
      rest: 10,
    }),
  );
  expect(response.status).toBe(201);
  matchId = (
    await prisma.match.findFirstOrThrow({
      where: {
        stage: { category: { tournamentId } },
        entryAId: { not: null },
        entryBId: { not: null },
      },
    })
  ).id;
  const claimed = await claimMatch(user(), matchId, device);
  ownership = claimed.ownershipVersion;
  version = claimed.version;
});
afterAll(async () => {
  if (!userId) return;
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.scoringAction.deleteMany({ where: { matchId } });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});
it("protects toss access and creates exactly one durable result for concurrent requests", async () => {
  const path = `/api/v2/matches/${matchId}/coin-toss`;
  const ctx = { params: Promise.resolve({ id: matchId }) };
  expect((await GET(request(path, undefined, false), ctx)).status).toBe(401);
  expect(
    (
      await POST(
        request(path, { deviceId: "wrong", ownershipVersion: ownership }),
        ctx,
      )
    ).status,
  ).toBe(409);
  await expect(
    tossCoin(
      { userId: randomUUID(), role: "REFEREE" },
      matchId,
      device,
      ownership,
    ),
  ).rejects.toThrow("penugasan");
  const responses = await Promise.all([
    POST(request(path, { deviceId: device, ownershipVersion: ownership }), ctx),
    POST(request(path, { deviceId: device, ownershipVersion: ownership }), ctx),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  const results = await Promise.all(responses.map((r) => r.json()));
  expect(results[0]).toEqual(results[1]);
  expect(["A", "B"]).toContain(results[0].data.winner);
  expect(results[0].data.face).toBe(
    results[0].data.winner === "A" ? "KEPALA" : "EKOR",
  );
  expect(
    await prisma.auditLog.count({
      where: { entityId: matchId, action: "COIN_TOSS" },
    }),
  ).toBe(1);
  expect(
    (await prisma.match.findUniqueOrThrow({ where: { id: matchId } }))
      .coinToss,
  ).toEqual(results[0].data);
  expect((await (await GET(request(path), ctx)).json()).data).toEqual(
    results[0].data,
  );
}, 60000);
it("validates the decision, starts with the selected receiver opponent serving, and prevents rerolls", async () => {
  const toss = (await getCoinToss(user(), matchId))!;
  // The match row is the source of truth; pruning the audit trail must not unlock the toss rule.
  await prisma.auditLog.deleteMany({
    where: { entityId: matchId, action: "COIN_TOSS" },
  });
  const first = toss.winner === "A" ? "B" : "A";
  const order =
    first === "A" ? ["A2", "B2", "A1", "B1"] : ["B2", "A2", "B1", "A1"];
  const send = (serviceOrder: string[], tossChoice?: string) =>
    syncActions(user(), matchId, {
      deviceId: device,
      ownershipVersion: ownership,
      rulesVersion: 2,
      events: [
        {
          id: randomUUID(),
          sequence: 1,
          baseVersion: version,
          action: {
            type: "START_MATCH",
            at: Date.now(),
            serviceOrder,
            ...(tossChoice ? { tossChoice } : {}),
          },
        },
      ],
    });
  await expect(send(order)).rejects.toThrow("konfirmasi");
  await expect(send(order, "SERVE")).rejects.toThrow("tidak sesuai");
  const result = await send(order, "RECEIVE");
  expect(serviceInfo(result.state).team).toBe(first);
  expect(serviceInfo(result.state).server).toBe(`${first}2`);
  await expect(tossCoin(user(), matchId, device, ownership)).rejects.toThrow(
    "sebelum pertandingan",
  );
  expect(await getCoinToss(user(), matchId)).toEqual(toss);
  await claimMatch(user(), matchId, randomUUID(), true);
  expect(await getCoinToss(user(), matchId)).toEqual(toss);
}, 60000);
