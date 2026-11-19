import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import {
  GET as listDisputes,
  POST as submit,
} from "@/app/api/v2/tournaments/[id]/disputes/route";
import { EntryService } from "@/services/entry.service";

let userId: string, orgId: string, token: string, categoryId: string;
const tournamentId = randomUUID();
const ctx = { params: Promise.resolve({ id: tournamentId }) };
const request = (body?: unknown, auth = false, ip = "203.0.113.20") =>
  new NextRequest(
    `http://localhost/api/v2/tournaments/${tournamentId}/disputes`,
    {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
        ...(auth
          ? { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
const objection = (entryId: string, contact = "0812 0000 1111") => ({
  entryId,
  reporterName: "Penonton",
  contact,
  reason: "Pasangan ini pernah juara 2 di turnamen fix partner bulan lalu.",
});

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `objection-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Objection organizer",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Objection",
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
        name: "Objection test",
        location: "Court",
        start: "2026-11-22T01:00:00Z",
        timezone: "Asia/Jakarta",
        category: "Rookie Women",
        courts: 1,
        preset: "TOTAL_4",
        format: "GROUP_KNOCKOUT",
        groups: 2,
        advancePerGroup: 1,
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
  for (const n of [1, 2, 3, 4])
    await EntryService.createEntry({
      categoryId,
      name: `Pair ${n} A / Pair ${n} B`,
      playerIds: [],
      playerNames: [`Pair ${n} A`, `Pair ${n} B`],
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

it("takes an objection to a pair before the draw and shows it to organizers", async () => {
  const entry = await prisma.entry.findFirstOrThrow({ where: { categoryId } });
  const first = await submit(request(objection(entry.id)), ctx);
  expect(first.status).toBe(201);
  expect((await first.json()).data.receipt).toMatch(/^[a-f0-9]{64}$/);
  // The same contact cannot stack objections on the same pair while one is pending.
  expect((await submit(request(objection(entry.id)), ctx)).status).toBe(409);
  // An objection must name exactly one target.
  expect(
    (
      await submit(
        request({ ...objection(entry.id), matchId: randomUUID() }),
        ctx,
      )
    ).status,
  ).toBe(400);
  const list = await listDisputes(request(undefined, true), ctx);
  const rows = (await list.json()).data;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "PENDING",
    match: null,
    entry: {
      id: entry.id,
      name: entry.name,
      category: { name: "Rookie Women" },
    },
  });
  // Anonymous visitors cannot read objections or the reporter's contact.
  expect((await listDisputes(request(), ctx)).status).toBe(401);
});

it("closes objections for a category once it is drawn", async () => {
  const entry = await prisma.entry.findFirstOrThrow({
    where: { categoryId },
    orderBy: { createdAt: "desc" },
  });
  await prisma.stage.create({
    data: {
      categoryId,
      name: "Penyisihan Grup",
      type: "GROUP",
      order: 1,
      config: {},
    },
  });
  const late = await submit(
    request(objection(entry.id, "late@example.test"), false, "203.0.113.21"),
    ctx,
  );
  expect(late.status).toBe(409);
  expect((await late.json()).error.message).toContain("undian");
});
