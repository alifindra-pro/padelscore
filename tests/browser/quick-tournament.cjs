const { chromium, expect: playwrightExpect } = require("@playwright/test");
// Cloud database queries and first-time route compilation can exceed 5 seconds.
const expect = playwrightExpect.configure({ timeout: 15000 });
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const directPoints = process.env.TEST_DIRECT_POINTS === "1";
const output = directPoints
  ? "/tmp/padel-direct-points"
  : "/tmp/padel-quick-flow";

(async () => {
  let userId, orgId, tournamentId, browser;
  const suffix = randomUUID();
  const errors = [];
  try {
    await mkdir(output, { recursive: true });
    userId = (
      await prisma.user.create({
        data: {
          email: `browser-${suffix}@test.invalid`,
          username: `b-${suffix}`,
          fullName: "Pengelola Uji Browser",
          role: "ORGANIZER",
          passwordHash: "unusable-test-hash",
        },
      })
    ).id;
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Browser ${suffix}`,
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
      viewport: { width: 390, height: 844 },
    });
    await context.addCookies([
      {
        name: "token",
        value: jwt.sign({ userId, role: "ORGANIZER" }, process.env.JWT_SECRET, {
          expiresIn: "15m",
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/admin/tournaments`);
    await page
      .getByRole("link", { name: "Buat turnamen baru", exact: true })
      .click();
    await page
      .getByLabel("Nama turnamen", { exact: true })
      .fill(`Uji cepat ${suffix}`);
    await page
      .getByLabel("Mulai pertandingan", { exact: true })
      .fill("2026-11-01T08:00");
    await page.getByLabel("Lokasi", { exact: true }).fill("Venue pengujian");
    if (directPoints) {
      await page
        .getByRole("radio", { name: "Poin langsung", exact: true })
        .check();
      await page.getByRole("button", { name: "24 poin", exact: true }).click();
      await expect(
        page.getByRole("radio", { name: "Sistem gugur", exact: true }),
      ).toBeChecked();
      await expect(page.getByText("Jika skor 40–40 (deuce)")).toHaveCount(0);
    }
    await page
      .getByText("Aturan dan pengaturan lainnya", { exact: false })
      .click();
    await page.getByLabel("Zona waktu").selectOption("Asia/Makassar");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${output}/setup-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByLabel("Isi nama peserta sekarang (opsional)", { exact: true })
      .check();
    await page
      .getByLabel("Satu pasangan per baris")
      .fill("Andi / Budi\nAndi / Deni");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "nama pemain berulang",
    );
    await page
      .getByLabel("Satu pasangan per baris")
      .fill("Andi Pratama / Budi Santoso\nCitra Dewi / Deni Putra");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(
      page.getByText("2026-11-01 08:00 WITA", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(page.getByLabel("Satu pasangan per baris")).toHaveValue(
      /Andi Pratama/,
    );
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Buat turnamen, bagan & jadwal",
        exact: true,
      })
      .click();
    await page.waitForURL(/\/admin\/tournaments\/[^/?]+\?step=3$/);
    tournamentId = new URL(page.url()).pathname.split("/").pop();
    await expect(
      page.getByRole("heading", { name: "Jalankan turnamen", exact: true }),
    ).toBeVisible();
    const match = await prisma.match.findFirstOrThrow({
      where: { stage: { category: { tournamentId } } },
    });
    expect(match.scheduledAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(
      (
        await context.request.get(
          `${base}/api/v2/matches/${match.id}/result.pdf`,
        )
      ).status(),
    ).toBe(409);
    await page.getByLabel("Tugaskan wasit").selectOption(userId);
    await expect(
      page.getByText("Wasit ditugaskan", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Buka pendaftaran publik", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Tutup pendaftaran & lanjutkan",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("link", { name: "Buka layar TV", exact: true }),
    ).toBeVisible();

    const viewer = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const tv = await viewer.newPage();
    tv.on("pageerror", (e) => errors.push(e.message));
    await tv.goto(`${base}/tv/${match.id}`);
    await expect(
      tv.getByRole("heading", { name: /Andi Pratama|Citra Dewi/ }).first(),
    ).toBeVisible();
    const scorer = await context.newPage();
    await scorer.goto(`${base}/referee/v2/${match.id}`);
    await scorer
      .getByRole("button", {
        name: "Unduh pertandingan & mulai mencatat",
        exact: true,
      })
      .click();
    await scorer
      .getByRole("button", { name: "Mulai pertandingan", exact: true })
      .click();
    await scorer.getByRole("button", { name: /^\+1 / }).first().click();
    await expect(tv.locator(".tv-points strong").first()).toHaveText(
      directPoints ? "1" : "15",
      {
        timeout: 15000,
      },
    );
    await viewer.setOffline(true);
    await expect(
      tv.getByText("Koneksi terganggu. Menampilkan skor terakhir.", {
        exact: false,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(tv.locator(".tv-points strong").first()).toHaveText(
      directPoints ? "1" : "15",
    );
    await viewer.setOffline(false);
    for (let i = 1; i < 24; i++)
      await scorer
        .getByRole("button", { name: /^\+1 / })
        .nth(directPoints && i >= 12 ? 1 : 0)
        .click();
    if (directPoints) {
      await expect(
        scorer.getByText("Seri — satu poin berikutnya menentukan pemenang."),
      ).toBeVisible();
      await expect(
        scorer.getByRole("button", { name: "Finalisasi hasil", exact: true }),
      ).toHaveCount(0);
      await scorer.getByRole("button", { name: /^\+1 / }).last().click();
    }
    await expect(scorer.getByText(/0 aksi tersimpan di perangkat/)).toBeVisible(
      { timeout: 15000 },
    );
    await scorer
      .getByRole("button", { name: "Finalisasi hasil", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
            .stateV2.finalized,
      )
      .toBe(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Sahkan hasil", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Unduh PDF hasil", exact: true }),
    ).toBeVisible();
    await expect(tv.getByText("Disahkan admin", { exact: false })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      tv.locator(".tv-result").filter({ hasText: "Hasil diterima server" }),
    ).toContainText(/WITA|GMT\+8/);
    if (directPoints) {
      await expect(tv.locator(".tv-sets strong")).toHaveCount(0);
      await expect(tv.locator(".tv-points strong")).toHaveText(["12", "13"]);
    } else await expect(tv.locator(".tv-sets strong").first()).toHaveText("6");
    for (const width of [390, 768, 1920]) {
      await tv.setViewportSize({ width, height: 1080 });
      await tv.evaluate(() => window.scrollTo(0, 0));
      expect(
        await tv.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await tv.screenshot({
        path: `${output}/tv-${width}.png`,
        fullPage: true,
      });
    }
    await tv.getByRole("button", { name: "Layar penuh", exact: true }).click();
    expect(await tv.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await tv.getByRole("button", { name: "Layar penuh", exact: true }).click();
    const [download] = await Promise.all([
      tv.waitForEvent("download"),
      tv.getByRole("link", { name: "PDF hasil", exact: true }).click(),
    ]);
    await download.saveAs(`${output}/hasil-laga.pdf`);
    await tv.getByRole("link", { name: "Detail laga", exact: true }).click();
    await expect(
      tv.getByRole("link", { name: "Unduh PDF hasil", exact: true }),
    ).toBeVisible();
    await tv.getByRole("link", { name: "Buka layar TV", exact: true }).click();
    await expect(tv.locator(".tv-board")).toBeVisible();
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "DRAFT" },
    });
    await expect(
      tv.getByRole("heading", { name: "Skor belum tersedia", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(tv.locator(".tv-board")).toHaveCount(0);
    expect(errors).toEqual([]);
    await writeFile(
      `${output}/report.json`,
      JSON.stringify(
        {
          passed: true,
          checks: [
            "wizard validation and back navigation",
            "WITA conversion",
            "step 3 redirect",
            "referee assignment",
            "publication",
            "live score",
            "offline recovery",
            "approval",
            "PDF download",
            "fullscreen",
            "responsive widths",
            "public detail links",
            "unpublication hides stale scores",
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS: quick setup → scoring → approval → TV/PDF; artifacts: ${output}`,
    );
  } finally {
    if (browser) await browser.close();
    if (userId) await prisma.auditLog.deleteMany({ where: { userId } });
    if (orgId) {
      await prisma.scoringAction.deleteMany({
        where: {
          match: {
            stage: { category: { tournament: { organizationId: orgId } } },
          },
        },
      });
      await prisma.tournament.deleteMany({ where: { organizationId: orgId } });
      await prisma.player.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
