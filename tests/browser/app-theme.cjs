// Read-only visual regression. Run: node --import tsx --env-file=.env tests/browser/app-theme.cjs
const { chromium, expect } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const {
  PRESETS,
  initialState,
  applyAction,
} = require("../../packages/core/src/scoring.ts");
const prisma = new PrismaClient();
(async () => {
  const baseURL = process.env.BASE_URL || "http://127.0.0.1:3100";
  const output = "/tmp/padel-app-theme";
  fs.mkdirSync(output, { recursive: true });
  const user = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", isActive: true },
  });
  if (!user || !process.env.JWT_SECRET)
    throw new Error("Local admin and JWT configuration required.");
  const tournament = await prisma.tournament.findFirst({
    where: { status: "IN_PROGRESS" },
    select: { id: true, slug: true, organizationId: true },
  });
  const match = await prisma.match.findFirst({
    where: {
      engineVersion: 1,
      entryAId: { not: null },
      entryBId: { not: null },
    },
    select: { id: true },
  });
  const social = await prisma.socialEvent.findFirst({
    where: { published: true },
    select: { id: true },
  });
  if (!tournament || !match || !social)
    throw new Error(
      "Published local tournament, match, and social session required.",
    );
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.addCookies([
      {
        name: "token",
        value: jwt.sign(
          { userId: user.id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "15m" },
        ),
        url: baseURL,
        httpOnly: true,
      },
    ]);
    await context.addInitScript(
      (id) => localStorage.setItem("padel-organization", id),
      tournament.organizationId,
    );
    const page = await context.newPage();
    // A visual check must never submit changes to real tournament data.
    await page.route("**/api/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method())
        ? route.continue()
        : route.abort(),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const routes = [
      ["home", "/"],
      ["login", "/login"],
      ["invite", "/invite?token=preview"],
      ["register", "/register"],
      ["dashboard", "/admin"],
      ["tournaments", "/admin/tournaments"],
      ["tournament-create", "/admin/tournaments?new=1"],
      ["players", "/admin/players"],
      ["social-admin", "/admin/social"],
      ["profile", "/admin/profile"],
      ["organization", "/admin/organization"],
      ["tournament-admin", `/admin/tournaments/${tournament.id}`],
      ["competition", `/admin/competition/${tournament.id}`],
      ["tournament-public", `/tournament/${tournament.slug}`],
      ["match", `/match/${match.id}`],
      ["social-public", `/social/${social.id}`],
      ["referee", "/referee"],
      ["scoring", `/referee/scoring/${match.id}`],
      ["scoring-v2", "/referee/v2/theme-demo"],
    ];
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, route] of routes) {
        await page.goto(baseURL + route);
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        if (overflow) {
          const offenders = await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.right > innerWidth + 1 &&
                  r.width > 0 &&
                  getComputedStyle(el).visibility !== "hidden"
                );
              })
              .slice(0, 6)
              .map((el) => ({ tag: el.tagName, classes: el.className })),
          );
          errors.push(
            `${width} ${name} overflow: ${JSON.stringify(offenders)}`,
          );
        }
        await page.screenshot({
          path: `${output}/${name}-${width}.png`,
          fullPage: true,
        });
        console.log(`${width} ${name}: ${overflow ? "OVERFLOW" : "OK"}`);
      }
    }
    // Small-screen navigation, focus management, and non-mutating organizer flows.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(baseURL + "/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("button", { name: "Buka navigasi", exact: true })
      .click();
    const nav = page.getByRole("navigation", { name: "Navigasi pengelola" });
    await expect(nav).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Buka navigasi", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Buka navigasi", exact: true })
      .click();
    await nav.getByRole("link", { name: "Pemain", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Direktori Pemain & Statistik" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Buka navigasi", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page
      .getByRole("button", { name: "+ Tambah Atlet", exact: false })
      .click();
    await expect(
      page.getByRole("button", { name: "Simpan", exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: `${output}/player-modal-mobile.png`,
      fullPage: true,
    });
    await page.goto(baseURL + `/admin/tournaments/${tournament.id}`);
    for (const name of [
      "Tambah peserta",
      "Atur pertandingan",
      "Jalankan & hasil",
      "Siapkan acara",
    ]) {
      await page.getByRole("button", { name, exact: false }).first().click();
      await expect(
        page.getByRole("button", { name, exact: false }).first(),
      ).toHaveAttribute("aria-current", "step");
    }
    await page.goto(baseURL + "/admin/tournaments?new=1");
    await page
      .getByRole("button", { name: "Pilih skor tenis", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Informasi turnamen" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${output}/tournament-form-mobile.png`,
      fullPage: true,
    });
    await page.goto(baseURL + `/tournament/${tournament.slug}`);
    for (const name of [
      "Bagan & klasemen",
      "Jadwal pertandingan",
      "Peserta terdaftar",
      "Kategori & format",
    ]) {
      await page.getByRole("button", { name, exact: false }).first().click();
      await expect(
        page.getByRole("button", { name, exact: false }).first(),
      ).toHaveAttribute("aria-pressed", "true");
    }
    // Exercise v2 scoring only with isolated in-browser fixture data.
    const state = applyAction(initialState(PRESETS.STANDARD), {
      type: "START_MATCH",
      at: 0,
    });
    await page.route("**/api/v2/matches/theme-demo/claim", (route) =>
      route.fulfill({ json: { data: {} } }),
    );
    await page.route("**/api/v2/matches/theme-demo", (route) =>
      route.fulfill({
        json: {
          data: {
            ownershipVersion: 1,
            rulesSnapshot: PRESETS.STANDARD,
            stateV2: state,
            version: 1,
            sequence: 0,
            actionEvents: [],
            entryA: { name: "Demo Aditya / Rizky" },
            entryB: { name: "Demo Bima / Kevin" },
          },
        },
      }),
    );
    await page.route("**/api/v2/matches/theme-demo/actions", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "Mode uji lokal" } },
      }),
    );
    await page.goto(baseURL + "/referee/v2/theme-demo");
    await page
      .getByRole("button", { name: "Unduh pertandingan & mulai mencatat" })
      .click();
    await page
      .getByRole("button", { name: "+1 Demo Aditya / Rizky", exact: true })
      .click();
    await expect(page.locator(".scoring-points").first()).toHaveText("15");
    await page.screenshot({
      path: `${output}/scoring-v2-active-mobile.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      `PASS: ${routes.length} routes x 3 widths, navigation, forms, tournament steps, public tabs, and isolated scoring. Screenshots: ${output}`,
    );
  } finally {
    await browser.close();
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
