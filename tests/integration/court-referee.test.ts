import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import {
  GET as desk,
  POST as manage,
} from "@/app/api/v2/tournaments/[id]/referees/route";
import { POST as signIn } from "@/app/api/v2/referee-access/route";
import { POST as unlock } from "@/app/api/v2/matches/[id]/unlock/route";
import { GET as v2Get, POST as v2Post } from "@/app/api/v2/[...path]/route";
import { EntryService } from "@/services/entry.service";
import { matchStartCode } from "@/lib/court-referee";

let userId: string, orgId: string, adminToken: string;
let courtId: string, matchId: string, otherMatchId: string;
const tournamentId = randomUUID();
const json = (
  url: string,
  method: string,
  body?: unknown,
  auth?: { bearer?: string; cookie?: string },
  ip = "203.0.113.50",
) =>
  new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      ...(auth?.bearer
        ? { Authorization: `Bearer ${auth.bearer}`, "X-Organization-Id": orgId }
        : {}),
      ...(auth?.cookie ? { Cookie: `token=${auth.cookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const deskCtx = () => ({ params: Promise.resolve({ id: tournamentId }) });
const admin = (method: string, body?: unknown) =>
  json(
    `http://localhost/api/v2/tournaments/${tournamentId}/referees`,
    method,
    body,
    { bearer: adminToken },
  );
const claim = (id: string, cookie: string) =>
  v2Post(
    json(
      `http://localhost/api/v2/matches/${id}/claim`,
      "POST",
      { deviceId: randomUUID() },
      { cookie },
    ),
    { params: Promise.resolve({ path: ["matches", id, "claim"] }) },
  );
const tryCode = (id: string, code: string, cookie: string) =>
  unlock(
    json(
      `http://localhost/api/v2/matches/${id}/unlock`,
      "POST",
      { code },
      {
        cookie,
      },
    ),
    { params: Promise.resolve({ id }) },
  );

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: {
        email: `referee-${randomUUID()}@test.invalid`,
        username: randomUUID(),
        fullName: "Referee organizer",
        role: "ORGANIZER",
        passwordHash: "unusable",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: { name: "Referee", members: { create: { userId, role: "OWNER" } } },
    })
  ).id;
  adminToken = generateToken({ userId, role: "ORGANIZER" });
  const response = await setup(
    json(
      "http://localhost/api/v2/tournaments/setup",
      "POST",
      {
        requestId: tournamentId,
        name: "Referee test",
        location: "Court",
        start: "2026-11-22T01:00:00Z",
        timezone: "Asia/Jakarta",
        category: "Rookie Men",
        courts: 1,
        preset: "TOTAL_4",
        format: "SINGLE_ELIMINATION",
        registrationLater: true,
        slotCount: 4,
        duration: 20,
        rest: 10,
      },
      { bearer: adminToken },
    ),
  );
  expect(response.status).toBe(201);
  const category = await prisma.category.findFirstOrThrow({
    where: { tournamentId },
  });
  courtId = (await prisma.court.findFirstOrThrow({ where: { tournamentId } }))
    .id;
  const entries = [];
  for (const n of [1, 2, 3, 4])
    entries.push(
      await EntryService.createEntry({
        categoryId: category.id,
        name: `Ref ${n} A / Ref ${n} B`,
        playerIds: [],
        playerNames: [`Ref ${n} A`, `Ref ${n} B`],
        userId,
      }),
    );
  const stage = await prisma.stage.create({
    data: {
      categoryId: category.id,
      name: "Babak gugur",
      type: "SINGLE_ELIMINATION",
      order: 1,
      config: {},
    },
  });
  const make = (n: number, a: string, b: string) =>
    prisma.match.create({
      data: {
        stageId: stage.id,
        matchNumber: n,
        round: 1,
        entryAId: a,
        entryBId: b,
        courtId,
        scheduledAt: new Date(),
      },
    });
  matchId = (await make(1, entries[0].id, entries[1].id)).id;
  otherMatchId = (await make(2, entries[2].id, entries[3].id)).id;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "IN_PROGRESS" },
  });
});
afterAll(async () => {
  if (!userId) return;
  const court = await prisma.court.findUnique({ where: { id: courtId } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  if (court?.refereeUserId)
    await prisma.user.delete({ where: { id: court.refereeUserId } });
  await prisma.player.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: userId } });
});

