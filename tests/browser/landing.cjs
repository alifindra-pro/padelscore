// Run against a local server: BASE_URL=http://localhost:3100 node tests/browser/landing.cjs
const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const baseURL = process.env.BASE_URL || "http://localhost:3100";
  const chromePath =
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let mode = "success";
    const tournaments = [
      {
        id: "live",
        name: "Jakarta Padel Open",
        slug: "jakarta-open",
        location: "Jakarta",
        status: "IN_PROGRESS",
        startDate: "2026-10-27T10:00:00Z",
        timezone: "Asia/Jakarta",
      },
      {
        id: "upcoming",
        name: "Bali Padel Weekend",
        slug: "bali-weekend",
        location: "Bali",
        status: "PUBLISHED",
        startDate: "2026-11-07T10:00:00Z",
        timezone: "Asia/Makassar",
      },
    ];
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 401,
        json: { error: { message: "Not signed in" } },
      }),
    );
    await page.route("**/api/v2/public/tournaments", (route) =>
      route.fulfill(
        mode === "error" || mode === "partial"
          ? { status: 503, json: { error: { message: "Unavailable" } } }
          : { json: { data: mode === "empty" ? [] : tournaments } },
      ),
    );
    await page.route("**/api/v2/public/social", (route) =>
      route.fulfill(
        mode === "error"
          ? { status: 503, json: { error: { message: "Unavailable" } } }
          : {
              json: {
                data:
                  mode === "empty"
                    ? []
                    : [
                        {
                          id: "social",
                          name: "Sunday Social Club",
                          format: "AMERICANO",
                        },
                      ],
              },
            },
      ),
    );
    await page.goto(baseURL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Setiap poin.",
    );
    await expect(page.getByText("3 acara ditemukan")).toBeVisible();
    const score = page.getByRole("region", {
      name: "Demo live scoring interaktif",
    });
    const first = score.locator("tbody tr").first();
    await expect(first.locator("td").last()).toHaveText("40");
    await score
      .getByRole("button", { name: "Tambah poin Bima dan Kevin" })
      .click();
    await expect(score.getByRole("status")).toContainText("40–40");
    await score
      .getByRole("button", { name: "Tambah poin Aditya dan Rizky" })
      .click();
    await expect(first.locator("td").last()).toHaveText("AD");
    await score
      .getByRole("button", { name: "Tambah poin Aditya dan Rizky" })
      .click();
    await expect(first.locator("td").nth(1)).toHaveText("5");
    await expect(first.locator("td").last()).toHaveText("0");
    await score.getByRole("button", { name: "Batalkan poin terakhir" }).click();
    await expect(first.locator("td").last()).toHaveText("AD");
    await score.getByRole("button", { name: "Reset demo skor" }).click();
    for (let i = 0; i < 5; i++)
      await score
        .getByRole("button", { name: "Tambah poin Aditya dan Rizky" })
        .click();
    await expect(score.getByRole("status")).toContainText(
      "memenangkan pertandingan",
    );
    await expect(
      score.getByRole("button", { name: "Tambah poin Aditya dan Rizky" }),
    ).toBeDisabled();
    await score.getByRole("button", { name: "Batalkan poin terakhir" }).click();
    await expect(
      score.getByRole("button", { name: "Tambah poin Aditya dan Rizky" }),
    ).toBeEnabled();
    await score.getByRole("button", { name: "Reset demo skor" }).click();
    await page
      .getByRole("button", { name: "Sedang berlangsung", exact: true })
      .click();
    await expect(page.getByText("1 acara ditemukan")).toBeVisible();
    await expect(
      page.getByRole("link").filter({ hasText: "Jakarta Padel Open" }),
    ).toHaveAttribute("href", "/tournament/jakarta-open");
    await page
      .getByRole("button", { name: "Akan datang", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bali Padel Weekend" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Social padel", exact: true })
      .click();
    await expect(
      page.getByRole("link").filter({ hasText: "Sunday Social Club" }),
    ).toHaveAttribute("href", "/social/social");
    await page
      .getByRole("button", { name: "Semua acara", exact: true })
      .click();
    await page
      .getByRole("searchbox", { name: "Cari acara atau lokasi" })
      .fill("bali");
    await expect(page.getByText("1 acara ditemukan")).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Cari acara atau lokasi" })
      .fill("does not exist");
    await expect(
      page.getByRole("heading", { name: "Belum ada acara yang cocok." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(page.getByText("3 acara ditemukan")).toBeVisible();
    await page
      .getByText("Perlu akun untuk melihat pertandingan?", { exact: false })
      .click();
    await expect(page.locator("details[open]")).toContainText("Tidak.");
    const output = process.env.SCREENSHOT_DIR || "/tmp/padel-landing";
    fs.mkdirSync(output, { recursive: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: path.join(output, `landing-${width}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const clipped = await page
        .locator("h1")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped).toBe(false);
      if (width === 375) {
        await page.getByRole("button", { name: "Buka navigasi" }).click();
        await expect(
          page.getByRole("navigation", { name: "Navigasi utama" }),
        ).toBeVisible();
        await page
          .getByRole("navigation")
          .getByRole("link", { name: "Fitur", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Buka navigasi" }),
        ).toHaveAttribute("aria-expanded", "false");
        await page.getByRole("button", { name: "Buka navigasi" }).click();
        await page
          .getByRole("navigation")
          .getByRole("link", { name: "FAQ", exact: true })
          .focus();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", { name: "Buka navigasi" }),
        ).toBeFocused();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    mode = "error";
    await page.reload();
    await expect(page.locator("#events").getByRole("alert")).toContainText(
      "Data turnamen dan social padel",
    );
    mode = "success";
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(page.getByText("3 acara ditemukan")).toBeVisible();
    await expect(page.locator("#events").getByRole("alert")).toHaveCount(0);
    mode = "partial";
    await page.reload();
    await expect(page.locator("#events").getByRole("alert")).toContainText(
      "Data turnamen belum dapat dimuat",
    );
    await expect(
      page.getByRole("heading", { name: "Sunday Social Club" }),
    ).toBeVisible();
    mode = "empty";
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Permainan berikutnya segera hadir." }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, "landing-empty-desktop.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      "PASS: scoring, deuce, game/match completion, undo/reset, filters, search, links, FAQ, mobile menu, 5 viewport widths, partial API failure, retry, empty state, and no browser errors.",
    );
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
