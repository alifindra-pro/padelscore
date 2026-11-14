// Manual step-by-step flow: category, court, pairs, draw, schedule, publish,
// referee, then scoring with an offline interruption. Checks that the
// "Langkah berikutnya" card names the right next action at every stage.
// Run against a local server on a test database:
//   TEST_BASE_URL=http://localhost:3100 node --env-file=.env tests/browser/tournament-flow.cjs
const { chromium, expect: playwrightExpect } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const expect = playwrightExpect.configure({ timeout: 20000 });
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const output = "/tmp/padel-browser";

(async () => {
  let userId, orgId, tournamentId, browser;
  const suffix = randomUUID().slice(0, 8);
  const errors = [];
  try {
    await mkdir(output, { recursive: true });
    userId = (
      await prisma.user.create({
        data: {
          email: `flow-${suffix}@test.invalid`,
          username: `flow-${suffix}`,
          fullName: "Pengelola Uji Alur",
          role: "ORGANIZER",
          passwordHash: "unusable-test-hash",
        },
      })
    ).id;
    orgId = (
      await prisma.organization.create({
        data: {
          name: `Alur ${suffix}`,
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
    const created = await context.request.post(`${base}/api/v1/tournaments`, {
      headers: { "X-Organization-Id": orgId },
      data: {
        name: `Uji alur ${suffix}`,
        location: "Venue pengujian",
        startDate: "2026-11-01T01:00:00.000Z",
        endDate: "2026-11-01T16:59:00.000Z",
        timezone: "Asia/Jakarta",
      },
    });
    expect(created.status()).toBe(201);
    tournamentId = (await created.json()).data.id;

    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const nextStep = page.locator(".next-step");
    const button = (name) => page.getByRole("button", { name, exact: true });

    await page.goto(`${base}/admin/tournaments/${tournamentId}`);
    await expect(nextStep).toContainText("Belum ada kategori pertandingan.");
    await page
      .getByLabel("Nama kategori", { exact: true })
      .fill("Ganda terbuka");
    await button("Tambah kategori").click();
    await expect(nextStep).toContainText("Belum ada lapangan.");
    await page
      .getByLabel("Nama lapangan", { exact: true })
      .fill("Center Court");
    await button("Tambah lapangan").click();
    await expect(nextStep).toContainText("baru punya 0 pasangan");
    await nextStep.getByRole("button", { name: "Tambah peserta" }).click();

    for (const [i, pair] of [
      ["Andi Alur", "Budi Alur"],
      ["Citra Alur", "Deni Alur"],
    ].entries()) {
      await page.getByLabel("Pemain 1", { exact: true }).fill(pair[0]);
      await page.getByLabel("Pemain 2", { exact: true }).fill(pair[1]);
      await button("Tambah pasangan").click();
      await expect(
        page.getByText(pair.join(" / "), { exact: true }),
      ).toBeVisible();
      if (i === 0)
        await expect(nextStep).toContainText("baru punya 1 pasangan");
    }
    await expect(nextStep).toContainText("2 pasangan sudah terdaftar");
    await nextStep.getByRole("button", { name: "Buat bagan" }).click();
    await button("Buat bagan otomatis").click();
    await expect(nextStep).toContainText("1 laga belum punya jadwal.");

    // Once the bracket exists, the participant list is locked and says why.
    await page.getByRole("button", { name: "Tambah peserta" }).first().click();
    await expect(
      page.getByText("Bagan sudah dibuat, jadi daftar peserta dikunci.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(button("Tambah pasangan")).toHaveCount(0);
    await expect(button("Buka pendaftaran publik")).toHaveCount(0);
    await button("Buka bagan di langkah 3").click();

    await page.locator('input[name="start"]').fill("2026-11-01T08:00");
    await page.getByRole("button", { name: /Susun jadwal/ }).click();
    await expect(nextStep).toContainText("penonton belum bisa melihatnya");

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [i, step] of [
        "Siapkan acara",
        "Tambah peserta",
        "Atur pertandingan",
        "Jalankan & hasil",
      ].entries()) {
        await page.locator(".step-tab").nth(i).click();
        await expect(page.locator(".step-tab").nth(i)).toHaveAttribute(
          "aria-current",
          "step",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${output}/flow-${width}-${step.split(" ")[0]}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Draft: scoring links exist for a trial run, but nothing is public yet.
    await expect(
      page.getByText("Turnamen belum terbit.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Buka layar TV", exact: true }),
    ).toHaveCount(0);
    await button("Terbitkan turnamen").click();
    await expect(nextStep).toContainText("1 laga belum punya wasit");
    await page.getByLabel("Tugaskan wasit").selectOption(userId);
    await expect(nextStep).toContainText("Turnamen sudah terbit.");
    // The assigned referee stays selected after the data reloads.
    await expect(page.getByLabel("Tugaskan wasit")).toHaveValue(userId);
    await expect(button("Mulai turnamen")).toBeVisible();

    const match = await prisma.match.findFirstOrThrow({
      where: { stage: { category: { tournamentId } }, status: "SCHEDULED" },
    });
    const scorer = await context.newPage();
    scorer.on("pageerror", (e) => errors.push(e.message));
    await scorer.goto(`${base}/referee/v2/${match.id}`);
    await scorer.getByRole("button", { name: /Unduh pertandingan/ }).click();
    await scorer
      .getByRole("button", { name: "Lempar koin online", exact: true })
      .click();
    await scorer
      .getByLabel("Pilihan pemenang undian", { exact: true })
      .selectOption("SERVE");
    await scorer
      .getByRole("button", { name: "Mulai pertandingan", exact: true })
      .click();
    await expect(
      scorer.getByText("Semua aksi sudah tersimpan di server.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(scorer.getByText(/\b[A-Z]{2,}_[A-Z_]+\b/)).toHaveCount(0);

    // Points recorded offline wait on the device, then reach the server.
    await context.setOffline(true);
    await scorer.getByRole("button", { name: /^\+1 / }).first().click();
    await scorer.getByRole("button", { name: /^\+1 / }).first().click();
    await expect(
      scorer.getByText(/2 aksi tersimpan di perangkat, belum terkirim/),
    ).toBeVisible();
    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
            .version,
        { timeout: 20000 },
      )
      .toBe(3);
    await expect(
      scorer.getByText("Semua aksi sudah tersimpan di server.", {
        exact: false,
      }),
    ).toBeVisible();

    // Starting the first match moved the published tournament to in-progress.
    await page.reload();
    await expect(page.locator(".status-live").first()).toContainText(
      "Berlangsung",
    );
    await expect(nextStep).toContainText("1 laga belum selesai.");
    await nextStep.getByRole("button", { name: "Lihat pertandingan" }).click();
    await expect(
      page.getByRole("link", {
        name: "Lanjutkan pencatatan skor",
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      "PASS: manual setup with next-step guidance, locked entries, publish, referee, offline scoring, auto in-progress",
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
