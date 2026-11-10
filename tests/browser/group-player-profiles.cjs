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
(async () => {
  let userId, orgId, browser;
  const marker = randomUUID();
  try {
    userId = (
      await db.user.create({
        data: {
          email: `profile-${marker}@test.invalid`,
          username: marker,
          fullName: "Profile Test",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Profile browser",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    const a = await db.player.create({
      data: { organizationId: orgId, fullName: "Andi Profile" },
    });
    const b = await db.player.create({
      data: { organizationId: orgId, fullName: "Budi Profile" },
    });
    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const context = await browser.newContext();
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/admin/players");
    const png = await sharp({
      create: { width: 160, height: 200, channels: 3, background: "#0861ab" },
    })
      .png()
      .toBuffer();
    const uploaded = page.waitForResponse(
      (r) =>
        r.url().includes(`/players/${a.id}/photo`) &&
        r.request().method() === "POST",
    );
    await page.getByLabel("Foto Andi Profile", { exact: true }).setInputFiles({
      name: "player.png",
      mimeType: "image/png",
      buffer: png,
    });
    assert.equal((await uploaded).status(), 200);
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: "Foto Andi Profile", exact: true })
          .evaluate((img) => img.naturalWidth),
      )
      .toBe(512);
    await page.reload();
    await expect(
      page.getByRole("img", { name: "Foto Andi Profile", exact: true }),
    ).toBeVisible();
    await mkdir("/tmp/padel-profiles", { recursive: true });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `/tmp/padel-profiles/directory-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("row")
      .filter({ hasText: "Andi Profile" })
      .getByRole("button", { name: "Edit profil", exact: true })
      .click();
    await page.getByPlaceholder("+62 812...").fill("+628123456789");
    await page
      .getByRole("button", { name: "Simpan Atlet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Edit profil pemain", exact: true }),
    ).toHaveCount(0);
    assert.equal(
      (await db.player.findUniqueOrThrow({ where: { id: a.id } })).phone,
      "+628123456789",
    );
    await page.goto(base + "/admin/tournaments/new");
    await page
      .getByLabel("Nama turnamen", { exact: true })
      .fill("Profile Groups " + marker.slice(0, 6));
    await page
      .getByLabel("Mulai pertandingan", { exact: true })
      .fill("2026-11-10T08:00");
    await page.getByLabel("Lokasi", { exact: true }).fill("Profile court");
    await page
      .getByRole("radio", { name: "Grup + gugur", exact: true })
      .check();
    await page.getByLabel("Jumlah grup", { exact: true }).fill("2");
    await page.getByLabel("Lolos per grup", { exact: true }).fill("1");
    await page
      .getByRole("radio", { name: "Poin langsung", exact: true })
      .check();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByLabel("Isi nama peserta sekarang (opsional)", { exact: true })
      .check();
    await page.getByLabel("Pemain pertama", { exact: true }).selectOption(a.id);
    await page.getByLabel("Pemain kedua", { exact: true }).selectOption(b.id);
    await page
      .getByRole("button", {
        name: "Tambahkan pasangan dari pemain",
        exact: true,
      })
      .click();
    const text = page.getByLabel("Satu pasangan per baris");
    await expect(text).toHaveValue("Andi Profile / Budi Profile");
    await text.fill(
      (await text.inputValue()) +
        "\nCitra Test / Deni Test\nEka Test / Fani Test\nGina Test / Hari Test",
    );
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Buat turnamen, bagan & jadwal",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Jalankan turnamen", exact: true }),
    ).toBeVisible();
    const t = await db.tournament.findFirstOrThrow({
      where: { organizationId: orgId },
      include: { categories: true },
    });
    const cid = t.categories[0].id;
    assert.equal(
      await db.player.count({
        where: { id: { in: [a.id, b.id] }, organizationId: orgId },
      }),
      2,
    );
    assert.equal(
      await db.player.count({ where: { organizationId: orgId } }),
      8,
    );
    const groups = await db.group.findMany({
      where: { stage: { categoryId: cid } },
      include: { matches: true },
    });
    assert.equal(groups.length, 2);
    await page.goto(`${base}/admin/tournaments/${t.id}?step=2`);
    await page
      .getByRole("button", {
        name: "Buat knockout dari hasil grup",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Sahkan semua hasil grup terlebih dahulu", {
        exact: true,
      }),
    ).toBeVisible();
    for (const g of groups) {
      for (const m of g.matches)
        await db.match.update({
          where: { id: m.id },
          data: {
            status: "APPROVED",
            approvalStatus: "APPROVED",
            winnerId: m.entryAId,
            scoreSnapshot: {
              create: {
                pointsA: "15",
                pointsB: "9",
                setsA: 0,
                setsB: 0,
                gamesA: [],
                gamesB: [],
              },
            },
          },
        });
    }
    await page
      .getByRole("button", {
        name: "Buat knockout dari hasil grup",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Knockout sudah dibuat", exact: true }),
    ).toBeDisabled();
    await db.tournament.update({
      where: { id: t.id },
      data: { status: "PUBLISHED" },
    });
    const viewer = await browser.newContext();
    const publicPage = await viewer.newPage();
    await publicPage.goto(base + "/tournament/" + t.slug);
    await publicPage.getByRole("button", { name: /Peserta terdaftar/ }).click();
    await expect(
      publicPage.getByRole("img", { name: "Foto Andi Profile", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        publicPage
          .getByRole("img", { name: "Foto Andi Profile", exact: true })
          .evaluate((img) => img.naturalWidth),
      )
      .toBe(512);
    for (const width of [390, 1440]) {
      await publicPage.setViewportSize({ width, height: 1000 });
      assert(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await publicPage.screenshot({
        path: `/tmp/padel-profiles/participants-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: player photo survives reload; saved players form a group tournament; approvals gate knockout; individual photo public and responsive",
    );
  } finally {
    if (browser) await browser.close();
    if (orgId) {
      const client = new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        region: process.env.AWS_REGION || "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      for (const p of await db.player.findMany({
        where: { organizationId: orgId },
      }))
        if (p.photoKey)
          await client.send(
            new DeleteObjectCommand({ Bucket: "assets", Key: p.photoKey }),
          );
      await db.auditLog.deleteMany({ where: { userId } });
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
