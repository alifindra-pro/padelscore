import { describe, expect, it } from "vitest";
import {
  Action,
  PRESETS,
  applyAction,
  initialState,
  pointLabels,
  replay,
  serviceInfo,
  validateRules,
  setPointScores,
} from "../src/scoring";
const start: Action = { type: "START_MATCH", at: 0 };
const points = (a: number, b: number): Action[] => [
  ...Array.from(
    { length: a },
    () => ({ type: "AWARD_POINT", team: "A" }) as Action,
  ),
  ...Array.from(
    { length: b },
    () => ({ type: "AWARD_POINT", team: "B" }) as Action,
  ),
];
describe("direct total points scoring", () => {
  it("plays all 24 points, keeps numeric score, and ends 15–9 without games or sets", () => {
    const state = replay(PRESETS.POINTS, [start, ...points(15, 9)]);
    expect(state.status).toBe("COMPLETED");
    expect(state.winner).toBe("A");
    expect(pointLabels(state)).toEqual(["15", "9"]);
    expect(state.totalGames).toBe(0);
    expect(state.sets[0].winner).toBeNull();
    expect(() =>
      applyAction(state, { type: "AWARD_POINT", team: "B" }),
    ).toThrow();
    expect(applyAction(state, { type: "FINALIZE_MATCH" }).finalized).toBe(true);
  });
  it("requires exactly one deciding point at 12–12 and supports undo/replay", () => {
    const actions = [start, ...points(12, 12)];
    const tied = replay(PRESETS.POINTS, actions);
    expect(tied.status).toBe("IN_PROGRESS");
    expect(tied.decidingPoint).toBe(true);
    expect(() => applyAction(tied, { type: "FINALIZE_MATCH" })).toThrow();
    const won = applyAction(tied, { type: "AWARD_POINT", team: "B" });
    expect(won.points).toEqual([12, 13]);
    expect(won.winner).toBe("B");
    expect(won.decidingPoint).toBe(false);
    expect(
      replay(PRESETS.POINTS, [
        ...actions,
        { type: "AWARD_POINT", team: "B" },
        { type: "UNDO_LAST_ACTION", reason: "Wrong team" },
      ]),
    ).toEqual(tied);
  });
  it.each([1, 16, 25, 32, 200])(
    "supports total %i without ending when merely ahead",
    (target) => {
      const rules = { ...PRESETS.POINTS, totalPoints: target };
      expect(replay(rules, [start, ...points(target - 1, 0)]).status).toBe(
        "IN_PROGRESS",
      );
      expect(replay(rules, [start, ...points(target, 0)]).status).toBe(
        "COMPLETED",
      );
    },
  );
  it.each([0, 201, NaN, 1.5, undefined])(
    "rejects invalid total %s",
    (totalPoints) => {
      expect(() => validateRules({ ...PRESETS.POINTS, totalPoints })).toThrow();
    },
  );
  it("rejects draws and switches server every four points", () => {
    expect(() =>
      initialState({ ...PRESETS.POINTS, allowDraw: true }),
    ).toThrow();
    expect(
      [0, 4, 8, 12, 16].map(
        (n) =>
          serviceInfo(replay(PRESETS.POINTS, [start, ...points(n, 0)])).server,
      ),
    ).toEqual(["A1", "B1", "A2", "B2", "A1"]);
    expect(replay(PRESETS.POINTS, [start, ...points(8, 0)]).changeEnds).toBe(
      true,
    );
  });
  it("awards double fault to opponent and allows valid corrections without tennis checks", () => {
    let s = replay(PRESETS.POINTS, [start, ...points(8, 6)]);
    s = applyAction(s, {
      type: "CORRECT_SCORE",
      points: [10, 6],
      games: [0, 0],
      reason: "Score correction",
    });
    expect(s.points).toEqual([10, 6]);
    s = applyAction(s, { type: "RECORD_FIRST_SERVE_FAULT" });
    s = applyAction(s, { type: "RECORD_SECOND_SERVE_FAULT" });
    expect(s.points).toEqual([10, 7]);
    expect(() =>
      applyAction(s, {
        type: "CORRECT_SCORE",
        points: [15, 9],
        games: [0, 0],
        reason: "Invalid completed score",
      }),
    ).toThrow();
    expect(() =>
      applyAction(s, { type: "SELECT_RECEIVER_SIDE", side: "LEFT" }),
    ).toThrow();
  });
});

