import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import {
  GET as desk,
  PATCH as setWindow,
  POST as mark,
} from "@/app/api/v2/categories/[id]/check-in/route";
import { POST as checkIn } from "@/app/api/v2/check-in/[categoryId]/route";
import { EntryService } from "@/services/entry.service";
import { qrToken, QR_WINDOW_MS } from "@/lib/check-in";

let userId: string, orgId: string, token: string, categoryId: string;
const tournamentId = randomUUID();
const adminReq = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/v2/categories/${categoryId}/check-in`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": orgId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const publicReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/v2/check-in/${categoryId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const adminCtx = () => ({ params: Promise.resolve({ id: categoryId }) });
const publicCtx = () => ({ params: Promise.resolve({ categoryId }) });

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `checkin-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Check-in organizer",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Check-in",
        members: { create: { userId, role: "OWNER" } },
      },
    })
  ).id;
  token = generateToken({ userId, role: "ORGANIZER" });
  const response = await setup(
    new NextRequest("http://localhost/api/v2/tournaments/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": orgId,
      },
      body: JSON.stringify({
        requestId: tournamentId,
        name: "Check-in test",
        location: "Court",
        start: "2026-11-22T01:00:00Z",
        timezone: "Asia/Jakarta",
        category: "Rookie Men",
        courts: 1,
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
  categoryId = (
    await prisma.category.findFirstOrThrow({ where: { tournamentId } })
  ).id;
  for (const n of [1, 2])
    await EntryService.createEntry({
      categoryId,
      name: `Men ${n} A / Men ${n} B`,
      playerIds: [],
      playerNames: [`Men ${n} A`, `Men ${n} B`],
      userId,
    });
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "PUBLISHED" },
  });
});
afterAll(async () => {
  if (!userId) return;
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});

it("keeps check-in closed until the organizer opens it", async () => {
  const res = await checkIn(
    publicReq({ action: "open", token: qrToken(categoryId).token }),
    publicCtx(),
  );
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("belum dibuka");
  const view = (await (await desk(adminReq("GET"), adminCtx())).json()).data;
  expect(view.state).toBe("NOT_OPEN");
  expect(view.qr).toBeNull();
});

it("checks a player in with the live QR and keeps the first time", async () => {
  const opened = await setWindow(
    adminReq("PATCH", {
      opensAt: new Date(Date.now() - 60_000).toISOString(),
      closesAt: null,
    }),
    adminCtx(),
  );
  expect(opened.status).toBe(200);
  const view = (await (await desk(adminReq("GET"), adminCtx())).json()).data;
  expect(view.state).toBe("OPEN");
  expect(view.entries).toHaveLength(2);

  // A code from two windows ago (a forwarded photo) is refused.
  const stale = await checkIn(
    publicReq({
      action: "open",
      token: qrToken(categoryId, Date.now() - 2 * QR_WINDOW_MS).token,
    }),
    publicCtx(),
  );
  expect(stale.status).toBe(403);

  const session = (
    await (
      await checkIn(
        publicReq({ action: "open", token: view.qr.token }),
        publicCtx(),
      )
    ).json()
  ).data;
  expect(session.category).toBe("Rookie Men");
  const entry = session.entries[0];
  const player = entry.players[0];
  expect(player.checkedIn).toBe(false);
  // The list for players carries names only, no contact details.
  expect(Object.keys(player).sort()).toEqual(["checkedIn", "fullName", "id"]);

  const confirm = (pass: string) =>
    checkIn(
      publicReq({
        action: "confirm",
        pass,
        entryId: entry.id,
        playerId: player.id,
      }),
      publicCtx(),
    );
  expect((await confirm("1.forged")).status).toBe(403);
  const first = (await (await confirm(session.pass)).json()).data;
  expect(first).toMatchObject({ name: player.fullName, already: false });
  const second = (await (await confirm(session.pass)).json()).data;
  expect(second.already).toBe(true);
  expect(second.checkedInAt).toBe(first.checkedInAt);

  // A player from another category cannot be checked in here.
  const wrong = await checkIn(
    publicReq({
      action: "confirm",
      pass: session.pass,
      entryId: entry.id,
      playerId: randomUUID(),
    }),
    publicCtx(),
  );
  expect(wrong.status).toBe(404);
});

it("lets the organizer mark and undo, and closes self check-in", async () => {
  const entry = await prisma.entry.findFirstOrThrow({
    where: { categoryId },
    include: { players: true },
    orderBy: { createdAt: "desc" },
  });
  const playerId = entry.players[0].playerId;
  expect(
    (
      await mark(
        adminReq("POST", { entryId: entry.id, playerId, present: true }),
        adminCtx(),
      )
    ).status,
  ).toBe(200);
  let row = await prisma.entryPlayer.findFirstOrThrow({
    where: { entryId: entry.id, playerId },
  });
  expect(row.checkInMethod).toBe("MANUAL");
  await mark(
    adminReq("POST", { entryId: entry.id, playerId, present: false }),
    adminCtx(),
  );
  row = await prisma.entryPlayer.findFirstOrThrow({
    where: { entryId: entry.id, playerId },
  });
  expect(row.checkedInAt).toBeNull();

  // Closing time must come after opening time.
  expect(
    (
      await setWindow(
        adminReq("PATCH", {
          opensAt: new Date().toISOString(),
          closesAt: new Date(Date.now() - 3_600_000).toISOString(),
        }),
        adminCtx(),
      )
    ).status,
  ).toBe(400);

  await setWindow(
    adminReq("PATCH", {
      opensAt: new Date(Date.now() - 3_600_000).toISOString(),
      closesAt: new Date(Date.now() - 1_000).toISOString(),
    }),
    adminCtx(),
  );
  const late = await checkIn(
    publicReq({ action: "open", token: qrToken(categoryId).token }),
    publicCtx(),
  );
  expect(late.status).toBe(409);
  expect((await late.json()).error.message).toContain("ditutup");

  // Anonymous visitors cannot read the organizer desk.
  const anon = await desk(
    new NextRequest(
      `http://localhost/api/v2/categories/${categoryId}/check-in`,
    ),
    adminCtx(),
  );
  expect(anon.status).toBe(401);
});