it("signs a court referee in with the link and token, and gates each match with a start code", async () => {
  expect(
    (await manage(admin("POST", { action: "court", courtId }), deskCtx()))
      .status,
  ).toBe(201);
  const view = (await (await desk(admin("GET"), deskCtx())).json()).data;
  const court = view.courts[0];
  expect(court.referee.token).toMatch(/^\d{6}$/);
  expect(court.referee.linkId).toHaveLength(16);
  const codes = Object.fromEntries(
    view.matches.map((m: { id: string; code: string }) => [m.id, m.code]),
  );
  expect(codes[matchId]).toBe(matchStartCode(matchId));

  const wrongToken = court.referee.token === "000000" ? "111111" : "000000";
  expect(
    (
      await signIn(
        json("http://localhost/api/v2/referee-access", "POST", {
          link: court.referee.linkId,
          token: wrongToken,
        }),
      )
    ).status,
  ).toBe(401);
  const ok = await signIn(
    json("http://localhost/api/v2/referee-access", "POST", {
      link: court.referee.linkId,
      token: court.referee.token,
    }),
  );
  expect(ok.status).toBe(200);
  const cookie = ok.cookies.get("token")!.value;
  expect(cookie).toBeTruthy();

  // The court referee sees the matches on that court without being named on them.
  const assigned = await v2Get(
    json("http://localhost/api/v2/matches/assigned", "GET", undefined, {
      cookie,
    }),
    { params: Promise.resolve({ path: ["matches", "assigned"] }) },
  );
  const ids = (await assigned.json()).data.map((m: { id: string }) => m.id);
  expect(ids).toEqual(expect.arrayContaining([matchId, otherMatchId]));

  // Opening a match for scoring needs the desk's code first.
  const locked = await claim(matchId, cookie);
  expect(locked.status).toBe(423);
  expect((await locked.json()).error.code).toBe("START_LOCKED");
  const wrong = codes[matchId] === "0000" ? "1111" : "0000";
  const miss = await tryCode(matchId, wrong, cookie);
  expect(miss.status).toBe(400);
  expect((await miss.json()).error.message).toContain("Sisa 4");
  expect((await tryCode(matchId, codes[matchId], cookie)).status).toBe(200);
  expect((await claim(matchId, cookie)).status).toBe(200);

  // Five wrong codes lock the match until the desk lets it start.
  const other = codes[otherMatchId] === "0000" ? "1111" : "0000";
  for (let i = 0; i < 4; i++)
    expect((await tryCode(otherMatchId, other, cookie)).status).toBe(400);
  expect((await tryCode(otherMatchId, other, cookie)).status).toBe(423);
  expect(
    (await tryCode(otherMatchId, codes[otherMatchId], cookie)).status,
  ).toBe(423);
  const after = (await (await desk(admin("GET"), deskCtx())).json()).data;
  expect(
    after.matches.find((m: { id: string }) => m.id === otherMatchId).locked,
  ).toBe(true);
  await manage(
    admin("POST", { action: "unlock", matchId: otherMatchId }),
    deskCtx(),
  );
  expect((await claim(otherMatchId, cookie)).status).toBe(200);

  // A new token signs out devices that used the old one.
  await manage(admin("POST", { action: "rotate", courtId }), deskCtx());
  expect((await claim(matchId, cookie)).status).toBe(401);
  const rotated = (await (await desk(admin("GET"), deskCtx())).json()).data;
  expect(rotated.courts[0].referee.token).not.toBe(court.referee.token);
});

it("keeps the referee desk and start codes from anyone but organizers", async () => {
  const anon = await desk(
    json(`http://localhost/api/v2/tournaments/${tournamentId}/referees`, "GET"),
    deskCtx(),
  );
  expect(anon.status).toBe(401);
});
