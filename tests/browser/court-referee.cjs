const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const expect = baseExpect.configure({ timeout: 20000 });
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  let userId, orgId, browser, tournamentId;
  const mark = randomUUID();
  try {
    userId = (
      await db.user.create({
        data: {
          email: `court-ref-${mark}@test.invalid`,
          username: mark,
          fullName: "Court Referee Browser",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Court referee browser",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const adminCtx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await adminCtx.addCookies([
      {
        name: "token",
        value: jwt.sign({ userId, role: "ORGANIZER" }, process.env.JWT_SECRET, {
          expiresIn: "20m",
        }),
        url: base,
        httpOnly: true,
      },
    ]);
    await adminCtx.addInitScript(
      (id) => localStorage.setItem("padel-organization", id),
      orgId,
    );
    // An event with two courts and one scheduled match on court 1.
    tournamentId = randomUUID();
    const setup = await adminCtx.request.post(
      `${base}/api/v2/tournaments/setup`,
      {
        headers: { "X-Organization-Id": orgId },
        data: {
          requestId: tournamentId,
          name: "Wasit " + mark.slice(0, 6),
          location: "Venue",
          start: new Date(Date.now() + 3600000).toISOString(),
          timezone: "Asia/Jakarta",
          category: "Rookie Men",
          courts: 2,
          preset: "TOTAL_4",
          format: "SINGLE_ELIMINATION",
          registrationLater: true,
          slotCount: 2,
          duration: 20,
          rest: 10,
        },
      },
    );
    assert.equal(setup.status(), 201, await setup.text());
    const category = await db.category.findFirstOrThrow({
      where: { tournamentId },
    });
    const courts = await db.court.findMany({
      where: { tournamentId },
      orderBy: { name: "asc" },
    });
    const pairs = [];
    for (const n of [1, 2])
      pairs.push(
        await db.entry.create({
          data: { categoryId: category.id, name: `Tim ${n}A / Tim ${n}B` },
        }),
      );
    const stage = await db.stage.create({
      data: {
        categoryId: category.id,
        name: "Final",
        type: "SINGLE_ELIMINATION",
        order: 1,
        config: {},
      },
    });
    const match = await db.match.create({
      data: {
        stageId: stage.id,
        matchNumber: 1,
        round: 1,
        entryAId: pairs[0].id,
        entryBId: pairs[1].id,
        courtId: courts[0].id,
        scheduledAt: new Date(Date.now() + 3600000),
      },
    });
    await db.tournament.update({
      where: { id: tournamentId },
      data: { status: "IN_PROGRESS" },
    });

    const errors = [];
    const desk = await adminCtx.newPage();
    desk.on("pageerror", (e) => errors.push(e.message));
    await desk.goto(`${base}/admin/tournaments/${tournamentId}`);
    await desk.getByRole("link", { name: "Wasit & kode laga" }).click();
    await expect(
      desk.getByRole("heading", { name: "Wasit & kode laga" }),
    ).toBeVisible();
    await desk
      .getByRole("button", { name: "Buat akun untuk 2 lapangan" })
      .click();
    await expect(desk.locator(".referee-token")).toHaveCount(2);
    const firstCard = desk.locator(".referee-courts li").first();
    const token = (
      await firstCard.locator(".referee-token").innerText()
    ).trim();
    const link = (await firstCard.locator(".referee-link").innerText()).trim();
    assert.match(token, /^\d{6}$/);
    assert.match(link, /\/wasit\/[A-Za-z0-9_-]{16}$/);
    await firstCard
      .getByRole("button", { name: "Salin untuk WhatsApp" })
      .click();
    await expect(desk.getByText("Link dan token disalin")).toBeVisible();
    const code = (await desk.locator(".code-value").first().innerText()).trim();
    assert.match(code, /^\d{4}$/);
    await expect(desk.getByText("Menunggu kode")).toBeVisible();
    if (shots)
      await desk.screenshot({
        path: `${shots}/referee-desk.png`,
        fullPage: true,
      });

    // Referee on a phone: link, token, match list, start code.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const ref = await phone.newPage();
    ref.on("pageerror", (e) => errors.push(e.message));
    await ref.goto(link);
    await expect(
      ref.getByRole("heading", { name: `Wasit ${courts[0].name}` }),
    ).toBeVisible();
    await ref
      .getByLabel("Token wasit")
      .fill("000000" === token ? "111111" : "000000");
    await ref.getByRole("button", { name: "Masuk" }).click();
    await expect(ref.getByText("Token salah")).toBeVisible();
    await ref.getByLabel("Token wasit").fill(token);
    if (shots) await ref.screenshot({ path: `${shots}/referee-login.png` });
    await ref.getByRole("button", { name: "Masuk" }).click();
    await expect(ref).toHaveURL(/\/referee$/);
    await expect(ref.getByText("Tim 1A / Tim 1B").first()).toBeVisible();
    await ref.goto(`${base}/referee/v2/${match.id}`);
    await ref
      .getByRole("button", { name: "Unduh pertandingan & mulai mencatat" })
      .click();
    await expect(
      ref.getByRole("heading", { name: "Kode mulai laga" }),
    ).toBeVisible();
    if (shots) await ref.screenshot({ path: `${shots}/referee-code.png` });
    await ref
      .getByRole("textbox", { name: "Kode mulai", exact: true })
      .fill(code === "0000" ? "1111" : "0000");
    await ref.getByRole("button", { name: "Buka laga" }).click();
    await expect(ref.getByText("Kode salah. Sisa 4 kali")).toBeVisible();
    await ref
      .getByRole("textbox", { name: "Kode mulai", exact: true })
      .fill(code);
    await ref.getByRole("button", { name: "Buka laga" }).click();
    await expect(
      ref.getByRole("heading", { name: "Undian servis pertama" }),
    ).toBeVisible();
    if (shots) await ref.screenshot({ path: `${shots}/referee-open.png` });
    assert.equal(
      await ref.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "referee page overflows",
    );

    // The desk shows the match as opened.
    await desk.reload();
    await expect(desk.getByText("Sudah dibuka")).toBeVisible();
    await desk.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await desk.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "desk overflows on a phone",
    );

    assert.deepEqual(errors, []);
    console.log(
      "PASS: court referee accounts, link + token sign-in, start code gate",
    );
  } finally {
    await browser?.close();
    if (tournamentId) {
      const refs = await db.court.findMany({
        where: { tournamentId },
        select: { refereeUserId: true },
      });
      await db.tournament.deleteMany({ where: { id: tournamentId } });
      const ids = refs.map((r) => r.refereeUserId).filter(Boolean);
      if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (orgId) {
      await db.auditLog.deleteMany({ where: { userId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