describe("direct points across sets", () => {
  const target = {
    ...PRESETS.POINTS,
    pointsFormat: "TARGET" as const,
    totalPoints: 3,
    setsToWin: 2,
    pointsWinBy: 1 as const,
  };
  it("plays best of three, resets points, retains each set and replays undo across a set boundary", () => {
    const first = [start, ...points(3, 0)];
    const s = replay(target, first);
    expect(s.status).toBe("IN_PROGRESS");
    expect(s.points).toEqual([0, 0]);
    expect(s.sets[0].winner).toBe("A");
    expect(serviceInfo(s).server).toBe("B1");
    const tied = replay(target, [...first, ...points(0, 3)]);
    expect(tied.sets).toHaveLength(3);
    const final = replay(target, [...first, ...points(0, 3), ...points(3, 0)]);
    expect(final.winner).toBe("A");
    expect(final.status).toBe("COMPLETED");
    expect(setPointScores(final)).toEqual([
      [3, 0],
      [0, 3],
      [3, 0],
    ]);
    const undone = replay(target, [
      ...first,
      { type: "UNDO_LAST_ACTION", reason: "Wrong point" },
    ]);
    expect(undone.sets).toHaveLength(1);
    expect(undone.points).toEqual([2, 0]);
  });
  it("requires a two-point margin at the target and rejects corrections that already win a set", () => {
    const rules = { ...target, setsToWin: 1, pointsWinBy: 2 as const };
    let s = replay(rules, [
      start,
      ...points(2, 2),
      { type: "AWARD_POINT", team: "A" },
    ]);
    expect(s.status).toBe("IN_PROGRESS");
    s = applyAction(s, { type: "AWARD_POINT", team: "B" });
    expect(s.points).toEqual([3, 3]);
    expect(() =>
      applyAction(s, {
        type: "CORRECT_SCORE",
        games: [0, 0],
        points: [5, 3],
        reason: "Invalid finish",
      }),
    ).toThrow();
    s = applyAction(s, { type: "AWARD_POINT", team: "A" });
    s = applyAction(s, { type: "AWARD_POINT", team: "A" });
    expect(s.status).toBe("COMPLETED");
    expect(setPointScores(s)).toEqual([[5, 3]]);
  });
  it("plays fixed total with a deciding point for each tied set and stops at three set wins", () => {
    const rules = {
      ...PRESETS.POINTS,
      pointsFormat: "TOTAL" as const,
      totalPoints: 4,
      setsToWin: 3,
    };
    let s = initialState(rules);
    s = applyAction(s, start);
    for (let set = 0; set < 3; set++) {
      for (const action of points(2, 2)) s = applyAction(s, action);
      expect(s.decidingPoint).toBe(true);
      s = applyAction(s, { type: "AWARD_POINT", team: "B" });
      expect(s.status).toBe(set === 2 ? "COMPLETED" : "IN_PROGRESS");
    }
    expect(s.winner).toBe("B");
    expect(setPointScores(s)).toEqual([
      [2, 3],
      [2, 3],
      [2, 3],
    ]);
  });
  it("rejects contradictory total/margin and match-tiebreak rules", () => {
    expect(() =>
      initialState({ ...target, pointsFormat: "TOTAL", pointsWinBy: 2 }),
    ).toThrow();
    expect(() =>
      initialState({ ...target, decidingMatchTiebreak: true }),
    ).toThrow();
  });
});
