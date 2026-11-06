import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { generateToken } from "@/lib/auth";
import { POST as setup } from "@/app/api/v2/tournaments/setup/route";
import {
  GET as sponsors,
  POST as addSponsor,
} from "@/app/api/v2/tournaments/[id]/sponsors/route";
import {
  GET as logo,
  DELETE as removeSponsor,
} from "@/app/api/v2/tournaments/[id]/sponsors/[sponsorId]/route";
import {
  POST as submit,
  GET as list,
  PATCH as review,
} from "@/app/api/v2/tournaments/[id]/disputes/route";
import { GET as status } from "@/app/api/v2/disputes/[id]/route";
import { deleteAvatar } from "@/services/v2/storage";
const suffix = randomUUID();
const tids = [randomUUID(), randomUUID()];
let userId: string,
  staffId: string,
  orgId: string,
  token: string,
  staffToken: string,
  matchId: string;
const ctx = (id = tids[0]) => ({ params: Promise.resolve({ id }) });
function req(method: string, path: string, body?: unknown, auth = token) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "Content-Type": "application/json",
      "X-Organization-Id": orgId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const input = () => ({
  matchId,
  reporterName: "Peserta Uji",
  contact: `test-${suffix}@example.test`,
  reason: "Poin terakhir tercatat untuk pasangan yang keliru, mohon diperiksa.",
});
describe("Per-tournament sponsors and participant disputes", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `community-${suffix}@test.invalid`,
        username: `community-${suffix}`,
        fullName: "Community test",
        passwordHash: "unusable",
        role: "ORGANIZER",
      },
    });
    userId = owner.id;
    const staff = await prisma.user.create({
      data: {
        email: `staff-${suffix}@test.invalid`,
        username: `staff-${suffix}`,
        fullName: "Staff test",
        passwordHash: "unusable",
        role: "ORGANIZER",
      },
    });
    staffId = staff.id;
    token = generateToken({ userId, role: "ORGANIZER" });
    staffToken = generateToken({ userId: staffId, role: "ORGANIZER" });
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Community ${suffix}`,
          members: {
            create: [
              { userId, role: "OWNER" },
              { userId: staffId, role: "STAFF" },
            ],
          },
        },
      })
    ).id;
    for (const requestId of tids) {
      const r = await setup(
        req("POST", "/api/v2/tournaments/setup", {
          requestId,
          name: `Community ${suffix}`,
          location: "Test",
          start: "2026-11-10T01:00:00.000Z",
          timezone: "Asia/Jakarta",
          category: "Open",
          courts: 1,
          preset: "POINTS",
          totalPoints: 24,
          format: "SINGLE_ELIMINATION",
          pairs: [
            ["Test One", "Test Two"],
            ["Test Three", "Test Four"],
          ],
          duration: 30,
          rest: 10,
        }),
      );
      expect(r.status).toBe(201);
    }
    matchId = (
      await prisma.match.findFirstOrThrow({
        where: { stage: { category: { tournamentId: tids[0] } } },
      })
    ).id;
  });
  afterAll(async () => {
    for (const sponsor of await prisma.tournamentSponsor.findMany({
      where: { tournamentId: { in: tids } },
    }))
      await deleteAvatar(sponsor.logoKey).catch(() => {});
    if (userId)
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [userId, staffId] } },
      });
    await prisma.tournament.deleteMany({ where: { id: { in: tids } } });
    if (orgId) {
      await prisma.player.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [userId, staffId].filter(Boolean) } },
    });
  });
  it("uploads isolated logos, protects drafts, rejects staff and invalid files, and deletes", async () => {
    const png = await sharp({
      create: {
        width: 240,
        height: 80,
        channels: 4,
        background: { r: 0, g: 96, b: 170, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const upload = (
      data: Buffer = png,
      auth = token,
      website = "https://example.com",
    ) => {
      const form = new FormData();
      form.set("name", "Fixture Sponsor");
      form.set("tier", "MAIN");
      form.set("website", website);
      form.set(
        "logo",
        new File([new Uint8Array(data)], "logo.png", { type: "image/png" }),
      );
      return new NextRequest(
        `http://localhost/api/v2/tournaments/${tids[0]}/sponsors`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${auth}` },
          body: form,
        },
      );
    };
    expect((await addSponsor(upload(png, staffToken), ctx())).status).toBe(403);
    expect(
      (await addSponsor(upload(Buffer.from("not an image")), ctx())).status,
    ).toBe(400);
    expect(
      (await addSponsor(upload(png, token, "javascript:alert(1)"), ctx()))
        .status,
    ).toBe(400);
    const response = await addSponsor(upload(), ctx());
    expect(response.status).toBe(201);
    const sponsor = (await response.json()).data;
    expect(sponsor.logoKey).toBeUndefined();
    const imageCtx = {
      params: Promise.resolve({ id: tids[0], sponsorId: sponsor.id }),
    };
    expect((await logo(req("GET", "/", undefined, ""), imageCtx)).status).toBe(
      404,
    );
    expect((await sponsors(req("GET", "/", undefined, ""), ctx())).status).toBe(
      404,
    );
    expect(
      (await (await sponsors(req("GET", "/"), ctx(tids[1]))).json()).data,
    ).toEqual([]);
    expect(
      (
        await logo(req("GET", "/"), {
          params: Promise.resolve({ id: tids[1], sponsorId: sponsor.id }),
        })
      ).status,
    ).toBe(404);
    await prisma.tournament.update({
      where: { id: tids[0] },
      data: { status: "PUBLISHED" },
    });
    const image = await logo(req("GET", "/", undefined, ""), imageCtx);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    const metadata = await sharp(
      Buffer.from(await image.arrayBuffer()),
    ).metadata();
    expect(metadata.width).toBe(240);
    expect(metadata.height).toBe(80);
    expect((await removeSponsor(req("DELETE", "/"), imageCtx)).status).toBe(
      200,
    );
    expect((await logo(req("GET", "/", undefined, ""), imageCtx)).status).toBe(
      404,
    );
  });
  it("accepts public submissions only for finished public matches, preserves score, and reviews privately", async () => {
    expect((await submit(req("POST", "/", input(), ""), ctx())).status).toBe(
      400,
    );
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "FINISHED" },
    });
    expect(
      (await submit(req("POST", "/", input(), ""), ctx(tids[1]))).status,
    ).toBe(404);
    expect(
      (
        await submit(
          req("POST", "/", { ...input(), reason: "short" }, ""),
          ctx(),
        )
      ).status,
    ).toBe(400);
    const created = await submit(req("POST", "/", input(), ""), ctx());
    expect(created.status).toBe(201);
    const receipt = (await created.json()).data;
    expect(receipt.receipt).toHaveLength(64);
    expect((await submit(req("POST", "/", input(), ""), ctx())).status).toBe(
      409,
    );
    expect((await list(req("GET", "/", undefined, ""), ctx())).status).toBe(
      401,
    );
    expect(
      (await list(req("GET", "/", undefined, staffToken), ctx())).status,
    ).toBe(403);
    const inbox = (await (await list(req("GET", "/"), ctx())).json()).data;
    expect(inbox).toHaveLength(1);
    expect(inbox[0].contact).toBe(input().contact);
    expect(inbox[0].receiptHash).toBeUndefined();
    const receiptCtx = { params: Promise.resolve({ id: receipt.id }) };
    expect(
      (await status(req("GET", "/", undefined, ""), receiptCtx)).status,
    ).toBe(404);
    const check = () =>
      status(
        new NextRequest("http://localhost/", {
          headers: { "x-dispute-receipt": receipt.receipt },
        }),
        receiptCtx,
      );
    expect((await (await check()).json()).data.status).toBe("PENDING");
    const decision = {
      disputeId: receipt.id,
      status: "ACCEPTED",
      response:
        "Sanggahan diterima, panitia akan memeriksa rekaman pertandingan.",
    };
    expect(
      (await review(req("PATCH", "/", decision, staffToken), ctx())).status,
    ).toBe(403);
    expect(
      (await review(req("PATCH", "/", decision), ctx(tids[1]))).status,
    ).toBe(409);
    expect((await review(req("PATCH", "/", decision), ctx())).status).toBe(200);
    expect((await review(req("PATCH", "/", decision), ctx())).status).toBe(409);
    const result = (await (await check()).json()).data;
    expect(result.status).toBe("ACCEPTED");
    expect(result.contact).toBeUndefined();
    expect(result.reason).toBeUndefined();
    const match = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
    });
    expect(match.version).toBe(0);
    expect(match.winnerId).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { entityId: receipt.id, action: "REVIEW_DISPUTE" },
      }),
    ).toBe(1);
    await prisma.tournament.update({
      where: { id: tids[0] },
      data: { status: "DRAFT" },
    });
    expect(
      (
        await submit(
          req(
            "POST",
            "/",
            { ...input(), contact: "different@example.test" },
            "",
          ),
          ctx(),
        )
      ).status,
    ).toBe(404);
  });
  it("limits public submissions without exposing personal data", async () => {
    await prisma.tournament.update({
      where: { id: tids[0] },
      data: { status: "PUBLISHED" },
    });
    const send = (n: number) =>
      submit(
        new NextRequest("http://localhost/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-vercel-forwarded-for": "203.0.113.8",
          },
          body: JSON.stringify({
            ...input(),
            contact: `rate-${n}@example.test`,
          }),
        }),
        ctx(),
      );
    for (let i = 0; i < 5; i++) expect((await send(i)).status).toBe(201);
    expect((await send(5)).status).toBe(429);
  });
});
