import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import { POST as register } from "@/app/api/v2/categories/[id]/register/route";
import { POST as dispatch } from "@/app/api/v2/[...path]/route";
import { EntryService } from "@/services/entry.service";
let userId: string, orgId: string, token: string;
const tids: string[] = [];
const req = (path: string, body: unknown, auth = true) =>
  new NextRequest("http://localhost" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": orgId,
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const make = async (capacity: number, groups = 1) => {
  const id = randomUUID();
  tids.push(id);
  const body = {
    requestId: id,
    name: "Empty slots",
    location: "Court",
    start: "2026-11-12T01:00:00Z",
    timezone: "Asia/Jakarta",
    category: "Open",
    courts: 1,
    preset: "POINTS",
    totalPoints: 24,
    format: groups > 1 ? "GROUP_KNOCKOUT" : "SINGLE_ELIMINATION",
    groups,
    advancePerGroup: 1,
    registrationLater: true,
    slotCount: capacity,
    duration: 30,
    rest: 10,
  };
  const response = await setup(req("/api/v2/tournaments/setup", body));
  expect(response.status).toBe(201);
  return prisma.category.findFirstOrThrow({ where: { tournamentId: id } });
};
const signup = (id: string, n: string) =>
  register(
    req(
      `/api/v2/categories/${id}/register`,
      { playerNames: [`${n} Alpha`, `${n} Beta`], contact: "081234567890" },
      false,
    ),
    { params: Promise.resolve({ id }) },
  );
beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `slots-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Slot tester",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  token = generateToken({ userId, role: "ORGANIZER" });
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Slots test",
        members: { create: { userId, role: "OWNER" } },
      },
    })
  ).id;
});
afterAll(async () => {
  if (!orgId) return;
  await prisma.auditLog.deleteMany({ where: { tournamentId: { in: tids } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tids } } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});
it("creates only slots then supports admin and public signup without overbooking", async () => {
  const c = await make(2);
  expect(c.maxEntries).toBe(2);
  expect(await prisma.entry.count({ where: { categoryId: c.id } })).toBe(0);
  expect(await prisma.stage.count({ where: { categoryId: c.id } })).toBe(0);
  expect((await signup(c.id, "Closed")).status).toBe(409);
  await EntryService.createEntry({
    categoryId: c.id,
    playerIds: [],
    playerNames: ["Admin Alpha", "Admin Beta"],
    userId,
  });
  await prisma.tournament.update({
    where: { id: c.tournamentId },
    data: { status: "REGISTRATION" },
  });
  const responses = await Promise.all([
    signup(c.id, "Public One"),
    signup(c.id, "Public Two"),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await prisma.entry.count({ where: { categoryId: c.id } })).toBe(2);
  expect(await prisma.player.count({ where: { organizationId: orgId } })).toBe(
    4,
  );
  const draw = () =>
    dispatch(req(`/api/v2/categories/${c.id}/draw`, { mode: "RANDOM" }), {
      params: Promise.resolve({ path: ["categories", c.id, "draw"] }),
    });
  expect((await draw()).status).toBe(409);
  await prisma.tournament.update({
    where: { id: c.tournamentId },
    data: { status: "PUBLISHED" },
  });
  expect((await draw()).status).toBe(201);
  expect((await signup(c.id, "After Close")).status).toBe(409);
}, 60000);
it("keeps configured groups while participants are registered later and rejects duplicates atomically", async () => {
  const c = await make(6, 3);
  for (let i = 0; i < 6; i++)
    await EntryService.createEntry({
      categoryId: c.id,
      playerIds: [],
      playerNames: [`Group ${i} Alpha`, `Group ${i} Beta`],
      userId,
    });
  const response = await dispatch(
    req(`/api/v2/categories/${c.id}/draw`, { mode: "RANDOM" }),
    { params: Promise.resolve({ path: ["categories", c.id, "draw"] }) },
  );
  expect(response.status).toBe(201);
  expect(
    await prisma.group.count({ where: { stage: { categoryId: c.id } } }),
  ).toBe(3);
  const other = await make(3);
  await prisma.tournament.update({
    where: { id: other.tournamentId },
    data: { status: "REGISTRATION" },
  });
  expect((await signup(other.id, "Repeated")).status).toBe(201);
  expect((await signup(other.id, "Repeated")).status).toBe(409);
  expect(await prisma.entry.count({ where: { categoryId: other.id } })).toBe(1);
}, 60000);
it("rejects immediate group draws with too few actual pairs even when spare slots exist", async () => {
  const response = await setup(
    req("/api/v2/tournaments/setup", {
      requestId: randomUUID(),
      name: "Invalid group draw",
      location: "Court",
      start: "2026-11-12T01:00:00Z",
      timezone: "Asia/Jakarta",
      category: "Open",
      courts: 1,
      preset: "POINTS",
      format: "GROUP_KNOCKOUT",
      groups: 2,
      advancePerGroup: 1,
      slotCount: 8,
      registrationLater: false,
      pairs: [
        ["One Alpha", "One Beta"],
        ["Two Alpha", "Two Beta"],
      ],
      duration: 30,
      rest: 10,
    }),
  );
  expect(response.status).toBe(400);
});
