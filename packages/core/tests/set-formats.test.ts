import { describe, expect, it } from "vitest";
import {
  Action,
  PRESETS,
  Rules,
  Team,
  isTiebreak,
  replay,
  validateRules,
} from "../src/scoring";

const start: Action = { type: "START_MATCH", at: 0 };
const golden = { ...PRESETS.SINGLE, deuce: "GOLDEN_POINT" as const };
const race = (n: number): Rules =>
  validateRules({
    ...golden,
    name: `Race to ${n}`,
    setFormat: "RACE",
    gamesPerSet: n,
    tiebreakAt: n,
  });
const total4 = validateRules({
  ...golden,
  name: "Total 4 game",
  setFormat: "TOTAL_GAMES",
  gamesPerSet: 4,
  tiebreakAt: 4,
});
/** One game won to love by the given team. */
const game = (team: Team): Action[] =>
  Array.from({ length: 4 }, () => ({ type: "AWARD_POINT", team }) as Action);
const games = (...teams: Team[]) => [start, ...teams.flatMap(game)];

describe("race sets", () => {
  it("ends at 4–3 without a two-game lead or tie-break", () => {
    const s = replay(race(4), games("A", "B", "A", "B", "A", "B"));
    expect(s.sets[0].games).toEqual([3, 3]);
    expect(isTiebreak(s)).toBe(false);
    const done = replay(race(4), games("A", "B", "A", "B", "A", "B", "B"));
    expect(done.status).toBe("COMPLETED");
    expect(done.winner).toBe("B");
    expect(done.sets[0].games).toEqual([3, 4]);
  });
  it("race to 6 ends at 6–5 and not before", () => {
    const five = Array.from({ length: 5 }, () => ["A", "B"] as Team[]).flat();
    const s = replay(race(6), games(...five));
    expect(s.status).toBe("IN_PROGRESS");
    const done = replay(race(6), games(...five, "A"));
    expect(done.winner).toBe("A");
    expect(done.sets[0].games).toEqual([6, 5]);
  });
  it("keeps golden point inside each game", () => {
    const deuce: Action[] = [
      start,
      ...["A", "B", "A", "B", "A", "B"].map(
        (team) => ({ type: "AWARD_POINT", team }) as Action,
      ),
      { type: "AWARD_POINT", team: "B" },
    ];
    expect(replay(race(4), deuce).sets[0].games).toEqual([0, 1]);
  });
});

describe("total-games sets", () => {
  it("always plays four games: 3–0 continues, 3–1 and 4–0 end", () => {
    expect(replay(total4, games("A", "A", "A")).status).toBe("IN_PROGRESS");
    const won = replay(total4, games("A", "A", "A", "B"));
    expect(won.status).toBe("COMPLETED");
    expect(won.sets[0].games).toEqual([3, 1]);
    expect(replay(total4, games("A", "A", "A", "A")).sets[0].games).toEqual([
      4, 0,
    ]);
  });
  it("settles 2–2 with exactly one extra game, never a tie-break", () => {
    const tied = replay(total4, games("A", "B", "A", "B"));
    expect(tied.status).toBe("IN_PROGRESS");
    expect(isTiebreak(tied)).toBe(false);
    const done = replay(total4, games("A", "B", "A", "B", "B"));
    expect(done.winner).toBe("B");
    expect(done.sets[0].games).toEqual([2, 3]);
  });
  it("rejects set formats outside game-and-set scoring", () => {
    expect(() =>
      validateRules({ ...PRESETS.POINTS, setFormat: "RACE" }),
    ).toThrow();
    expect(() =>
      validateRules({ ...golden, setFormat: "LATER" as "RACE" }),
    ).toThrow();
  });
});
