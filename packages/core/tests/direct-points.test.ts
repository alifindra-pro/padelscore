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
