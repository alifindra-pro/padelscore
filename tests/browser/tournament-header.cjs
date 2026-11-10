const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const sharp = require("sharp");
const jwt = require("jsonwebtoken");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const expect = baseExpect.configure({ timeout: 20000 });
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
(async () => {
  let userId, orgId, browser;
  const tids = [];
  try {
    userId = (
      await db.user.create({
        data: {
          email: `header-${randomUUID()}@test.invalid`,
          username: randomUUID(),
          fullName: "Header tester",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Header test",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    const make = async () => {
      const id = randomUUID();
      tids.push(id);
      return db.tournament.create({
        data: {
          id,
          slug: `header-${id}`,
          name: "Original tournament",
          organizationId: orgId,
          startDate: new Date(),
          endDate: new Date(),
          status: "DRAFT",
        },
      });
    };
    const t = await make();
    const other = await make();
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
    const publicContext = await browser.newContext();
    const url = `${base}/api/v2/tournaments/${t.id}/header`;
    assert.equal((await publicContext.request.get(url)).status(), 404);
    assert.equal(
      (
        await publicContext.request.patch(url, {
          data: { title: "Unauthorized", description: "" },
        })
      ).status(),
      401,
    );
    assert.equal(
      (
        await admin.request.patch(url, {
          data: { title: "x".repeat(121), description: "" },
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await admin.request.post(url + "?image=banner", {
          multipart: {
            file: {
              name: "fake.png",
              mimeType: "image/png",
              buffer: Buffer.from("not an image"),
            },
          },
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await admin.request.patch(url, {
          data: {
            title: "Color",
            description: "",
            themeColor: "red; background:url(invalid)",
          },
        })
      ).status(),
      400,
    );
    const page = await admin.newPage();
    await page.goto(`${base}/admin/tournaments/${t.id}/community`);
    await page
      .getByLabel("Judul tampilan", { exact: true })
      .fill("Addictive Invitational");
    await page
      .getByLabel("Deskripsi header", { exact: true })
      .fill("Main bersama. Bertanding sportif.\nJakarta Padel Weekend");
    await page.getByLabel("Warna tema", { exact: true }).fill("#e0bdff");
    await page
      .getByRole("button", { name: "Simpan header", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Header turnamen disimpan",
    );
    for (const kind of ["banner", "logo"]) {
      const image = await sharp({
        create: {
          width: kind === "banner" ? 1600 : 300,
          height: kind === "banner" ? 600 : 300,
          channels: 4,
          background: kind === "banner" ? "#075bac" : "#dfff00",
        },
      })
        .png()
        .toBuffer();
      await page
        .getByLabel(kind === "banner" ? "Banner turnamen" : "Logo turnamen", {
          exact: true,
        })
        .setInputFiles({
          name: `${kind}.png`,
          mimeType: "image/png",
          buffer: image,
        });
      await page
        .getByRole("button", { name: `Unggah ${kind}`, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: `Hapus ${kind}`, exact: true }),
      ).toBeVisible();
    }
    await page.reload();
    await expect(
      page.getByLabel("Judul tampilan", { exact: true }),
    ).toHaveValue("Addictive Invitational");
    await expect(
      page.getByRole("img", {
        name: "Banner Addictive Invitational",
        exact: true,
      }),
    ).toBeVisible();
    const saved = await db.tournament.findUniqueOrThrow({
      where: { id: t.id },
    });
    assert.equal(saved.headerThemeColor, "#e0bdff");
    assert.equal(saved.name, t.name);
    assert.equal(saved.slug, t.slug);
    const unchanged = await db.tournament.findUniqueOrThrow({
      where: { id: other.id },
    });
    assert.equal(unchanged.headerBannerKey, null);
    assert.equal(unchanged.headerTitle, null);
    assert.equal(
      (await publicContext.request.get(url + "?image=banner")).status(),
      404,
    );
    await db.tournament.update({
      where: { id: t.id },
      data: { status: "PUBLISHED" },
    });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${base}/tournament/${t.slug}`);
    await expect(
      publicPage.getByRole("heading", {
        name: "Addictive Invitational",
        exact: true,
      }),
    ).toBeVisible();
    for (const kind of ["Banner", "Logo"]) {
      const image = publicPage.getByRole("img", {
        name: `${kind} Addictive Invitational`,
        exact: true,
      });
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((e) => e.naturalWidth))
        .toBeGreaterThan(0);
    }
    const json = await (await publicContext.request.get(url)).json();
    assert.equal(json.data.headerBannerKey, undefined);
    assert.equal(json.data.themeColor, "#e0bdff");
    assert.equal(
      await publicPage
        .locator(".event-public-page")
        .evaluate((e) =>
          getComputedStyle(e).getPropertyValue("--color-brand-accent").trim(),
        ),
      "#e0bdff",
    );
    await mkdir("/tmp/padel-header", { recursive: true });
    for (const width of [390, 1440]) {
      await publicPage.setViewportSize({ width, height: 1000 });
      assert(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await publicPage.screenshot({
        path: `/tmp/padel-header/public-${width}.png`,
        fullPage: true,
      });
    }
    page.on("dialog", (d) => d.accept());
    for (const kind of ["banner", "logo"]) {
      await page
        .getByRole("button", { name: `Hapus ${kind}`, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: `Hapus ${kind}`, exact: true }),
      ).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Gunakan biru bawaan", exact: true })
      .click();
    await expect(page.getByLabel("Warna tema", { exact: true })).toHaveValue(
      "#005baa",
    );
    await page.getByLabel("Judul tampilan", { exact: true }).fill("");
    await page.getByLabel("Deskripsi header", { exact: true }).fill("");
    await page
      .getByRole("button", { name: "Simpan header", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Original tournament", exact: true }),
    ).toBeVisible();
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", {
        name: "Original tournament",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      (await publicContext.request.get(url + "?image=banner")).status(),
      404,
    );
    console.log(
      "PASS: header text, upload, reload, per-tournament isolation, public/draft access, invalid upload, mobile/desktop, delete and fallback",
    );
  } finally {
    if (browser) await browser.close();
    const rows = await db.tournament.findMany({ where: { id: { in: tids } } });
    const isNeon = !!process.env.AWS_ENDPOINT_URL_S3;
    const s3 = new S3Client({
      endpoint: isNeon
        ? process.env.AWS_ENDPOINT_URL_S3
        : process.env.S3_ENDPOINT,
      region: process.env.AWS_REGION || process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: isNeon
          ? process.env.AWS_ACCESS_KEY_ID
          : process.env.S3_ACCESS_KEY,
        secretAccessKey: isNeon
          ? process.env.AWS_SECRET_ACCESS_KEY
          : process.env.S3_SECRET_KEY,
      },
    });
    for (const row of rows)
      for (const key of [row.headerBannerKey, row.headerLogoKey].filter(
        Boolean,
      )) {
        assert(key.startsWith(`tournament-headers/${row.id}/`));
        await s3.send(
          new DeleteObjectCommand({
            Bucket: isNeon ? "assets" : process.env.S3_BUCKET || "padel",
            Key: key,
          }),
        );
      }
    await db.auditLog.deleteMany({ where: { tournamentId: { in: tids } } });
    await db.tournament.deleteMany({ where: { id: { in: tids } } });
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    console.log("Fixtures cleaned up");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
