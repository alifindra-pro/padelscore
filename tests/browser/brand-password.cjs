const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 20000 });
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
(async () => {
  const suffix = randomUUID();
  const email = `password-${suffix}@test.invalid`;
  const password = `Old-${randomUUID()}`;
  const nextPassword = `New-${randomUUID()}`;
  let user, browser;
  try {
    user = await prisma.user.create({
      data: {
        email,
        username: `pw-${suffix}`,
        fullName: "Password Test",
        role: "ORGANIZER",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mkdir("/tmp/padel-brand-password", { recursive: true });
    for (const path of ["/", "/login"]) {
      await page.goto(base + path);
      await expect(
        page
          .getByRole("link", {
            name: "Padel Score by Padel Addictive, beranda",
          })
          .first(),
      ).toBeVisible();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path: `/tmp/padel-brand-password/${path === "/" ? "home" : "login"}-${width}.png`,
          fullPage: true,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
        );
      }
    }
    const anonymous = await context.request.post(
      base + "/api/v2/profile/password",
      { data: { currentPassword: password, newPassword: nextPassword } },
    );
    assert.equal(anonymous.status(), 401);
    await page.getByLabel("Nama pengguna atau email").fill(email);
    await page.getByLabel("Kata sandi", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/admin");
    await page.goto(base + "/admin/profile");
    await expect(
      page.getByRole("heading", { name: "Ubah kata sandi" }),
    ).toBeVisible();
    for (const data of [
      { currentPassword: "incorrect", newPassword: nextPassword },
      { currentPassword: password, newPassword: "short" },
      { currentPassword: password, newPassword: password },
      { currentPassword: password, newPassword: "😊".repeat(30) },
    ]) {
      const result = await context.request.post(
        base + "/api/v2/profile/password",
        { data },
      );
      assert.equal(result.status(), 400);
    }
    await page
      .getByLabel("Kata sandi saat ini", { exact: true })
      .fill(password);
    await page
      .getByLabel("Kata sandi baru", { exact: true })
      .fill(nextPassword);
    await page.getByLabel("Ulangi kata sandi baru").fill(nextPassword + "x");
    await page.getByRole("button", { name: "Simpan kata sandi" }).click();
    await expect(
      page.getByText("Konfirmasi kata sandi belum sama"),
    ).toBeVisible();
    await page.getByLabel("Ulangi kata sandi baru").fill(nextPassword);
    await page.getByRole("button", { name: "Simpan kata sandi" }).click();
    await expect(
      page.getByText("Kata sandi berhasil diubah.", { exact: false }),
    ).toBeVisible();
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    assert.notEqual(saved.passwordHash, nextPassword);
    assert.equal(await bcrypt.compare(nextPassword, saved.passwordHash), true);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `/tmp/padel-brand-password/profile-${width}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
    }
    assert.equal(
      (
        await context.request.post(base + "/api/v1/auth/login", {
          data: { identifier: email, password },
        })
      ).status(),
      401,
    );
    assert.equal(
      (
        await context.request.post(base + "/api/v1/auth/login", {
          data: { identifier: email, password: nextPassword },
        })
      ).status(),
      200,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: branding responsive, password change, anonymous/wrong/invalid password rejected, old login rejected, new login accepted",
    );
  } finally {
    if (browser) await browser.close();
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    console.log("Password fixture cleaned up");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
