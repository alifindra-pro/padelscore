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
          deuce: "GOLDEN_POINT",
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
          data: {
            categoryId: category.id,
            name: `Tim ${n}A / Tim ${n}B`,
            players: {
              create: ["A", "B"].map((s) => ({
                player: {
                  create: { fullName: `Tim ${n}${s}`, organizationId: orgId },
                },
              })),
            },
          },
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
      .getByRole("button", { name: "Buka laga ini", exact: true })
      .click();
    await expect(
      ref.getByRole("heading", { name: "Kode mulai laga" }),
    ).toBeVisible();
    if (shots) await ref.screenshot({ path: `${shots}/referee-code.png` });
    await ref
      .getByRole("textbox", { name: "Kode mulai", exact: true })
      .fill(code === "0000" ? "1111" : "0000");
    await ref.getByRole("button", { name: "Buka laga", exact: true }).click();
    await expect(ref.getByText("Kode salah. Sisa 4 kali")).toBeVisible();
    await ref
      .getByRole("textbox", { name: "Kode mulai", exact: true })
      .fill(code);
    await ref.getByRole("button", { name: "Buka laga", exact: true }).click();
    await expect(
      ref.getByRole("heading", { name: "Sebelum mulai" }),
    ).toBeVisible();
    await expect(
      ref.getByRole("heading", { name: "Tim 1A / Tim 1B vs Tim 2A / Tim 2B" }),
    ).toBeVisible();

    // Toss, choice, opening players by name, start.
    await ref.getByRole("button", { name: "Lempar koin" }).click();
    await expect(ref.getByText(/menang undian/)).toBeVisible();
    await ref.getByRole("button", { name: "Servis dulu" }).click();
    await expect(ref.getByRole("button", { name: "Tim 1B" })).toBeVisible();
    await ref.getByRole("button", { name: "Tim 1B" }).click();
    if (shots)
      await ref.screenshot({
        path: `${shots}/referee-setup.png`,
        fullPage: true,
      });
    await ref.getByRole("button", { name: "Mulai pertandingan" }).click();
    const pointA = ref.getByRole("button", {
      name: /Poin untuk\s*Tim 1A \/ Tim 1B/,
    });
    const pointB = ref.getByRole("button", {
      name: /Poin untuk\s*Tim 2A \/ Tim 2B/,
    });
    await expect(pointA).toBeVisible();
    await expect(ref.getByText(/Servis: Tim/)).toBeVisible();

    // First game to 40–40: the receiving pair picks a side, then A wins it.
    for (const tap of [pointA, pointA, pointA, pointB, pointB, pointB]) {
      await tap.click();
      await expect(tap).toBeEnabled();
    }
    await expect(
      ref.getByText("Poin penentu. Pasangan penerima memilih sisi:"),
    ).toBeVisible();
    await ref.getByRole("button", { name: "Terima di kanan" }).click();
    if (shots)
      await ref.screenshot({
        path: `${shots}/referee-golden.png`,
        fullPage: true,
      });
    // A mistaken tap is undone with a reason chip, no pop-up.
    await pointB.click();
    await expect(
      ref.getByText("Poin penentu. Pasangan penerima memilih sisi:"),
    ).toHaveCount(0);
    await ref.getByRole("button", { name: "Batalkan aksi terakhir" }).click();
    await ref.getByRole("button", { name: "Salah tekan" }).click();
    await expect(
      ref.getByText("Poin penentu. Pasangan penerima memilih sisi:"),
    ).toBeVisible();
    await pointA.click();
    await expect(pointA).toBeEnabled();
    // Three more games to A: 4–0.
    for (let i = 0; i < 12; i++) {
      await pointA.click();
      await expect(
        pointA.or(ref.getByRole("heading", { name: "Laga selesai" })),
      ).toBeVisible();
    }
    await expect(
      ref.getByRole("heading", { name: "Laga selesai" }),
    ).toBeVisible();
    await expect(
      ref.getByText("Pemenang: Tim 1A / Tim 1B · 4–0"),
    ).toBeVisible();
    if (shots)
      await ref.screenshot({
        path: `${shots}/referee-finish.png`,
        fullPage: true,
      });
    await expect(
      ref.getByRole("button", { name: "Kirim hasil ke panitia" }),
    ).toBeEnabled();
    await ref.getByRole("button", { name: "Kirim hasil ke panitia" }).click();
    await expect(
      ref.getByRole("heading", { name: "Hasil terkirim" }),
    ).toBeVisible();
    if (shots) await ref.screenshot({ path: `${shots}/referee-done.png` });
    assert.equal(
      await ref.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "referee page overflows",
    );

    // The organizer's report shows the result, ready to approve.
    await desk.goto(`${base}/admin/tournaments/${tournamentId}/hasil`);
    await expect(
      desk.getByRole("heading", { name: "Laporan hasil" }),
    ).toBeVisible();
    const row = desk.locator(".results-list li").first();
    await expect(row).toContainText("4–0");
    await expect(row).toContainText(`Wasit: Wasit ${courts[0].name}`);
    await expect(row).toContainText("Menunggu pengesahan");
    if (shots)
      await desk.screenshot({
        path: `${shots}/results-report.png`,
        fullPage: true,
      });
    await row.getByRole("button", { name: "Sahkan hasil" }).click();
    await expect(desk.getByText("Hasil laga 1 disahkan")).toBeVisible();
    await desk.getByRole("tab", { name: /Disahkan/ }).click();
    await expect(desk.locator(".results-list li").first()).toContainText(
      "Disahkan",
    );
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
      "PASS: court referee sign-in, start code, full match on the console, results report and approval",
    );
  } finally {
    await browser?.close();
    if (tournamentId) {
      const refs = await db.court.findMany({
        where: { tournamentId },
        select: { refereeUserId: true },
      });
      await db.scoringAction.deleteMany({
        where: { match: { stage: { category: { tournamentId } } } },
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
