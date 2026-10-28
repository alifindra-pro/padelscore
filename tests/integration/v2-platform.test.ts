import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import prisma from "../../src/lib/db";
import { generateToken, hashPassword } from "../../src/lib/auth";
import { GET, POST } from "../../src/app/api/v2/[...path]/route";
import { GET as legacyTournament } from "../../src/app/api/v1/tournaments/[id]/route";
import { GET as legacyList } from "../../src/app/api/v1/tournaments/route";
import { POST as registration } from "../../src/app/api/v1/auth/register/route";
import { PRESETS } from "../../packages/core/src";
import { randomUUID } from "node:crypto";
const suffix = randomUUID();
let owner: string,
  outsider: string,
  referee: string,
  org: string,
  tournament: string,
  category: string,
  match: string;
let ownerToken: string, otherToken: string, refToken: string;
const device = randomUUID();
let claim: { ownershipVersion: number };
function call(path: string, token: string, body?: unknown) {
  const req = new NextRequest(`http://localhost/api/v2/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (body === undefined ? GET : POST)(req, {
    params: Promise.resolve({ path: path.split("/") }),
  });
}
describe("V2 organization, privacy and offline scoring integration", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(
      "test-only-password-not-for-production",
    );
    owner = (
      await prisma.user.create({
        data: {
          email: `owner-${suffix}@test.invalid`,
          username: `o${suffix}`,
          fullName: "Admin A",
          role: "ORGANIZER",
          passwordHash,
        },
      })
    ).id;
    outsider = (
      await prisma.user.create({
        data: {
          email: `other-${suffix}@test.invalid`,
          username: `x${suffix}`,
          fullName: "Admin B",
          role: "ORGANIZER",
          passwordHash,
        },
      })
    ).id;
    referee = (
      await prisma.user.create({
        data: {
          email: `ref-${suffix}@test.invalid`,
          username: `r${suffix}`,
          fullName: "Wasit",
          role: "REFEREE",
          passwordHash,
        },
      })
    ).id;
    org = (
      await prisma.organization.create({
        data: {
          name: `Test ${suffix}`,
          features: { scoringV2: true },
          members: {
            create: [
              { userId: owner, role: "OWNER" },
              { userId: referee, role: "REFEREE" },
            ],
          },
        },
      })
    ).id;
    tournament = (
      await prisma.tournament.create({
        data: {
          name: "Private Event",
          slug: suffix,
          organizationId: org,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000),
          members: { create: { userId: owner, role: "OWNER" } },
        },
      })
    ).id;
    category = (
      await prisma.category.create({
        data: {
          tournamentId: tournament,
          name: "Open",
          format: "SINGLE_ELIMINATION",
          rulesV2: JSON.parse(JSON.stringify(PRESETS.SINGLE)),
        },
      })
    ).id;
    const stage = await prisma.stage.create({
      data: {
        categoryId: category,
        name: "Final",
        type: "SINGLE_ELIMINATION",
        order: 1,
        config: {},
      },
    });
    const a = await prisma.entry.create({
      data: { categoryId: category, name: "Team A" },
    });
    const b = await prisma.entry.create({
      data: { categoryId: category, name: "Team B" },
    });
    match = (
      await prisma.match.create({
        data: {
          stageId: stage.id,
          round: 1,
          matchNumber: 1,
          entryAId: a.id,
          entryBId: b.id,
        },
      })
    ).id;
    ownerToken = generateToken({ userId: owner, role: "ORGANIZER" });
    otherToken = generateToken({ userId: outsider, role: "ORGANIZER" });
    refToken = generateToken({ userId: referee, role: "REFEREE" });
  });
  afterAll(async () => {
    if (tournament) {
      await prisma.scoringAction.deleteMany({ where: { matchId: match } });
      await prisma.tournament.delete({ where: { id: tournament } });
    }
    if (org) await prisma.organization.delete({ where: { id: org } });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [owner, outsider, referee].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, outsider, referee].filter(Boolean) } },
    });
  });
  it("rejects self registration", async () => {
    expect((await registration()).status).toBe(403);
  });
  it("denies cross-organization match writes", async () => {
    expect(
      (await call(`matches/${match}/claim`, otherToken, { deviceId: device }))
        .status,
    ).toBe(403);
  });
  it("referee requires assignment", async () => {
    expect(
      (await call(`matches/${match}/claim`, refToken, { deviceId: device }))
        .status,
    ).toBe(403);
    await prisma.matchOfficial.create({
      data: { matchId: match, userId: referee },
    });
  });
  it("private event cannot be viewed anonymously or by another organizer", async () => {
    const req = new NextRequest(
      `http://localhost/api/v1/tournaments/${tournament}`,
    );
    expect(
      (
        await legacyTournament(req, {
          params: Promise.resolve({ id: tournament }),
        })
      ).status,
    ).toBe(404);
    const other = new NextRequest(req.url, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(
      (
        await legacyTournament(other, {
          params: Promise.resolve({ id: tournament }),
        })
      ).status,
    ).toBe(404);
  });
  it("legacy adapter allows authorized listing and detail", async () => {
    const headers = { Authorization: `Bearer ${ownerToken}` };
    const list = await legacyList(
      new NextRequest("http://localhost/api/v1/tournaments", { headers }),
      undefined,
    );
    expect(list.status).toBe(200);
    expect(JSON.stringify(await list.json())).toContain(tournament);
    const detail = await legacyTournament(
      new NextRequest(`http://localhost/api/v1/tournaments/${tournament}`, {
        headers,
      }),
      { params: Promise.resolve({ id: tournament }) },
    );
    expect(detail.status).toBe(200);
  });
  it("a status query cannot expose draft tournaments publicly", async () => {
    const response = await legacyList(
      new NextRequest("http://localhost/api/v1/tournaments?status=DRAFT"),
      undefined,
    );
    expect(JSON.stringify(await response.json())).not.toContain(tournament);
  });
  it("claims match and freezes rules", async () => {
    const res = await call(`matches/${match}/claim`, refToken, {
      deviceId: device,
    });
    expect(res.status).toBe(200);
    claim = (await res.json()).data;
    await prisma.category.update({
      where: { id: category },
      data: { rulesV2: JSON.parse(JSON.stringify(PRESETS.SHORT)) },
    });
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match } });
    expect((m.rulesSnapshot as { gamesPerSet: number }).gamesPerSet).toBe(6);
  });
  const startId = randomUUID();
  const startAction = { type: "START_MATCH", at: Date.now() };
  it("accepts an offline batch and replays integer scores", async () => {
    const res = await call(`matches/${match}/actions`, refToken, {
      deviceId: device,
      ownershipVersion: claim.ownershipVersion,
      rulesVersion: 2,
      events: [
        { id: startId, baseVersion: 0, sequence: 1, action: startAction },
        {
          id: randomUUID(),
          baseVersion: 1,
          sequence: 2,
          action: { type: "AWARD_POINT", team: "A" },
        },
      ],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.state.points).toEqual([1, 0]);
    expect(data.version).toBe(2);
  });
  it("duplicate retransmission does not score twice", async () => {
    const res = await call(`matches/${match}/actions`, refToken, {
      deviceId: device,
      ownershipVersion: claim.ownershipVersion,
      rulesVersion: 2,
      events: [
        { id: startId, baseVersion: 0, sequence: 1, action: startAction },
      ],
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.version).toBe(2);
  });
  it("rejects out-of-order events atomically", async () => {
    const res = await call(`matches/${match}/actions`, refToken, {
      deviceId: device,
      ownershipVersion: claim.ownershipVersion,
      rulesVersion: 2,
      events: [
        {
          id: randomUUID(),
          baseVersion: 2,
          sequence: 4,
          action: { type: "AWARD_POINT", team: "B" },
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(
      await prisma.scoringAction.count({ where: { matchId: match } }),
    ).toBe(2);
  });
  it("admin takeover fences off old offline queues", async () => {
    const takeover = await call(`matches/${match}/claim`, ownerToken, {
      deviceId: randomUUID(),
      takeover: true,
    });
    expect(takeover.status).toBe(200);
    const res = await call(`matches/${match}/actions`, refToken, {
      deviceId: device,
      ownershipVersion: claim.ownershipVersion,
      rulesVersion: 2,
      events: [
        {
          id: randomUUID(),
          baseVersion: 2,
          sequence: 3,
          action: { type: "AWARD_POINT", team: "A" },
        },
      ],
    });
    expect(res.status).toBe(409);
  });
  it("public view exposes scores only after publication", async () => {
    expect((await call(`public/matches/${match}`, "")).status).toBe(404);
    await prisma.tournament.update({
      where: { id: tournament },
      data: { status: "PUBLISHED" },
    });
    const res = await call(`public/matches/${match}`, "");
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("deviceId");
    expect(text).not.toContain("organizationId");
  });
});
