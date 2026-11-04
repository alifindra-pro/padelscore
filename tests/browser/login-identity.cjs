const assert = require("node:assert/strict");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 20000 });
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";

(async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const email = `login-${suffix}@test.invalid`;
  const username = `Owner_${suffix.slice(0, 20)}`;
  const password = randomBytes(24).toString("base64url");
  const token = randomBytes(32).toString("base64url");
  let organization, invitation, browser;
  try {
    organization = await prisma.organization.create({
      data: { name: `Login test ${suffix}` },
    });
    invitation = await prisma.staffInvitation.create({
      data: {
        organizationId: organization.id,
        email,
        role: "OWNER",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("/tmp/padel-login-identity", { recursive: true });
    await page.goto(`${base}/invite?token=${token}`);
    await expect(
      page.getByText("Nama pengguna ini bisa dipakai untuk masuk.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/padel-login-identity/invite.png",
      fullPage: true,
    });
    await page
      .getByLabel("Nama lengkap", { exact: true })
      .fill("Login Test Owner");
    await page.getByLabel("Nama pengguna", { exact: true }).fill(username);
    await page.getByLabel("Kata sandi", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Aktifkan akun", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Akun berhasil diaktifkan",
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.username, username);
    await page
      .getByRole("link", { name: "Masuk ke akun", exact: false })
      .click();
    await expect(
      page.getByLabel("Nama pengguna atau email", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/padel-login-identity/login.png",
      fullPage: true,
    });
    for (const identifier of [username, ` ${email.toUpperCase()} `]) {
      await page
        .getByLabel("Nama pengguna atau email", { exact: true })
        .fill(identifier);
      await page.getByLabel("Kata sandi", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      await expect(page).toHaveURL(`${base}/admin`);
      const me = await context.request.get(`${base}/api/v1/auth/me`);
      assert.equal(me.status(), 200);
      assert.equal((await me.json()).data.user.id, user.id);
      const cookie = (await context.cookies()).find(
        (cookie) => cookie.name === "token",
      );
      assert(cookie.httpOnly);
      if (base.startsWith("https:")) assert(cookie.secure);
      await context.clearCookies();
      await page.goto(`${base}/login`);
    }
    await page
      .getByLabel("Nama pengguna atau email", { exact: true })
      .fill(username);
    await page
      .getByLabel("Kata sandi", { exact: true })
      .fill("incorrect-password");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText: "Nama pengguna, email, atau kata sandi tidak sesuai",
        }),
    ).toContainText("Nama pengguna, email, atau kata sandi tidak sesuai");
    const legacy = await context.request.post(`${base}/api/v1/auth/login`, {
      data: { email, password },
    });
    assert.equal(legacy.status(), 200);
    const reuse = await context.request.post(
      `${base}/api/v2/invitations/accept`,
      {
        data: { token, username, password, fullName: "Login Test Owner" },
      },
    );
    assert.equal(reuse.status(), 400);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: invitation activation -> username login -> email login; wrong password rejected, legacy email supported, invitation reuse blocked",
    );
  } finally {
    await browser?.close();
    if (invitation)
      await prisma.staffInvitation.delete({ where: { id: invitation.id } });
    if (organization)
      await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    console.log("Login fixtures cleaned up");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
