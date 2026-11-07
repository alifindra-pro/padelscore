import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { POST as dispatch } from "@/app/api/v2/[...path]/route";
import {
  POST as upload,
  GET as photo,
  DELETE as remove,
} from "@/app/api/v2/players/[id]/photo/route";
import { refreshGroupStandings } from "@/services/v2/standings";
import { deleteAvatar } from "@/services/v2/storage";
let userId: string, orgId: string, token: string;
const tournaments: string[] = [];
function req(path: string, body?: unknown, method = "POST", auth = token) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "X-Organization-Id": orgId,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function payload(n = 8) {
  const id = randomUUID();
  tournaments.push(id);
  return {
    requestId: id,
    name: "Group test",
    location: "Court",
    start: "2026-11-10T00:00:00Z",
    timezone: "Asia/Jakarta",
    category: "Open",
    courts: 2,
    preset: "POINTS",
    totalPoints: 24,
    format: "GROUP_KNOCKOUT",
    groups: 2,
    advancePerGroup: 2,
    pairs: Array.from({ length: n }, (_, i) => [
      `Player ${i} A`,
      `Player ${i} B`,
    ]),
    duration: 30,
    rest: 10,
  };
}
beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `groups-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Group test",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  token = generateToken({ userId, role: "ORGANIZER" });
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Group profile test",
        members: { create: { userId, role: "OWNER" } },
      },
    })
  ).id;
});
afterAll(async () => {
  if (!orgId) return;
  const players = await prisma.player.findMany({
    where: { organizationId: orgId },
  });
  for (const p of players) if (p.photoKey) await deleteAvatar(p.photoKey);
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournaments } } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});
it("creates balanced groups, requires approvals, then draws cross-group knockout once", async () => {
  const body = payload();
  expect(
    (await setup(req("/api/v2/tournaments/setup", { ...body, groups: 5 })))
      .status,
  ).toBe(400);
  expect((await setup(req("/api/v2/tournaments/setup", body))).status).toBe(
    201,
  );
  const category = await prisma.category.findFirstOrThrow({
    where: { tournamentId: body.requestId },
  });
  const pools = await prisma.group.findMany({
    where: { stage: { categoryId: category.id } },
    include: { matches: true },
  });
  expect(pools).toHaveLength(2);
  expect(pools.every((g) => g.matches.length === 6)).toBe(true);
  const qualify = () =>
    dispatch(req(`/api/v2/categories/${category.id}/qualify`, {}), {
      params: Promise.resolve({ path: ["categories", category.id, "qualify"] }),
    });
  expect((await qualify()).status).toBe(409);
  const groupOf = new Map<string, string>();
  for (const g of pools) {
    for (const m of g.matches) {
      groupOf.set(m.entryAId!, g.id);
      groupOf.set(m.entryBId!, g.id);
      const a = m.entryAId! < m.entryBId!;
      await prisma.match.update({
        where: { id: m.id },
        data: {
          status: "APPROVED",
          approvalStatus: "APPROVED",
          winnerId: a ? m.entryAId : m.entryBId,
          scoreSnapshot: {
            create: {
              pointsA: a ? "15" : "9",
              pointsB: a ? "9" : "15",
              setsA: 0,
              setsB: 0,
              gamesA: [],
              gamesB: [],
            },
          },
        },
      });
    }
    await prisma.$transaction((tx) => refreshGroupStandings(tx, g.id));
  }
  const rows = await prisma.standing.findMany({
    where: { groupId: { in: pools.map((g) => g.id) } },
  });
  expect(rows.some((r) => r.gamesWon > 0)).toBe(true);
  expect(
    (await Promise.all([qualify(), qualify()])).map((r) => r.status).sort(),
  ).toEqual([201, 409]);
  const stage = await prisma.stage.findFirstOrThrow({
    where: { categoryId: category.id, type: "SINGLE_ELIMINATION" },
    include: { matches: true },
  });
  expect(stage.matches).toHaveLength(3);
  for (const m of stage.matches.filter((m) => m.round === 1))
    expect(groupOf.get(m.entryAId!)).not.toBe(groupOf.get(m.entryBId!));
}, 60000);
it("keeps an individual identity and photo when their partner changes; blocks foreign IDs", async () => {
  const existing = await prisma.player.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  const body = payload(4);
  body.pairs[0] = [existing.fullName, "New Partner"];
  body.pairs[1] = ["Other Alpha", "Other Beta"];
  body.pairs[2] = ["Other Gamma", "Other Delta"];
  body.pairs[3] = ["Other Epsilon", "Other Zeta"];
  const ids = [
    [existing.id, null],
    [null, null],
    [null, null],
    [null, null],
  ];
  expect(
    (
      await setup(
        req("/api/v2/tournaments/setup", {
          ...body,
          playerIds: [[randomUUID(), null], ...ids.slice(1)],
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    (await setup(req("/api/v2/tournaments/setup", { ...body, playerIds: ids })))
      .status,
  ).toBe(201);
  expect(
    await prisma.entryPlayer.count({ where: { playerId: existing.id } }),
  ).toBe(2);
  const ctx = { params: Promise.resolve({ id: existing.id }) };
  const path = `/api/v2/players/${existing.id}/photo`;
  const png = await sharp({
    create: { width: 100, height: 180, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("photo", new File([png], "avatar.png", { type: "image/png" }));
  expect(
    (
      await upload(
        new NextRequest("http://localhost" + path, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Organization-Id": orgId,
          },
          body: form,
        }),
        ctx,
      )
    ).status,
  ).toBe(200);
  expect((await photo(req(path, undefined, "GET", ""), ctx)).status).toBe(404);
  const response = await photo(req(path, undefined, "GET"), ctx);
  expect(response.status).toBe(200);
  const meta = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  expect([meta.width, meta.height, meta.format]).toEqual([512, 512, "webp"]);
  await prisma.tournament.update({
    where: { id: body.requestId },
    data: { status: "PUBLISHED" },
  });
  expect((await photo(req(path, undefined, "GET", ""), ctx)).status).toBe(200);
  expect((await remove(req(path, undefined, "DELETE"), ctx)).status).toBe(200);
  expect((await photo(req(path, undefined, "GET"), ctx)).status).toBe(404);
}, 60000);
it("preserves three groups on redraw without creating knockout early", async () => {
  const body = { ...payload(6), groups: 3, advancePerGroup: 1 };
  expect((await setup(req("/api/v2/tournaments/setup", body))).status).toBe(
    201,
  );
  const category = await prisma.category.findFirstOrThrow({
    where: { tournamentId: body.requestId },
  });
  const response = await dispatch(
    req(`/api/v2/categories/${category.id}/draw`, { mode: "RANDOM" }),
    { params: Promise.resolve({ path: ["categories", category.id, "draw"] }) },
  );
  expect(response.status).toBe(201);
  expect(
    await prisma.group.count({ where: { stage: { categoryId: category.id } } }),
  ).toBe(3);
  expect(
    await prisma.stage.count({
      where: { categoryId: category.id, type: "SINGLE_ELIMINATION" },
    }),
  ).toBe(0);
});
