const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { mkdir } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const expect = baseExpect.configure({ timeout: 20000 });
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";

(async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const password = randomBytes(24).toString("base64url");
  const emailFor = (role) => `staff-${role.toLowerCase()}-${suffix}@test.invalid`;
  const usernameFor = (role) => `${role}_${suffix}`;
  let owner, organization, otherOrganization, browser;
  const roles = ["REFEREE", "STAFF", "ADMIN"];
  try {
    owner = await prisma.user.create({
      data: {
        fullName: "Test Admin",
        email: emailFor("owner"),
        username: usernameFor("owner"),
        passwordHash: "unusable-test-hash",
        role: "ORGANIZER",
      },
    });
    organization = await prisma.organization.create({
      data: {
        name: `Accounts ${suffix}`,
        members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    otherOrganization = await prisma.organization.create({
      data: { name: `Other accounts ${suffix}` },
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
    await context.addCookies([
      {
        name: "token",
        value: jwt.sign(
          { userId: owner.id, role: "ORGANIZER" },
          process.env.JWT_SECRET,
          { expiresIn: "15m" },
        ),
        url: base,
        httpOnly: true,
      },
    ]);
    await context.addInitScript(
      (id) => localStorage.setItem("padel-organization", id),
      organization.id,
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/admin/organization`);
    await expect(
      page.getByRole("heading", { name: "Akun & organisasi", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Admin utama", { exact: false })).toBeVisible();
    const form = page.getByRole("form", { name: "Buat akun tim" });
    await mkdir("/tmp/padel-staff-accounts", { recursive: true });
    for (const role of roles) {
      await form
        .getByLabel("Nama lengkap", { exact: true })
        .fill(`Test ${role}`);
      await form.getByLabel("Email", { exact: true }).fill(emailFor(role));
      await form
        .getByLabel("Nama pengguna", { exact: true })
        .fill(usernameFor(role));
      await form.getByLabel("Peran", { exact: true }).selectOption(role);
      await form
        .getByLabel("Kata sandi akun baru", { exact: true })
        .fill(password);
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v2/staff/accounts") &&
          r.request().method() === "POST",
      );
      await form
        .getByRole("button", { name: "Buat akun", exact: true })
        .click();
      const response = await responsePromise;
      assert.equal(response.status(), 201);
      const body = await response.json();
      assert(!("passwordHash" in body.data));
      assert(!("password" in body.data));
      await expect(
        page.getByRole("status").filter({ hasText: "berhasil dibuat" }),
      ).toContainText(usernameFor(role));
      await expect(
        page.getByRole("list", { name: "Daftar akun tim" }),
      ).toContainText(usernameFor(role));
      await expect(
        form.getByLabel("Kata sandi akun baru", { exact: true }),
      ).toHaveValue("");
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: emailFor(role) },
      });
      assert.equal(user.role, role === "REFEREE" ? "REFEREE" : "ORGANIZER");
      assert(await bcrypt.compare(password, user.passwordHash));
      const member = await prisma.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
      });
      assert.equal(member.role, role);
    }
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `/tmp/padel-staff-accounts/accounts-${width}.png`,
        fullPage: true,
      });
    }
    const payload = {
      organizationId: organization.id,
      fullName: "Duplicate",
      email: emailFor("REFEREE"),
      username: usernameFor("REFEREE"),
      password: "a-different-password",
      role: "REFEREE",
    };
    const post = (data, client = context.request) =>
      client.post(`${base}/api/v2/staff/accounts`, { data });
    assert.equal((await post(payload)).status(), 409);
    assert.equal(
      (
        await post({ ...payload, organizationId: otherOrganization.id })
      ).status(),
      403,
    );
    assert.equal(
      (await post({ ...payload, role: "SUPER_ADMIN" })).status(),
      400,
    );
    assert.equal(
      await prisma.organizationMember.count({
        where: { organizationId: otherOrganization.id },
      }),
      0,
    );
    for (const role of roles) {
      const memberContext = await browser.newContext();
      const memberPage = await memberContext.newPage();
      await memberPage.goto(`${base}/login`);
      await memberPage
        .getByLabel("Nama pengguna atau email", { exact: true })
        .fill(usernameFor(role));
      await memberPage.getByLabel("Kata sandi", { exact: true }).fill(password);
      await memberPage
        .getByRole("button", { name: "Masuk", exact: true })
        .click();
      await expect(memberPage).toHaveURL(
        `${base}/${role === "REFEREE" ? "referee" : "admin"}`,
      );
      if (role !== "ADMIN")
        assert.equal(
          (await post(payload, memberContext.request)).status(),
          403,
        );
      if (role !== "REFEREE") {
        await memberPage.goto(`${base}/admin/organization`);
        if (role === "ADMIN")
          await expect(
            memberPage.getByRole("form", { name: "Buat akun tim" }),
          ).toBeVisible();
        else {
          await expect(
            memberPage.getByText("Hanya admin yang dapat membuat akun tim.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            memberPage.getByRole("form", { name: "Buat akun tim" }),
          ).toHaveCount(0);
        }
      }
      await memberContext.close();
    }
    const anonymous = await browser.newContext();
    assert.equal((await post(payload, anonymous.request)).status(), 401);
    assert.equal(
      (
        await anonymous.request.post(`${base}/api/v1/auth/register`, {
          data: payload,
        })
      ).status(),
      403,
    );
    await anonymous.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: admin creates referee/staff/admin accounts; login and role routing work; duplicates, escalation, cross-organization and unauthorized creation blocked; registration closed",
    );
  } finally {
    await browser?.close();
    if (organization)
      await prisma.organization.delete({ where: { id: organization.id } });
    if (otherOrganization)
      await prisma.organization.delete({ where: { id: otherOrganization.id } });
    await prisma.user.deleteMany({
      where: { email: { in: [emailFor("owner"), ...roles.map(emailFor)] } },
    });
    await prisma.$disconnect();
    console.log("Staff account fixtures cleaned up");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
