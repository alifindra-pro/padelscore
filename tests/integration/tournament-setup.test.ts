import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { GET as resultPdf } from "@/app/api/v2/matches/[id]/result.pdf/route";
import {
  GET as publicGet,
  POST as socialPost,
} from "@/app/api/v2/[...path]/route";
import { claimMatch, syncActions, approveV2 } from "@/services/v2/scoring";

const suffix = randomUUID();
let userId: string;
let orgId: string;
let token: string;
const created: string[] = [];
function payload(count = 3, format = "SINGLE_ELIMINATION") {
  const requestId = randomUUID();
  created.push(requestId);
  return {
    requestId,
    name: `Setup ${suffix}`,
    location: "Venue uji",
    start: "2026-11-01T00:00:00.000Z",
    timezone: "Asia/Makassar",
    category: "Ganda terbuka",
    courts: 2,
    preset: "SINGLE",
    format,
    pairs: Array.from({ length: count }, (_, i) => [
      `Pemain ${i} A`,
      `Pemain ${i} B`,
    ]),
    duration: 60,
    rest: 30,
  };
}
function request(body: unknown, auth = token) {
  return new NextRequest("http://localhost/api/v2/tournaments/setup", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth}`,
      "X-Organization-Id": orgId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
function pdf(id: string, auth = "") {
  return resultPdf(
    new NextRequest(`http://localhost/api/v2/matches/${id}/result.pdf`, {
      headers: { Authorization: `Bearer ${auth}` },
    }),
    { params: Promise.resolve({ id }) },
  );
}
async function matches(id: string) {
  return prisma.match.findMany({
    where: { stage: { category: { tournamentId: id } } },
    orderBy: { matchNumber: "asc" },
  });
}

