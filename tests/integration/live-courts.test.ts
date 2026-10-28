import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "../../src/lib/db";
import { generateToken, hashPassword } from "../../src/lib/auth";
import { GET } from "../../src/app/api/v1/tournaments/[id]/courts/live/route";

const suffix = randomUUID();
let owner: string, org: string, tournament: string;
let liveMatch: string, firstScheduled: string;

describe("Live courts endpoint", () => {
  beforeAll(async () => {
    owner = (
      await prisma.user.create({
        data: {
          email: `courts-${suffix}@test.invalid`,
          username: `c${suffix}`,
          fullName: "Admin Lapangan",
          role: "ORGANIZER",
          passwordHash: await hashPassword("test-only-password"),
        },
      })
    ).id;
    org = (
      await prisma.organization.create({
        data: {
          name: `Courts ${suffix}`,
          members: { create: { userId: owner, role: "OWNER" } },
        },
      })
    ).id;
    tournament = (
      await prisma.tournament.create({
        data: {
          name: "Courts Event",
          slug: `courts-${suffix}`,
          organizationId: org,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000),
          members: { create: { userId: owner, role: "OWNER" } },
        },
      })
    ).id;
    const category = await prisma.category.create({
      data: { tournamentId: tournament, name: "Open", format: "SINGLE_ELIMINATION" },
    });
    const stage = await prisma.stage.create({
      data: {
        categoryId: category.id,
        name: "Main",
        type: "SINGLE_ELIMINATION",
        order: 1,
        config: {},
      },
    });
    const court = await prisma.court.create({
      data: { tournamentId: tournament, name: "Court 1" },
    });
    const at = (minutes: number) => new Date(Date.now() + minutes * 60000);
    const match = (matchNumber: number, status: "SCHEDULED" | "IN_PROGRESS", minutes: number) =>
      prisma.match.create({
        data: {
          stageId: stage.id,
          courtId: court.id,
          matchNumber,
          round: 1,
          status,
          scheduledAt: at(minutes),
        },
      });
    // Two scheduled matches sort ahead of the live one by enum order
    firstScheduled = (await match(1, "SCHEDULED", 60)).id;
    await match(2, "SCHEDULED", 120);
    liveMatch = (await match(3, "IN_PROGRESS", -30)).id;
  });

  afterAll(async () => {
    if (tournament) await prisma.tournament.delete({ where: { id: tournament } });
    if (org) await prisma.organization.delete({ where: { id: org } });
    if (owner) {
      await prisma.auditLog.deleteMany({ where: { userId: owner } });
      await prisma.user.delete({ where: { id: owner } });
    }
  });

  it("reports the live match even when the court has several scheduled matches", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/v1/tournaments/${tournament}/courts/live`, {
        headers: {
          Authorization: `Bearer ${generateToken({ userId: owner, role: "ORGANIZER" })}`,
        },
      }),
      { params: Promise.resolve({ id: tournament }) },
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { activeMatch: { id: string } | null; nextMatch: { id: string } | null }[];
    };
    expect(data).toHaveLength(1);
    expect(data[0].activeMatch?.id).toBe(liveMatch);
    expect(data[0].nextMatch?.id).toBe(firstScheduled);
  });
});
