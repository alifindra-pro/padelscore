const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { chromium, expect: baseExpect } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const expect = baseExpect.configure({ timeout: 20000 });
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const shots = process.env.SCREENSHOT_DIR;
(async () => {
  let userId, orgId, browser;
  const mark = randomUUID();
  try {
    userId = (
      await db.user.create({
        data: {
          email: `checkin-${mark}@test.invalid`,
          username: mark,
          fullName: "Check-in Browser",
          role: "ORGANIZER",
          passwordHash: "unusable",
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: {
          name: "Check-in browser",
          members: { create: { userId, role: "OWNER" } },
        },
      })
    ).id;
    const tournament = await db.tournament.create({
      data: {
        name: "Check-in " + mark.slice(0, 6),
        slug: "check-in-" + mark.slice(0, 8),
        location: "Venue",
        startDate: new Date(Date.now() + 3600000),
        endDate: new Date(Date.now() + 7200000),
        timezone: "Asia/Jakarta",
        status: "PUBLISHED",
        organizationId: orgId,
        members: { create: { userId, role: "OWNER" } },
        categories: {
          create: {
            name: "Rookie Men",
            format: "GROUP_KNOCKOUT",
            maxEntries: 4,
          },
        },
      },
      include: { categories: true },
    });
    const category = tournament.categories[0];
    for (const n of [1, 2]) {
      const players = await Promise.all(
        ["A", "B"].map((s) =>
          db.player.create({
            data: { fullName: `Pemain ${n}${s}`, organizationId: orgId },
          }),
        ),
      );
      await db.entry.create({
        data: {
          categoryId: category.id,
          name: `Pemain ${n}A / Pemain ${n}B`,
          players: { create: players.map((p) => ({ playerId: p.id })) },
        },
      });
    }

    browser = await chromium.launch({
      headless: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    const admin = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
    const desk = await admin.newPage();
    const errors = [];
    desk.on("pageerror", (e) => errors.push(e.message));
    await desk.goto(`${base}/admin/tournaments/${tournament.id}`);
    await desk.getByRole("link", { name: "Check-in peserta" }).click();
    await expect(
      desk.getByRole("heading", { name: "Check-in peserta" }),
    ).toBeVisible();
    await expect(
      desk.getByText("QR muncul di sini saat check-in dibuka."),
    ).toBeVisible();
    await desk.getByRole("button", { name: "Buka sekarang" }).click();
    await expect(
      desk.getByRole("img", { name: "QR check-in Rookie Men" }),
    ).toBeVisible();
    await expect(desk.getByText("Dibuka, belum ada jam tutup")).toBeVisible();
    if (shots)
      await desk.screenshot({
        path: `${shots}/checkin-desk.png`,
        fullPage: true,
      });

    // The code the QR carries, read the same way the screen gets it.
    const view = await (
      await admin.request.get(
        `${base}/api/v2/categories/${category.id}/check-in`,
        {
          headers: { "X-Organization-Id": orgId },
        },
      )
    ).json();
    const token = view.data.qr.token;

    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const player = await phone.newPage();
    player.on("pageerror", (e) => errors.push(e.message));
    await player.goto(`${base}/checkin/${category.id}?t=${token}`);
    await expect(
      player.getByRole("heading", { name: "Check-in Rookie Men" }),
    ).toBeVisible();
    if (shots)
      await player.screenshot({ path: `${shots}/checkin-phone-list.png` });
    await player.getByRole("button", { name: /Pemain 1A/ }).click();
    await expect(
      player.getByRole("heading", { name: "Check-in sebagai Pemain 1A?" }),
    ).toBeVisible();
    if (shots)
      await player.screenshot({ path: `${shots}/checkin-phone-confirm.png` });
    await player.getByRole("button", { name: "Ya, saya hadir" }).click();
    await expect(
      player.getByRole("heading", { name: "Pemain 1A" }),
    ).toBeVisible();
    await expect(player.getByText("Hadir", { exact: true })).toBeVisible();
    if (shots)
      await player.screenshot({ path: `${shots}/checkin-phone-done.png` });
    assert.equal(
      await player.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "phone page overflows",
    );

    // A stale code (a forwarded photo) does not open the list.
    const stale = await phone.newPage();
    await stale.goto(`${base}/checkin/${category.id}?t=AAAAAAAAAAAAAAAAAAAAAA`);
    await expect(stale.getByText("QR sudah berganti")).toBeVisible();

    // The desk picks the new check-in up on its own refresh.
    await expect(desk.getByText(/Hadir \d{2}[.:]\d{2}/)).toBeVisible();
    await expect(desk.locator(".checkin-count").first()).toContainText(
      "1 / 4 pemain hadir",
    );
    // Organizer marks the partner by hand.
    await desk.getByRole("button", { name: /Pemain 1B/ }).click();
    await expect(desk.getByText("Lengkap", { exact: true })).toBeVisible();
    await expect(desk.getByText(/panitia/).first()).toBeVisible();

    // Present / absent tabs list players one by one, with counts.
    await expect(
      desk.getByRole("tab", { name: /Sudah check-in\s*2/ }),
    ).toBeVisible();
    await expect(
      desk.getByRole("tab", { name: /Belum check-in\s*2/ }),
    ).toBeVisible();
    await desk.getByRole("tab", { name: /Belum check-in/ }).click();
    await expect(desk.locator(".checkin-rows li")).toHaveCount(2);
    await desk.getByRole("tab", { name: /Sudah check-in/ }).click();
    await expect(desk.locator(".checkin-rows li")).toHaveCount(2);
    await expect(desk.getByText("scan QR")).toBeVisible();
    await expect(desk.getByText("oleh panitia")).toBeVisible();
    if (shots)
      await desk.screenshot({
        path: `${shots}/checkin-present.png`,
        fullPage: true,
      });
    // Undo needs its own button, then the player is back on the absent tab.
    await desk
      .locator(".checkin-rows li", { hasText: "oleh panitia" })
      .getByRole("button", { name: "Batalkan" })
      .click();
    await expect(
      desk.getByRole("tab", { name: /Belum check-in\s*3/ }),
    ).toBeVisible();
    await desk
      .getByPlaceholder("Cari nama pemain atau pasangan")
      .fill("Pemain 1");
    await desk.getByRole("tab", { name: /Belum check-in/ }).click();
    await expect(desk.locator(".checkin-rows li")).toHaveCount(1);
    await desk.getByPlaceholder("Cari nama pemain atau pasangan").fill("");
    await desk.getByRole("tab", { name: /Semua pasangan/ }).click();

    // Full-screen QR for the venue desk.
    await desk.getByRole("button", { name: "Tampilkan layar QR" }).click();
    await expect(
      desk.getByRole("dialog", { name: "Layar QR check-in" }),
    ).toBeVisible();
    if (shots) await desk.screenshot({ path: `${shots}/checkin-screen.png` });
    await desk.getByRole("button", { name: "Tutup layar" }).click();

    // The organizer desk also fits a phone.
    await desk.setViewportSize({ width: 390, height: 844 });
    await desk.getByRole("tab", { name: /Sudah check-in/ }).click();
    assert.equal(
      await desk.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "desk overflows on a phone",
    );
    if (shots)
      await desk.screenshot({
        path: `${shots}/checkin-desk-phone.png`,
        fullPage: true,
      });

    // Spectators see attendance per pair.
    const pub = await phone.newPage();
    await pub.goto(`${base}/tournament/${tournament.slug}#peserta`);
    await expect(pub.locator(".entry-checkin").first()).toHaveText("Hadir 1/2");
    await expect(pub.getByText("Belum check-in")).toBeVisible();

    assert.deepEqual(errors, []);
    console.log(
      "PASS: check-in desk, phone check-in, stale QR, manual mark, public status",
    );
  } finally {
    await browser?.close();
    if (orgId) {
      await db.tournament.deleteMany({ where: { organizationId: orgId } });
      await db.player.deleteMany({ where: { organizationId: orgId } });
      await db.auditLog.deleteMany({ where: { userId } });
      await db.organization.delete({ where: { id: orgId } });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
