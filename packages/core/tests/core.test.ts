import { describe, it, expect } from "vitest";
import {
  PRESETS,
  initialState,
  applyAction,
  replay,
  pointLabels,
  serviceInfo,
  ScoreState,
  Action,
  draw,
  nextSocialRound,
  leaderboard,
  setSocialScore,
  SocialRound,
  standings,
  DEFAULT_STANDINGS,
} from "../src";
const start = (rules = PRESETS.SINGLE) =>
  applyAction(initialState(rules), { type: "START_MATCH", at: 0 });
const point = (s: ScoreState, team: "A" | "B") =>
  applyAction(s, { type: "AWARD_POINT", team });
const game = (s: ScoreState, t: "A" | "B") =>
  Array.from({ length: 4 }).reduce<ScoreState>((a) => point(a, t), s);
function deuce(s: ScoreState) {
  for (let i = 0; i < 3; i++) {
    s = point(s, "A");
    s = point(s, "B");
  }
  return s;
}
describe("Scoring v2", () => {
  it("keeps integer points and renders padel scores", () => {
    let s = start();
    s = point(s, "A");
    expect(s.points).toEqual([1, 0]);
    expect(pointLabels(s)).toEqual(["15", "0"]);
  });
  it("Advantage allows repeated deuce cycles", () => {
    let s = deuce(start());
    for (let i = 0; i < 10; i++) {
      s = point(s, "A");
      s = point(s, "B");
    }
    expect(s.sets[0].games).toEqual([0, 0]);
    s = point(point(s, "B"), "B");
    expect(s.sets[0].games).toEqual([0, 1]);
  });
  it("Golden Point ends at first deciding point", () => {
    const s = point(
      deuce(start({ ...PRESETS.SINGLE, deuce: "GOLDEN_POINT" })),
      "B",
    );
    expect(s.sets[0].games).toEqual([0, 1]);
  });
  it("Star Point waits until both advantage cycles have failed", () => {
    let s = deuce(start({ ...PRESETS.SINGLE, deuce: "STAR_POINT" }));
    s = point(point(s, "A"), "B");
    expect(s.advantageCycles).toBe(1);
    s = point(point(s, "B"), "A");
    expect(s.advantageCycles).toBe(2);
    expect(s.sets[0].games).toEqual([0, 0]);
    s = point(s, "A");
    expect(s.sets[0].games).toEqual([1, 0]);
    expect(s.advantageCycles).toBe(0);
  });
  it("standard set requires 7–5 at 6–5", () => {
    let s = start();
    for (let i = 0; i < 5; i++) {
      s = game(s, "A");
      s = game(s, "B");
    }
    s = game(s, "A");
    expect(s.status).toBe("IN_PROGRESS");
    s = game(s, "A");
    expect(s.status).toBe("COMPLETED");
    expect(s.sets[0].games).toEqual([7, 5]);
  });
  it("tiebreak has no cap and uses 1,2,2 service pattern", () => {
    let s = start();
    for (let i = 0; i < 6; i++) {
      s = game(s, "A");
      s = game(s, "B");
    }
    expect(serviceInfo(s).server).toBe("A1");
    s = point(s, "A");
    expect(serviceInfo(s).server).toBe("B1");
    s = point(s, "B");
    expect(serviceInfo(s).server).toBe("B1");
    for (let i = 0; i < 10; i++) {
      s = point(s, "A");
      s = point(s, "B");
    }
    s = point(point(s, "A"), "A");
    expect(s.sets[0].games).toEqual([7, 6]);
    expect(s.sets[0].tiebreak).toEqual([13, 11]);
  });
  it("match tiebreak is a special set, not ten games", () => {
    let s = start(PRESETS.MATCH_TIEBREAK);
    for (let i = 0; i < 6; i++) s = game(s, "A");
    for (let i = 0; i < 6; i++) s = game(s, "B");
    expect(s.sets[2].kind).toBe("MATCH_TIEBREAK");
    for (let i = 0; i < 10; i++) s = point(s, "A");
    expect(s.status).toBe("COMPLETED");
    expect(s.sets[2].games).toEqual([0, 0]);
    expect(s.sets[2].tiebreak).toEqual([10, 0]);
  });
  it("short-set threshold can be three or four", () => {
    for (const threshold of [3, 4]) {
      let s = start({ ...PRESETS.SHORT, tiebreakAt: threshold });
      for (let i = 0; i < threshold; i++) {
        s = game(s, "A");
        s = game(s, "B");
      }
      for (let i = 0; i < 7; i++) s = point(s, "B");
      expect(s.status).toBe("COMPLETED");
    }
  });
  it("double fault awards exactly one opponent point", () => {
    let s = start();
    s = applyAction(s, { type: "RECORD_FIRST_SERVE_FAULT" });
    s = applyAction(s, { type: "RECORD_SECOND_SERVE_FAULT" });
    expect(s.points).toEqual([0, 1]);
    expect(s.faults).toBe(0);
  });
  it("rotates all four servers and receiver sides", () => {
    let s = start();
    expect(serviceInfo(s).server).toBe("A1");
    s = game(s, "A");
    expect(serviceInfo(s).server).toBe("B1");
    s = game(s, "A");
    expect(serviceInfo(s).server).toBe("A2");
    s = game(s, "A");
    expect(serviceInfo(s).server).toBe("B2");
  });
  it("timed match completes active point and handles knockout tie", () => {
    let s = start({ ...PRESETS.TIMED, allowDraw: false });
    s = point(s, "A");
    s = applyAction(s, { type: "TIME_EXPIRED", at: 1200000 });
    s = point(s, "B");
    expect(s.decidingPoint).toBe(true);
    s = point(s, "A");
    expect(s.winner).toBe("A");
  });
  it("replay and undo preserve deterministic state", () => {
    const actions: Action[] = [
      { type: "START_MATCH", at: 0 },
      { type: "AWARD_POINT", team: "A" },
      { type: "RECORD_FIRST_SERVE_FAULT" },
      { type: "UNDO_LAST_ACTION", reason: "Salah input" },
    ];
    expect(replay(PRESETS.SINGLE, actions)).toEqual(point(start(), "A"));
  });
  it("rejects scoring when suspended or finalized", () => {
    let s = applyAction(start(), { type: "SUSPEND_MATCH", at: 1 });
    expect(() => point(s, "A")).toThrow();
    s = applyAction(s, {
      type: "RECORD_RETIREMENT",
      loser: "B",
      reason: "Cedera",
    });
    s = applyAction(s, { type: "FINALIZE_MATCH" });
    expect(() => point(s, "A")).toThrow();
  });
});
describe("Drawing and social", () => {
  for (const size of [6, 8, 10, 12, 16, 24, 32, 48, 64])
    it(`creates complete seeded draw for ${size}`, () => {
      const entries = Array.from({ length: size }, (_, i) => ({
        id: String(i),
        seed: i + 1,
      }));
      const nodes = draw(
        entries,
        "SINGLE_ELIMINATION",
        "SEEDED",
        Array(size).fill(0.5),
      );
      const ids = nodes
        .filter((n) => n.round === 1)
        .flatMap((n) => [n.a, n.b])
        .filter(Boolean);
      expect(new Set(ids).size).toBe(size);
      expect(nodes.length).toBe(2 ** Math.ceil(Math.log2(size)) - 1);
      expect(nodes.filter((n) => n.bye).length).toBe(
        2 ** Math.ceil(Math.log2(size)) - size,
      );
    });
  it("double elimination has reset and explicit loser links", () => {
    const nodes = draw(
      Array.from({ length: 8 }, (_, i) => ({ id: String(i) })),
      "DOUBLE_ELIMINATION",
      "RANDOM",
      Array(8).fill(0.2),
    );
    expect(nodes.some((n) => n.conditionalReset)).toBe(true);
    expect(
      nodes.filter((n) => n.side === "WINNERS").every((n) => n.loserTo),
    ).toBe(true);
  });
  for (const count of [4, 5, 6, 7, 8, 13, 16])
    it(`balances ${count} social players without duplicate assignments`, () => {
      const players = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        name: String(i),
        active: true,
      }));
      const rounds: SocialRound[] = [];
      const config = {
        courts: 2,
        rounds: 8,
        target: 32,
        ranking: "AVERAGE" as const,
        pairing: "BALANCED" as const,
      };
      for (let i = 0; i < 8; i++) {
        let r = nextSocialRound("AMERICANO", players, rounds, config);
        const assigned = r.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned.length + r.waiting.length).toBe(count);
        for (const m of r.matches) r = setSocialScore(r, m.court, 18, 14, 32);
        rounds.push(r);
      }
      const played = leaderboard(players, rounds).map((p) => p.played);
      expect(Math.max(...played) - Math.min(...played)).toBeLessThanOrEqual(1);
    });
  it("Mexicano requires approved round and enforces point totals", () => {
    const players = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      name: String(i),
      active: true,
    }));
    const config = {
      courts: 1,
      rounds: 3,
      target: 32,
      ranking: "AVERAGE" as const,
      pairing: "BALANCED" as const,
    };
    const round = nextSocialRound("MEXICANO", players, [], config);
    expect(() =>
      nextSocialRound("MEXICANO", players, [round], config),
    ).toThrow();
    expect(() => setSocialScore(round, 1, 18, 15, 32)).toThrow();
  });
  it("unresolved three-way tie is explicit", () => {
    const results = [
      { a: "a", b: "b", winner: "a", setsA: 1, setsB: 0, gamesA: 6, gamesB: 4 },
      { a: "b", b: "c", winner: "b", setsA: 1, setsB: 0, gamesA: 6, gamesB: 4 },
      { a: "c", b: "a", winner: "c", setsA: 1, setsB: 0, gamesA: 6, gamesB: 4 },
    ];
    expect(
      standings(["a", "b", "c"], results, DEFAULT_STANDINGS).every(
        (r) => r.needsPlayoff,
      ),
    ).toBe(true);
  });
});
