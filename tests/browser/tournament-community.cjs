const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const expect = baseExpect.configure({ timeout: 20000 });
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const output = "/tmp/padel-community";
(async () => {
  let userId, orgId, browser;
  const tids = [randomUUID(), randomUUID()];
  try {
    userId = (
      await db.user.create({
        data: {
          email: `community-${tids[0]}@test.invalid`,
          username: `community-${tids[0]}`,
          fullName: "Community Browser",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Uji sponsor dan sanggahan",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const admin = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
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
    for (const [i, requestId] of tids.entries()) {
      const response = await admin.request.post(
        base + "/api/v2/tournaments/setup",
        {
          headers: { "X-Organization-Id": orgId },
          data: {
            requestId,
            name: i ? "Padel Community Groups" : "Padel Community Cup",
            location: "Court Addictive",
            start: "2026-11-08T01:00:00.000Z",
            timezone: "Asia/Jakarta",
            category: "Ganda Open",
            courts: 2,
            preset: "POINTS",
            totalPoints: 24,
            format: i ? "ROUND_ROBIN" : "SINGLE_ELIMINATION",
            pairs: Array.from({ length: i ? 4 : 8 }, (_, j) => [
              `Pemain ${j + 1} A`,
              `Pemain ${j + 1} B`,
            ]),
            duration: 30,
            rest: 10,
          },
        },
      );
      assert.equal(response.status(), 201, await response.text());
    }
    await db.tournament.updateMany({
      where: { id: { in: tids } },
      data: { status: "PUBLISHED" },
    });
    const events = await db.tournament.findMany({
      where: { id: { in: tids } },
    });
    const match = await db.match.findFirstOrThrow({
      where: { stage: { category: { tournamentId: tids[0] } }, round: 1 },
      orderBy: { matchNumber: "asc" },
    });
    await db.match.update({
      where: { id: match.id },
      data: {
        status: "FINISHED",
        winnerId: match.entryAId,
        scoreSnapshot: {
          create: {
            pointsA: "15",
            pointsB: "9",
            gamesA: [],
            gamesB: [],
            setsA: 0,
            setsB: 0,
          },
        },
      },
    });
    const page = await admin.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mkdir(output, { recursive: true });
    const capture = async (p, name) => {
      for (const width of [390, 1440]) {
        await p.setViewportSize({ width, height: 1000 });
        await p.evaluate(() => window.scrollTo(0, 0));
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
          `${name} overflow ${width}`,
        );
        await p.screenshot({
          path: `${output}/${name}-${width}.png`,
          fullPage: true,
        });
      }
    };
    await page.goto(`${base}/admin/tournaments/${tids[0]}/community`);
    await expect(
      page.getByRole("heading", { name: "Sponsor & sanggahan", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Nama sponsor", { exact: true })
      .fill("Court Partner");
    await page
      .getByLabel("Website sponsor (opsional)")
      .fill("https://example.com");
    const png = await sharp(
      Buffer.from(
        '<svg width="480" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="160" rx="12" fill="#0060aa"/><text x="240" y="95" text-anchor="middle" fill="white" font-size="42" font-family="sans-serif">COURT PARTNER</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    await page
      .getByLabel("Logo sponsor", { exact: true })
      .setInputFiles({
        name: "partner.png",
        mimeType: "image/png",
        buffer: png,
      });
    await page
      .getByRole("button", { name: "Tambahkan sponsor", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "Logo Court Partner", exact: true }),
    ).toBeVisible();
    await page.goto(`${base}/admin/tournaments/${tids[1]}/community`);
    await expect(
      page.getByText("0/12 sponsor.", { exact: false }),
    ).toBeVisible();
    const viewer = await browser.newContext();
    const publicPage = await viewer.newPage();
    publicPage.on("pageerror", (e) => errors.push(e.message));
    await publicPage.goto(
      `${base}/tournament/${events.find((t) => t.id === tids[0]).slug}`,
    );
    await expect(
      publicPage.getByRole("img", { name: "Logo Court Partner", exact: true }),
    ).toBeVisible();
    await publicPage
      .getByRole("button", { name: "Knockout", exact: true })
      .click();
    await expect(publicPage.locator(".bracket-round")).toHaveCount(3);
    await capture(publicPage, "knockout-sponsor");
    await publicPage
      .getByRole("button", { name: "Sanggah hasil", exact: true })
      .click();
    await publicPage.locator(".dispute-match-link").first().click();
    await expect(
      publicPage.getByRole("heading", {
        name: "Sanggah hasil pertandingan",
        exact: true,
      }),
    ).toBeVisible();
    await publicPage.getByText("Ajukan sanggahan", { exact: true }).click();
    await publicPage
      .getByLabel("Nama peserta pengaju")
      .fill("Peserta Pengujian");
    await publicPage
      .getByLabel("Email atau nomor WhatsApp")
      .fill("peserta@example.test");
    await publicPage
      .getByLabel("Alasan sanggahan", { exact: true })
      .fill(
        "Poin terakhir seharusnya masuk pasangan B. Mohon panitia meninjau rekaman laga.",
      );
    await publicPage
      .getByRole("button", { name: "Kirim sanggahan", exact: true })
      .click();
    await expect(
      publicPage.getByText("Sanggahan terkirim.", { exact: false }),
    ).toBeVisible();
    const receipt = await publicPage
      .getByLabel("Kode pelacakan sanggahan")
      .inputValue();
    assert.match(receipt, /^[\w-]+\.[a-f0-9]{64}$/);
    await page.goto(`${base}/admin/tournaments/${tids[0]}/community`);
    await expect(
      page.getByRole("button", { name: "Menunggu (1)", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Keputusan", { exact: true })
      .selectOption("REJECTED");
    await page
      .getByLabel("Tanggapan untuk peserta")
      .fill(
        "Rekaman telah diperiksa. Hasil 15–9 tetap berlaku sesuai catatan wasit.",
      );
    await page
      .getByRole("button", { name: "Simpan keputusan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Menunggu (0)", exact: true }),
    ).toBeVisible();
    await publicPage
      .getByRole("button", { name: "Periksa status sanggahan", exact: true })
      .click();
    await expect(
      publicPage.getByText("Sanggahan ditolak", { exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("Rekaman telah diperiksa.", { exact: false }),
    ).toBeVisible();
    await capture(publicPage, "dispute-response");
    await page
      .getByRole("button", { name: "Semua sanggahan", exact: true })
      .click();
    await capture(page, "admin-community");
    await publicPage.goto(
      `${base}/tournament/${events.find((t) => t.id === tids[1]).slug}`,
    );
    await publicPage
      .getByRole("button", { name: "Klasemen grup", exact: true })
      .click();
    await expect(publicPage.locator(".group-card")).toHaveCount(1);
    await expect(publicPage.locator(".group-card tbody tr")).toHaveCount(4);
    await publicPage.getByText("Jadwal & hasil grup", { exact: false }).click();
    await expect(
      publicPage.locator(".group-fixtures .bracket-match"),
    ).toHaveCount(6);
    await capture(publicPage, "groups");
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: match.id } })).winnerId,
      match.entryAId,
    );
    page.on("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Hapus Court Partner", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "Logo Court Partner", exact: true }),
    ).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: sponsor isolation/upload/display/delete, public dispute/review/private tracking, knockout and group UI responsive",
    );
  } finally {
    if (browser) await browser.close();
    const s3 = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3 || process.env.S3_ENDPOINT,
      region: process.env.AWS_REGION || process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY,
        secretAccessKey:
          process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY,
      },
    });
    for (const s of await db.tournamentSponsor.findMany({
      where: { tournamentId: { in: tids } },
    }))
      await s3
        .send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_ENDPOINT_URL_S3
              ? "assets"
              : process.env.S3_BUCKET || "padel",
            Key: s.logoKey,
          }),
        )
        .catch(() => {});
    if (userId) await db.auditLog.deleteMany({ where: { userId } });
    await db.tournament.deleteMany({ where: { id: { in: tids } } });
    if (orgId) {
      await db.player.deleteMany({ where: { organizationId: orgId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    console.log("Community fixtures cleaned up");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
