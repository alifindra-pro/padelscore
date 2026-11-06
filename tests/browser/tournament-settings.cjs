const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const expect = baseExpect.configure({ timeout: 20000 });
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const output = "/tmp/padel-tournament-settings";
(async () => {
  const suffix = randomUUID();
  let userId, orgId, browser;
  try {
    userId = (
      await prisma.user.create({
        data: {
          email: `settings-${suffix}@test.invalid`,
          username: `settings-${suffix}`,
          fullName: "Settings Test",
          passwordHash: "unusable-test-hash",
          role: "ORGANIZER",
        },
      })
    ).id;
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Settings ${suffix}`,
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies([
      {
        name: "token",
        value: jwt.sign({ userId, role: "ORGANIZER" }, process.env.JWT_SECRET, {
          expiresIn: "20m",
        }),
        url: base,
        httpOnly: true,
      },
    ]);
    await context.addInitScript(
      (id) => localStorage.setItem("padel-organization", id),
      orgId,
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir(output, { recursive: true });
    const capture = async (name) => {
      if (process.env.SKIP_SCREENSHOTS === "1") return;
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(350);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${name} overflows at ${width}`,
        );
        await page.screenshot({
          path: `${output}/${name}-${width}.png`,
          fullPage: true,
        });
      }
    };
    await page.goto(`${base}/admin/tournaments/new`);
    await expect(
      page.getByRole("radio", { name: "Sistem gugur", exact: true }),
    ).toBeChecked();
    await capture("classic");
    await page.getByRole("radio", { name: "Americano", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("radio", { name: "Americano", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel("Total poin per laga", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Satu set standar", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "24 poin", exact: true }).click();
    await page.getByLabel("Jumlah ronde", { exact: true }).fill("3");
    await page
      .getByRole("radio", { name: "Rata-rata poin", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await page
      .getByLabel("Nama turnamen", { exact: true })
      .fill(`Americano ${suffix}`);
    await page
      .getByLabel("Mulai pertandingan", { exact: true })
      .fill("2026-11-12T08:00");
    await page.getByLabel("Lokasi", { exact: true }).fill("Lapangan uji");
    await page
      .getByText("Aturan dan pengaturan lainnya", { exact: false })
      .click();
    await page
      .getByLabel("Zona waktu", { exact: true })
      .selectOption("Asia/Makassar");
    await capture("americano");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByLabel("Satu pemain per baris", { exact: true })
      .fill("Andi\nBudi\nCitra\nAndi");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "nama pemain berulang",
    );
    await page
      .getByLabel("Satu pemain per baris", { exact: true })
      .fill("Andi\nBudi\nCitra\nDeni\nEka");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(
      page.getByText("24 poin per laga · 3 ronde", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(
      page.getByLabel("Satu pemain per baris", { exact: true }),
    ).toHaveValue("Andi\nBudi\nCitra\nDeni\nEka");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await capture("review");
    await page
      .getByRole("button", {
        name: "Buat Americano & ronde pertama",
        exact: true,
      })
      .click();
    await page.waitForURL(/\/admin\/social\?id=/);
    const eventId = new URL(page.url()).searchParams.get("id");
    await expect(
      page.getByRole("heading", { name: `Americano ${suffix}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ronde 1", exact: true }),
    ).toBeVisible();
    const event = await prisma.socialEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    assert.equal(event.config.target, 24);
    assert.equal(event.config.ranking, "AVERAGE");
    assert.equal(event.config.start, "2026-11-12T00:00:00.000Z");
    assert.equal(event.rounds[0].waiting.length, 1);
    assert.equal(event.published, false);
    await expect(
      page.getByRole("button", { name: "Buat ronde berikutnya", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Poin pasangan A", { exact: true }).fill("15");
    await page.getByLabel("Poin pasangan B", { exact: true }).fill("9");
    await page
      .getByRole("button", { name: "Sahkan hasil", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Buat ronde berikutnya", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("table")).toContainText("15.00");
    await capture("social-results");
    await page
      .getByRole("button", { name: "Buat ronde berikutnya", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ronde 2", exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/admin/tournaments`);
    await expect(
      page.getByRole("link", { name: new RegExp(`Americano ${suffix}`) }),
    ).toBeVisible();
    const classicId = randomUUID();
    const setupResponse = await context.request.post(
      `${base}/api/v2/tournaments/setup`,
      {
        headers: { "X-Organization-Id": orgId },
        data: {
          requestId: classicId,
          name: `Rules ${suffix}`,
          location: "Test court",
          start: "2026-11-12T00:00:00.000Z",
          timezone: "Asia/Jakarta",
          category: "Doubles",
          courts: 1,
          preset: "SINGLE",
          format: "SINGLE_ELIMINATION",
          duration: 60,
          rest: 30,
          pairs: [
            ["Player One", "Player Two"],
            ["Player Three", "Player Four"],
          ],
        },
      },
    );
    assert.equal(setupResponse.status(), 201);
    await page.goto(`${base}/admin/tournaments/${classicId}?step=2`);
    await expect(
      page.getByRole("heading", { name: "Pilih aturan skor", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("radio", { name: "Golden Point", exact: true })
      .focus();
    await page.keyboard.press("Space");
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/v2/categories/"),
    );
    await page
      .getByRole("button", { name: "Simpan aturan pertandingan", exact: true })
      .click();
    assert.equal((await saved).status(), 200);
    const category = await prisma.category.findFirstOrThrow({
      where: { tournamentId: classicId },
    });
    assert.equal(category.rulesV2.deuce, "GOLDEN_POINT");
    await expect(
      page.getByRole("button", {
        name: "Simpan aturan pertandingan",
        exact: true,
      }),
    ).toBeEnabled();
    await capture("workspace-rules");
    await page
      .getByRole("link", { name: "Atur bagan secara rinci", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Aturan & operasional kompetisi",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Golden Point", exact: true }),
    ).toBeChecked();
    await capture("advanced-rules");
    await page
      .getByRole("radio", { name: "Poin langsung", exact: true })
      .check();
    await page.getByRole("button", { name: "32 poin", exact: true }).click();
    const pointsSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/v2/categories/"),
    );
    await page
      .getByRole("button", { name: "Simpan aturan", exact: true })
      .click();
    assert.equal((await pointsSaved).status(), 200);
    await page.goto(`${base}/admin/tournaments/${classicId}?step=2`);
    await expect(
      page.getByRole("radio", { name: "Poin langsung", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel("Total poin per pertandingan", { exact: true }),
    ).toHaveValue("32");
    await page.getByRole("button", { name: "24 poin", exact: true }).click();
    const updated = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/v2/categories/"),
    );
    await page
      .getByRole("button", { name: "Simpan aturan pertandingan", exact: true })
      .click();
    assert.equal((await updated).status(), 200);
    const pointCategory = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    });
    assert.equal(pointCategory.rulesV2.mode, "POINTS");
    assert.equal(pointCategory.rulesV2.totalPoints, 24);
    await capture("workspace-direct-points");

    await page.goto(`${base}/admin/tournaments/new?format=MEXICANO`);
    await expect(
      page.getByRole("radio", { name: "Mexicano", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "Seimbang", exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Berdekatan", exact: true }).focus();
    await page.keyboard.press("Space");
    await capture("mexicano");
    assert.deepEqual(errors, []);
    console.log(
      `PASS: unified setup, keyboard choices, 24-point Americano, ranking, first/next rounds, list navigation and responsive UI; screenshots: ${output}`,
    );
  } finally {
    await browser?.close();
    if (userId) await prisma.auditLog.deleteMany({ where: { userId } });
    if (orgId) {
      await prisma.tournament.deleteMany({ where: { organizationId: orgId } });
      await prisma.socialEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.player.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    console.log("Settings fixtures cleaned up");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
