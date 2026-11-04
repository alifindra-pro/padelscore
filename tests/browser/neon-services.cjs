const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const prisma = new PrismaClient();
const fixture = randomUUID();
let userId, orgId, tournamentId, browser, client, avatarKey;
const report = (message) => console.log(`PASS: ${message}`);

async function request(path, method = "GET", body, token = "") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Cookie: `token=${token}` } : {}),
      ...(orgId ? { "X-Organization-Id": orgId } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  return response;
}
async function waitFor(check, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(message);
}

(async () => {
  try {
    assert(process.env.NEON_BRANCH, "Run against the configured Neon branch");
    assert(new URL(process.env.DATABASE_URL).hostname.includes("neon.tech"));
    const password = randomUUID() + "aA1!";
    const email = `neon-${fixture}@test.invalid`;
    userId = (
      await prisma.user.create({
        data: {
          email,
          username: `neon-${fixture}`,
          fullName: "Neon integration test",
          role: "ORGANIZER",
          passwordHash: await bcrypt.hash(password, 12),
        },
      })
    ).id;
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Neon verification ${fixture}`,
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    const login = await request("/api/v1/auth/login", "POST", {
      email,
      password,
    });
    assert.equal(login.status, 200);
    const token = /token=([^;]+)/.exec(login.headers.get("set-cookie"))[1];
    assert.equal((await login.json()).data.user.id, userId);
    report(
      "Postgres: real application login reads the Neon user and validates password",
    );

    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#009977" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("file", new Blob([image], { type: "image/png" }), "test.png");
    const upload = await request("/api/v2/profile/avatar", "POST", form, token);
    assert.equal(upload.status, 200, await upload.text());
    avatarKey = (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .avatarKey;
    assert(avatarKey.startsWith(`avatars/${userId}/`));
    const download = await request(
      "/api/v2/profile/avatar",
      "GET",
      undefined,
      token,
    );
    assert.equal(download.status, 200);
    const metadata = await sharp(
      Buffer.from(await download.arrayBuffer()),
    ).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 512);
    const storage = new S3Client({ forcePathStyle: true });
    await storage.send(
      new HeadObjectCommand({ Bucket: "assets", Key: avatarKey }),
    );
    assert.equal(
      (await request("/api/v2/profile/avatar", "DELETE", undefined, token))
        .status,
      200,
    );
    await assert.rejects(
      storage.send(new HeadObjectCommand({ Bucket: "assets", Key: avatarKey })),
      (e) => e.$metadata?.httpStatusCode === 404,
    );
    avatarKey = undefined;
    report(
      "Object Storage: avatar upload -> Neon bucket -> WebP download -> delete verified",
    );

    tournamentId = randomUUID();
    const setup = await request(
      "/api/v2/tournaments/setup",
      "POST",
      {
        requestId: tournamentId,
        name: `Neon ${fixture}`,
        location: "Verification",
        start: "2026-11-10T00:00:00.000Z",
        timezone: "Asia/Jakarta",
        category: "Doubles",
        courts: 1,
        preset: "SINGLE",
        format: "SINGLE_ELIMINATION",
        pairs: [
          ["Alpha One", "Alpha Two"],
          ["Beta One", "Beta Two"],
        ],
        duration: 60,
        rest: 30,
      },
      token,
    );
    assert.equal(setup.status, 201, await setup.text());
    const match = await prisma.match.findFirstOrThrow({
      where: { stage: { category: { tournamentId } } },
    });
    assert.equal(
      (await request(`/api/v1/live/matches/${match.id}`)).status,
      404,
    );
    const privateAccess = await request(
      `/api/v1/live/matches/${match.id}`,
      "GET",
      undefined,
      token,
    );
    assert.equal(privateAccess.status, 200);
    const functionUrl = process.env.NEON_FUNCTION_SCOREFEED_BASE_URL;
    assert.equal((await fetch(functionUrl)).status, 401);
    const invalid = await fetch(functionUrl, {
      method: "POST",
      headers: { "x-padel-secret": process.env.PADEL_FUNCTION_SECRET },
      body: "{}",
    });
    assert.equal(invalid.status, 400);
    report(
      "Functions: application receives sealed query; unauthenticated and invalid calls rejected",
    );

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "PUBLISHED" },
    });
    const access = await request(`/api/v1/live/matches/${match.id}`);
    assert.equal(access.status, 200);
    const sealed = await access.json();
    const { createRealtimeClient } = await import("@neon/realtime/client");
    client = createRealtimeClient({ url: sealed.url });
    const subscription = client.subscribe(sealed.sealedQuery);
    await waitFor(() => {
      const state = subscription.getSnapshot();
      if (state.status === "error")
        throw new Error(`Realtime: ${state.error.message}`);
      return state.status === "live" && state.data?.length === 1;
    }, "No initial Realtime rows");
    report("Realtime: real WebSocket subscription received initial match row");

    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    let legacyRequests = 0;
    let realtimeSocket = false;
    let liveResponses = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (ws) => {
      if (ws.url().includes(new URL(sealed.url).host)) realtimeSocket = true;
    });
    page.on("response", (res) => {
      if (res.url().includes("/api/v1/live/") && res.status() === 200)
        liveResponses++;
    });
    await page.route("**/api/v1/stream/**", (route) => {
      legacyRequests++;
      return route.abort();
    });
    await page.goto(`${base}/match/${match.id}`);
    await waitFor(
      () => realtimeSocket && liveResponses > 0,
      "Browser did not connect to Neon Realtime",
    );
    // Commit in one transaction from another connection, without the in-process event bus.
    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: { status: "IN_PROGRESS", version: { increment: 1 } },
      });
      await tx.matchScoreSnapshot.upsert({
        where: { matchId: match.id },
        create: {
          matchId: match.id,
          pointsA: "15",
          gamesA: [0],
          gamesB: [0],
          version: 1,
        },
        update: { pointsA: "15", gamesA: [0], gamesB: [0], version: 1 },
      });
    });
    await waitFor(
      () => subscription.getSnapshot().data?.[0]?.points_a === "15",
      "Committed score not received",
    );
    await expect(page.getByText("15", { exact: true }).first()).toBeVisible();
    assert.equal(legacyRequests, 0);
    report(
      "Realtime/browser: independent database commit appears as score 15 on mobile screen; no legacy SSE used",
    );
    await waitFor(
      () => liveResponses >= 2,
      "Sealed query was not renewed",
      65000,
    );
    await prisma.matchScoreSnapshot.update({
      where: { matchId: match.id },
      data: { pointsA: "30", version: 2 },
    });
    await expect(page.getByText("30", { exact: true }).first()).toBeVisible();
    report(
      "Realtime/browser: sealed-query renewal and subsequent score 30 both verified",
    );
    assert.deepEqual(errors, []);
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "DRAFT" },
    });
    await waitFor(
      () => subscription.getSnapshot().data?.length === 0,
      "Live authorization did not remove unpublished match",
    );
    assert.equal(
      (await request(`/api/v1/live/matches/${match.id}`)).status,
      404,
    );
    report(
      "Realtime authorization: unpublishing removes the row from an existing public subscription",
    );
    console.log("ALL FOUR NEON SERVICES PASS END TO END");
  } finally {
    client?.close();
    await browser?.close();
    if (avatarKey) {
      const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
      await new S3Client({ forcePathStyle: true }).send(
        new DeleteObjectCommand({ Bucket: "assets", Key: avatarKey }),
      );
    }
    if (userId) await prisma.auditLog.deleteMany({ where: { userId } });
    if (tournamentId) {
      await prisma.scoringAction.deleteMany({
        where: { match: { stage: { category: { tournamentId } } } },
      });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    if (orgId) {
      await prisma.player.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    console.log("Verification fixtures cleaned up");
  }
})().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
