const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const expect = baseExpect.configure({ timeout: 20000 });
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
(async () => {
  let userId, orgId, browser;
  const mark = randomUUID();
  try {
    userId = (
      await db.user.create({
        data: {
          email: `registration-${mark}@test.invalid`,
          username: mark,
          fullName: "Registration Browser",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Registration browser",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const admin = await browser.newContext();
    await admin.addCookies([
      {
        name: "token",
        value: jwt.sign({ userId, role: "ORGANIZER" }, process.env.JWT_SECRET, {
          expiresIn: "20m",
        }),
        url: base,
        httpOnly: true,
      },
    ]);
    await admin.addInitScript(
      (id) => localStorage.setItem("padel-organization", id),
      orgId,
    );
    const page = await admin.newPage();
    await page.goto(base + "/admin");
    await page
      .getByRole("link", { name: "Buat turnamen", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/tournaments\/new$/);
    await page
      .getByLabel("Nama turnamen", { exact: true })
      .fill("Empty Slots " + mark.slice(0, 6));
    await page
      .getByLabel("Mulai pertandingan", { exact: true })
      .fill("2026-11-12T08:00");
    await page.getByLabel("Lokasi", { exact: true }).fill("Registration Court");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Jumlah slot pasangan", { exact: true }).fill("2");
    await expect(page.getByLabel("Satu pasangan per baris")).toHaveCount(0);
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Buat turnamen dengan slot kosong",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tambahkan pasangan", exact: true }),
    ).toBeVisible();
    const t = await db.tournament.findFirstOrThrow({
      where: { organizationId: orgId },
      include: { categories: true },
    });
    const c = t.categories[0];
    assert.equal(c.maxEntries, 2);
    assert.equal(await db.entry.count({ where: { categoryId: c.id } }), 0);
    assert.equal(await db.stage.count({ where: { categoryId: c.id } }), 0);
    await expect(
      page.getByText("Slot kosong · belum ada pasangan", { exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: "Buka pendaftaran publik", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Tutup pendaftaran", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Pemain 1", { exact: true }).fill("Admin One");
    await page.getByLabel("Pemain 2", { exact: true }).fill("Admin Two");
    await page
      .getByRole("button", { name: "Tambah pasangan", exact: true })
      .click();
    await expect(
      page.getByText("Admin One / Admin Two", { exact: true }),
    ).toBeVisible();
    const publicContext = await browser.newContext();
    const participant = await publicContext.newPage();
    await participant.goto(base + "/tournament/" + t.slug);
    await expect(
      participant.getByRole("heading", {
        name: "Daftar turnamen",
        exact: true,
      }),
    ).toBeVisible();
    await participant
      .getByLabel("Nama pemain pertama", { exact: true })
      .fill("Public One");
    await participant
      .getByLabel("Nama pemain kedua", { exact: true })
      .fill("Public Two");
    await participant
      .getByLabel("Nomor WhatsApp penghubung", { exact: true })
      .fill("081234567890");
    await participant
      .getByRole("button", { name: "Daftarkan pasangan", exact: true })
      .click();
    await expect(
      participant.getByRole("status").filter({ hasText: "berhasil terdaftar" }),
    ).toContainText("berhasil terdaftar");
    await expect(
      participant.getByRole("button", {
        name: "Daftar sebagai cadangan",
        exact: true,
      }),
    ).toBeEnabled();
    await participant
      .getByLabel("Nama pemain pertama", { exact: true })
      .fill("Reserve One");
    await participant
      .getByLabel("Nama pemain kedua", { exact: true })
      .fill("Reserve Two");
    await participant
      .getByLabel("Nomor WhatsApp penghubung", { exact: true })
      .fill("081234567890");
    await participant
      .getByRole("button", { name: "Daftar sebagai cadangan", exact: true })
      .click();
    await expect(
      participant.getByRole("status").filter({ hasText: "Reserve One" }),
    ).toContainText("cadangan nomor 1");
    await participant
      .getByRole("button", { name: /Peserta terdaftar/ })
      .click();
    await expect(
      participant.getByText("Ganda terbuka · Cadangan nomor 1", {
        exact: true,
      }),
    ).toBeVisible();
    await mkdir("/tmp/padel-registration", { recursive: true });
    for (const width of [390, 1440]) {
      await participant.setViewportSize({ width, height: 1000 });
      assert(
        await participant.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await participant.screenshot({
        path: `/tmp/padel-registration/public-${width}.png`,
        fullPage: true,
      });
    }
    await page.reload();
    await expect(
      page.getByText("Public One / Public Two", { exact: true }),
    ).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    const mainRow = page
      .getByText("Admin One / Admin Two", { exact: true })
      .locator("../..");
    await mainRow
      .getByRole("button", { name: "Diskualifikasi", exact: true })
      .click();
    await expect(
      mainRow.getByText("Didiskualifikasi", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Konfirmasi masuk utama", exact: true })
      .click();
    const reserveRow = page
      .getByText("Reserve One / Reserve Two", { exact: true })
      .locator("../..");
    await expect(
      reserveRow.getByText("Peserta utama", { exact: true }),
    ).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `/tmp/padel-registration/admin-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Tutup pendaftaran", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Buka pendaftaran publik",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Lanjut: atur pertandingan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Buat bagan otomatis", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Undi ulang bagan", exact: true }),
    ).toBeVisible();
    assert.equal(await db.stage.count({ where: { categoryId: c.id } }), 1);
    await participant.reload();
    await expect(
      participant.getByRole("heading", {
        name: "Daftar turnamen",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.goto(base + "/admin/tournaments?new=1");
    await expect(page).toHaveURL(/\/admin\/tournaments\/new$/);
    console.log(
      "PASS: dashboard latest form, empty slots, admin/public registration, capacity, waitlist, disqualification, promotion, close registration, draw, legacy redirect",
    );
  } finally {
    if (browser) await browser.close();
    if (orgId) {
      const ts = await db.tournament.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      await db.auditLog.deleteMany({
        where: { tournamentId: { in: ts.map((t) => t.id) } },
      });
      await db.tournament.deleteMany({ where: { organizationId: orgId } });
      await db.player.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    console.log("Fixtures cleaned up");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
