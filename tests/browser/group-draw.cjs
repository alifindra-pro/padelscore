const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("@playwright/test");
const jwt = require("jsonwebtoken");
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3199";
const out = process.env.SCREENSHOT_DIR;
const first = [
  "Andika",
  "Bagus",
  "Rizky",
  "Fajar",
  "Dimas",
  "Yoga",
  "Arif",
  "Hendra",
  "Galih",
  "Bayu",
  "Reza",
  "Ilham",
  "Wahyu",
  "Putra",
];
(async () => {
  const mark = randomUUID();
  const userId = (
    await db.user.create({
      data: {
        email: `cer-${mark}@test.invalid`,
        username: mark,
        fullName: "Cer",
        role: "ORGANIZER",
        passwordHash: "x",
      },
    })
  ).id;
  const orgId = (
    await db.organization.create({
      data: { name: "Cer", members: { create: { userId, role: "OWNER" } } },
    })
  ).id;
  const b = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addCookies([
    {
      name: "token",
      value: jwt.sign({ userId, role: "ORGANIZER" }, process.env.JWT_SECRET, {
        expiresIn: "20m",
      }),
      url: base,
      httpOnly: true,
    },
  ]);
  await ctx.addInitScript(
    (id) => localStorage.setItem("padel-organization", id),
    orgId,
  );
  const tid = randomUUID();
  const r = await ctx.request.post(`${base}/api/v2/tournaments/setup`, {
    headers: { "X-Organization-Id": orgId },
    data: {
      requestId: tid,
      name: "Rookie Test",
      location: "V",
      start: new Date(Date.now() + 86400000).toISOString(),
      timezone: "Asia/Jakarta",
      category: "Rookie Men",
      courts: 3,
      preset: "TOTAL_4",
      format: "GROUP_KNOCKOUT",
      groups: 7,
      advancePerGroup: 2,
      registrationLater: true,
      slotCount: 28,
      duration: 20,
      rest: 10,
    },
  });
  assert.equal(r.status(), 201);
  const cat = await db.category.findFirstOrThrow({
    where: { tournamentId: tid },
  });
  for (let i = 0; i < 28; i++)
    await db.entry.create({
      data: {
        categoryId: cat.id,
        name: `${first[i % 14]} Pratama${i} / ${first[(i + 5) % 14]} Wijayakusuma${i}`,
        status: "CONFIRMED",
      },
    });
  await db.tournament.update({
    where: { id: tid },
    data: { status: "PUBLISHED" },
  });
  const errors = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/admin/tournaments/${tid}?step=2`);
  await p.getByRole("button", { name: /Undi grup dengan animasi/ }).click();
  await p.getByRole("dialog").waitFor();
  for (let i = 0; i < 9; i++) {
    await p.getByRole("button", { name: "Undi nama berikutnya" }).click();
    await p
      .getByRole("button", { name: "Undi nama berikutnya" })
      .waitFor({ state: "visible" });
    // A spin lasts under two seconds; the long limit only covers a slow machine.
    await p.waitForFunction(
      () => !document.querySelector(".draw-reel-name.is-spinning"),
      null,
      { timeout: 90000 },
    );
  }
  if (out) await p.screenshot({ path: `${out}/draw-1920-partial.png` });
  await p.getByRole("button", { name: "Tampilkan semua" }).click();
  if (out) await p.screenshot({ path: `${out}/draw-1920-all.png` });
  for (const [w, h] of [
    [1366, 768],
    [390, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    if (out)
      await p.screenshot({ path: `${out}/draw-${w}.png`, fullPage: false });
    assert.equal(
      await p.evaluate(() => {
        const s = document.querySelector(".draw-stage");
        return s.scrollWidth > s.clientWidth + 1;
      }),
      false,
      `stage overflows at ${w}`,
    );
  }
  // The stage covers the whole screen at every size.
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(200);
    assert.ok(
      await p.evaluate(() =>
        [
          [innerWidth / 2, innerHeight - 3],
          [3, 3],
          [innerWidth - 3, innerHeight - 3],
        ].every(
          ([x, y]) => !!document.elementFromPoint(x, y)?.closest(".draw-stage"),
        ),
      ),
      `stage does not cover the screen at ${w}`,
    );
  }
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.getByRole("button", { name: "Selesai, lihat bagan" }).click();
  await p.getByRole("button", { name: "Putar ulang animasi undian" }).click();
  await p.getByRole("button", { name: "Undi nama berikutnya" }).click();
  await p.waitForFunction(
    () => !document.querySelector(".draw-reel-name.is-spinning"),
  );
  if (out) await p.screenshot({ path: `${out}/draw-replay-1366.png` });
  await p.getByRole("button", { name: "Tampilkan semua" }).click();
  const shown = await p.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll(".draw-group")].map((g) => [
        g.querySelector("h3").textContent,
        [...g.querySelectorAll("li:not(.is-empty)")]
          .map((li) => li.textContent)
          .sort(),
      ]),
    ),
  );
  if (out) await p.screenshot({ path: `${out}/draw-1366-all.png` });
  const savedG = await db.group.findMany({
    where: { stage: { categoryId: cat.id } },
    include: { matches: { include: { entryA: true, entryB: true } } },
  });
  const expected = Object.fromEntries(
    savedG.map((g) => [
      g.name,
      [
        ...new Set(
          g.matches
            .flatMap((m) => [m.entryA?.name, m.entryB?.name])
            .filter(Boolean),
        ),
      ].sort(),
    ]),
  );
  assert.deepEqual(
    shown,
    Object.fromEntries(Object.keys(shown).map((k) => [k, expected[k]])),
  );
  assert.equal(Object.values(shown).flat().length, 28);
  // Count groups and members shown vs saved
  const saved = await db.group.findMany({
    where: { stage: { categoryId: cat.id } },
    include: { matches: true },
  });
  assert.deepEqual(
    saved.map(
      (g) => new Set(g.matches.flatMap((m) => [m.entryAId, m.entryBId])).size,
    ),
    [4, 4, 4, 4, 4, 4, 4],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 28 pairs into 7 groups, reveal one by one, full-screen stage at 1920/1366/390, replay matches the saved draw",
  );
  await b.close();
  await db.player.deleteMany({ where: { organizationId: orgId } });
  await db.tournament.deleteMany({ where: { id: tid } });
  await db.organization.delete({ where: { id: orgId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
