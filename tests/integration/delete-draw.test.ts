import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import {
  DELETE as v2Delete,
  POST as v2Post,
} from "@/app/api/v2/[...path]/route";
import { EntryService } from "@/services/entry.service";

let userId: string, orgId: string, token: string, categoryId: string;
const tournamentId = randomUUID();
const call = (method: "POST" | "DELETE", body?: unknown) => {
  const req = new NextRequest(
    `http://localhost/api/v2/categories/${categoryId}/draw`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": orgId,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const ctx = {
    params: Promise.resolve({ path: ["categories", categoryId, "draw"] }),
  };
  return method === "POST" ? v2Post(req, ctx) : v2Delete(req, ctx);
};

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `undraw-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Undraw",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: { name: "Undraw", members: { create: { userId, role: "OWNER" } } },
    })
  ).id;
  token = generateToken({ userId, role: "ORGANIZER" });
  const res = await setup(
    new NextRequest("http://localhost/api/v2/tournaments/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": orgId,
      },
      body: JSON.stringify({
        requestId: tournamentId,
        name: "Undraw",
        location: "Court",
        start: "2026-11-22T01:00:00Z",
        timezone: "Asia/Jakarta",
        category: "Rookie Men",
        courts: 1,
        preset: "TOTAL_4",
        format: "GROUP_KNOCKOUT",
        groups: 2,
        advancePerGroup: 2,
        registrationLater: true,
        slotCount: 8,
        duration: 20,
        rest: 10,
      }),
    }),
  );
  expect(res.status).toBe(201);
  categoryId = (
    await prisma.category.findFirstOrThrow({ where: { tournamentId } })
  ).id;
  for (let n = 1; n <= 8; n++)
    await EntryService.createEntry({
      categoryId,
      name: `U${n} A / U${n} B`,
      playerIds: [],
      playerNames: [`U${n} A`, `U${n} B`],
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

it("removes an unplayed draw so pairs can change and registration can reopen", async () => {
  expect((await call("POST", { mode: "RANDOM" })).status).toBeLessThan(300);
  expect(await prisma.match.count({ where: { stage: { categoryId } } })).toBe(
    12,
  );
  const removed = await call("DELETE");
  expect(removed.status).toBe(200);
  expect(await prisma.stage.count({ where: { categoryId } })).toBe(0);
  expect(await prisma.match.count({ where: { stage: { categoryId } } })).toBe(
    0,
  );
  // Pairs are no longer locked.
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "REGISTRATION" },
  });
  const extra = await EntryService.createEntry({
    categoryId,
    name: "U9 A / U9 B",
    playerIds: [],
    playerNames: ["U9 A", "U9 B"],
    userId,
  });
  expect(extra.id).toBeTruthy();
});

it("keeps a draw once a match has been opened at the desk", async () => {
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "PUBLISHED" },
  });
  expect((await call("POST", { mode: "RANDOM" })).status).toBeLessThan(300);
  const match = await prisma.match.findFirstOrThrow({
    where: { stage: { categoryId } },
  });
  await prisma.match.update({
    where: { id: match.id },
    data: { startUnlockedAt: new Date() },
  });
  const refused = await call("DELETE");
  expect(refused.status).toBe(409);
  expect(await prisma.stage.count({ where: { categoryId } })).toBe(1);
});