describe("Quick setup and approved PDF integration", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `setup-${suffix}@test.invalid`,
        username: `setup-${suffix}`,
        fullName: "Pengelola uji",
        passwordHash: "unusable-test-hash",
        role: "ORGANIZER",
      },
    });
    userId = user.id;
    token = generateToken({ userId, role: "ORGANIZER" });
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Setup test ${suffix}`,
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (userId) await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.scoringAction.deleteMany({
      where: {
        match: { stage: { category: { tournamentId: { in: created } } } },
      },
    });
    await prisma.tournament.deleteMany({ where: { id: { in: created } } });
    await prisma.socialEvent.deleteMany({ where: { id: { in: created } } });
    if (orgId) {
      await prisma.player.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("requires authentication and rejects duplicate players without partial writes", async () => {
    const body = payload();
    expect((await setup(request(body, ""))).status).toBe(401);
    body.pairs[1][0] = body.pairs[0][0].toUpperCase();
    expect((await setup(request(body))).status).toBe(400);
    expect(
      await prisma.tournament.count({ where: { id: body.requestId } }),
    ).toBe(0);
    expect(
      await prisma.player.count({ where: { organizationId: orgId } }),
    ).toBe(0);
  });

  it("serializes concurrent retries, resolves byes, and schedules the final after rest", async () => {
    const body = payload();
    const responses = await Promise.all([
      setup(request(body)),
      setup(request(body)),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const list = await matches(body.requestId);
    expect(list).toHaveLength(3);
    expect(list.filter((m) => m.status === "APPROVED")).toHaveLength(1);
    const semi = list.find((m) => m.round === 1 && m.status === "SCHEDULED")!;
    const final = list.find((m) => m.round === 2)!;
    expect(final.entryAId || final.entryBId).toBeTruthy();
    expect(final.scheduledAt!.getTime()).toBeGreaterThanOrEqual(
      semi.estimatedEndAt!.getTime() + 30 * 60000,
    );
    expect(
      await prisma.player.count({ where: { organizationId: orgId } }),
    ).toBe(6);
    expect(
      (await setup(request({ ...body, name: "Changed after success" }))).status,
    ).toBe(409);
  });

  it("creates distinct round-robin rounds with no overlapping player or court reservations", async () => {
    const body = { ...payload(4, "ROUND_ROBIN"), deuce: "GOLDEN_POINT" };
    expect((await setup(request(body))).status).toBe(201);
    const list = await matches(body.requestId);
    expect(list).toHaveLength(6);
    const category = await prisma.category.findFirstOrThrow({
      where: { tournamentId: body.requestId },
    });
    expect(category.rulesV2).toMatchObject({ deuce: "GOLDEN_POINT" });
    expect(new Set(list.map((m) => m.round)).size).toBe(3);
    expect(
      new Set(list.map((m) => [m.entryAId, m.entryBId].sort().join("/"))).size,
    ).toBe(6);
    for (const [i, a] of list.entries())
      for (const b of list.slice(i + 1)) {
        const samePlayer = [a.entryAId, a.entryBId].some(
          (id) => id === b.entryAId || id === b.entryBId,
        );
        if (samePlayer || a.courtId === b.courtId) {
          const [first, second] =
            a.scheduledAt! <= b.scheduledAt! ? [a, b] : [b, a];
          expect(second.scheduledAt!.getTime()).toBeGreaterThanOrEqual(
            first.estimatedEndAt!.getTime() + (samePlayer ? 30 * 60000 : 0),
          );
        }
      }
    const event = await prisma.tournament.findUniqueOrThrow({
      where: { id: body.requestId },
    });
    expect(event.status).toBe("DRAFT");
    expect(event.endDate.getTime()).toBe(
      Math.max(...list.map((m) => m.estimatedEndAt!.getTime())),
    );
  });

  it.each(["AMERICANO", "MEXICANO"])(
    "creates %s with point settings, first round, metadata and safe retries",
    async (format) => {
      const body = {
        ...payload(),
        format,
        players: [
          "Andi Uno",
          "Budi Dua",
          "Citra Tiga",
          "Deni Empat",
          "Eka Lima",
        ],
        target: 24,
        rounds: 3,
        ranking: "TOTAL",
        pairing: "BALANCED",
      };
      const before = await prisma.player.count({
        where: { organizationId: orgId },
      });
      const responses = await Promise.all([
        setup(request(body)),
        setup(request(body)),
      ]);
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect((await responses[0].json()).data).toEqual({
        id: body.requestId,
        kind: "SOCIAL",
      });
      const event = await prisma.socialEvent.findUniqueOrThrow({
        where: { id: body.requestId },
      });
      expect(event.published).toBe(false);
      expect(event.config).toMatchObject({
        target: 24,
        rounds: 3,
        ranking: "TOTAL",
        location: body.location,
        start: body.start,
        timezone: body.timezone,
      });
      expect(event.rounds).toMatchObject([
        {
          number: 1,
          matches: [{ scoreA: null, scoreB: null, approved: false }],
        },
      ]);
      expect(
        (event.rounds as { waiting: unknown[] }[])[0].waiting,
      ).toHaveLength(1);
      expect(
        await prisma.player.count({ where: { organizationId: orgId } }),
      ).toBe(before + 5);
      expect((await setup(request({ ...body, target: 32 }))).status).toBe(409);
      const score = async (scoreA: number, scoreB: number) =>
        socialPost(
          new NextRequest(
            `http://localhost/api/v2/social/${event.id}/results`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                version: 0,
                round: 1,
                court: 1,
                scoreA,
                scoreB,
              }),
            },
          ),
          {
            params: Promise.resolve({ path: ["social", event.id, "results"] }),
          },
        );
      expect((await score(20, 5)).status).toBe(400);
      expect((await score(15, 9)).status).toBe(200);
      const result = await publicGet(
        new NextRequest(`http://localhost/api/v2/social/${event.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        { params: Promise.resolve({ path: ["social", event.id] }) },
      );
      const board = (await result.json()).data.leaderboard as {
        played: number;
        points: number;
      }[];
      expect(board.filter((row) => row.points === 15)).toHaveLength(2);
      expect(board.filter((row) => row.points === 9)).toHaveLength(2);
      expect(board.filter((row) => row.played === 0)).toHaveLength(1);
    },
  );

  it("rejects invalid social settings and repeated player names without partial writes", async () => {
    const body = {
      ...payload(),
      format: "AMERICANO",
      players: ["Andi", "Budi", "Citra", "Deni"],
      target: 32,
      rounds: 4,
      ranking: "AVERAGE",
      pairing: "BALANCED",
    };
    const before = await prisma.player.count({
      where: { organizationId: orgId },
    });
    for (const change of [
      { target: 0 },
      { target: 201 },
      { rounds: 0 },
      { ranking: "INVALID" },
      { players: ["Andi", "andi", "Citra", "Deni"] },
      { players: ["Andi", "Budi"] },
    ]) {
      expect((await setup(request({ ...body, ...change }))).status).toBe(400);
    }
    expect(
      await prisma.player.count({ where: { organizationId: orgId } }),
    ).toBe(before);
    expect(
      await prisma.socialEvent.count({ where: { id: body.requestId } }),
    ).toBe(0);
  });

  it("keeps draft scores private and exposes PDF only after finalization and approval", async () => {
    const body = payload(2);
    expect((await setup(request(body))).status).toBe(201);
    const [match] = await matches(body.requestId);
    expect((await pdf(match.id)).status).toBe(404);
    expect((await pdf(match.id, token)).status).toBe(409);
    const user = { userId, role: "ORGANIZER" as const };
    const deviceId = randomUUID();
    const claim = await claimMatch(user, match.id, deviceId);
    const actions = [
      { type: "START_MATCH", at: Date.now() },
      ...Array.from({ length: 24 }, () => ({ type: "AWARD_POINT", team: "A" })),
      { type: "FINALIZE_MATCH" },
    ];
    await syncActions(user, match.id, {
      rulesVersion: 2,
      deviceId,
      ownershipVersion: claim.ownershipVersion,
      events: actions.map((action, i) => ({
        id: randomUUID(),
        sequence: i + 1,
        baseVersion: i,
        action,
      })),
    });
    expect((await pdf(match.id, token)).status).toBe(409);
    await approveV2(user, match.id);
    const privatePdf = await pdf(match.id, token);
    expect(privatePdf.status).toBe(200);
    expect((await pdf(match.id)).status).toBe(404);
    await prisma.tournament.update({
      where: { id: body.requestId },
      data: { status: "PUBLISHED" },
    });
    const publicResponse = await publicGet(
      new NextRequest(`http://localhost/api/v2/public/matches/${match.id}`),
      { params: Promise.resolve({ path: ["public", "matches", match.id] }) },
    );
    const { data } = await publicResponse.json();
    expect(data.approvalStatus).toBe("APPROVED");
    expect(data.scoreSnapshot.gamesA).toEqual([6]);
    expect(data.stage.category.tournament.timezone).toBe("Asia/Makassar");
    const response = await pdf(match.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const document = await PDFDocument.load(await response.arrayBuffer());
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(document.getTitle()).toContain(body.name);
  });
});
