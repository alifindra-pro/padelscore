import { chromium, expect } from "@playwright/test";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const failures = new Set(["tournament", "match", "players"]);
    await page.addInitScript(() => {
      window.EventSource = class {
        constructor() {
          this.listeners = {};
          window.auditEventSource = this;
        }
        addEventListener(name, handler) {
          this.listeners[name] = handler;
        }
        close() {}
      };
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      let key;
      if (path.endsWith("/auth/me"))
        data = {
          user: { id: "u", role: "SUPER_ADMIN", fullName: "Audit Admin" },
        };
      else if (path.endsWith("/organizations"))
        data = [{ id: "org", name: "Audit Club" }];
      else if (path.endsWith("/public")) {
        key = "tournament";
        data = {
          id: "t",
          name: "Turnamen Pulih",
          status: "PUBLISHED",
          startDate: "2026-11-01",
          endDate: "2026-11-02",
          categories: [],
        };
      } else if (path === "/api/v1/matches/audit") {
        key = "match";
        data = {
          id: "audit",
          status: "IN_PROGRESS",
          entryA: { name: "Pasangan Audit A" },
          entryB: { name: "Pasangan Audit B" },
          scoreSnapshot: {
            pointsA: "0",
            pointsB: "0",
            gamesA: [0],
            gamesB: [0],
            setsA: 0,
            setsB: 0,
            currentSet: 1,
          },
        };
      } else if (path.endsWith("/players")) {
        key = "players";
        data = {
          items: [
            { id: "p", fullName: "Atlet Pulih", _count: { entryPlayers: 0 } },
          ],
          total: 1,
        };
      }
      if (key && failures.has(key))
        return route.fulfill({
          status: 503,
          json: { error: { message: "Gangguan sementara untuk audit" } },
        });
      await route.fulfill({ json: { data } });
    });
    for (const [key, path, heading] of [
      ["tournament", "/tournament/audit", "Turnamen Pulih"],
      ["match", "/match/audit", "Pasangan Audit A"],
      ["players", "/admin/players", "Atlet Pulih"],
    ]) {
      await page.goto("http://localhost:3100" + path);
      await expect(page.locator("[role=alert].panel")).toContainText(
        "Gangguan sementara untuk audit",
      );
      failures.delete(key);
      await page
        .getByRole("button", { name: "Coba lagi", exact: true })
        .click();
      await expect(
        page.getByText(heading, { exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator("[role=alert].panel")).toHaveCount(0);
      if (key === "match") {
        await page.evaluate(() =>
          window.auditEventSource.listeners["initial-state"]({
            data: JSON.stringify({
              status: "IN_PROGRESS",
              version: 4,
              snapshot: {
                pointsA: "40",
                pointsB: "15",
                gamesA: [2],
                gamesB: [1],
                setsA: 0,
                setsB: 0,
                currentSet: 1,
              },
            }),
          }),
        );
        await expect(
          page.getByText("40", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByText("15", { exact: true }).first(),
        ).toBeVisible();
      }
      console.log("PASS: error recovery " + key);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
