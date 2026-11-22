import { describe, expect, it } from "vitest";
import {
  knockoutStageRules,
  presetRules,
  roundName,
  roundsFor,
} from "@/lib/phase-rules";
import { rulesSummary } from "@/lib/rules-summary";
import { PRESETS, resolveRules } from "../../packages/core/src";

describe("phase rules", () => {
  const policy = {
    knockoutRules: presetRules("RACE_4"),
    quarterfinalRules: presetRules("RACE_6"),
    semifinalRules: presetRules("SINGLE"),
    finalRules: presetRules("STANDARD"),
  };

  it("maps quarterfinal, semifinal and final to the last three rounds", () => {
    // 16 pairs: 16 besar (1), QF (2), SF (3), F (4).
    const r = knockoutStageRules(policy, 4);
    expect(r.rulesOverride?.name).toBe(PRESETS.RACE_4.name);
    expect(Object.keys(r.roundRules ?? {})).toEqual(["2", "3", "4"]);
    expect(r.roundRules?.["2"].name).toBe(PRESETS.RACE_6.name);
    expect(r.roundRules?.["4"].name).toBe(PRESETS.STANDARD.name);
  });

  it("skips phases a small bracket does not have", () => {
    // 4 pairs: SF (1), F (2); no quarterfinal.
    const r = knockoutStageRules(policy, 2);
    expect(Object.keys(r.roundRules ?? {})).toEqual(["1", "2"]);
    expect(r.roundRules?.["1"].name).toBe(PRESETS.SINGLE.name);
  });

  it("leaves rounds without their own format to the knockout default", () => {
    const r = knockoutStageRules({ finalRules: presetRules("STANDARD") }, 3);
    expect(r.rulesOverride).toBeNull();
    expect(r.roundRules).toEqual({ "3": presetRules("STANDARD") });
  });

  it("keeps the category deuce rule in every phase", () => {
    const base = { ...PRESETS.TOTAL_4, deuce: "GOLDEN_POINT" as const };
    const r = knockoutStageRules(policy, 3);
    const final = resolveRules(base, r.rulesOverride ?? undefined, r.roundRules?.["3"]);
    expect(final.deuce).toBe("GOLDEN_POINT");
    expect(final.setsToWin).toBe(2);
  });

  it("accepts direct points as a phase format", () => {
    const r = resolveRules(PRESETS.STANDARD, presetRules("POINTS"));
    expect(r.mode).toBe("POINTS");
    expect(r.totalPoints).toBe(24);
  });

  it("names rounds counted from the final", () => {
    expect([1, 2, 3, 4].map((n) => roundName(n, 4))).toEqual([
      "16 besar",
      "Perempat final",
      "Semifinal",
      "Final",
    ]);
    expect(roundsFor(8)).toBe(3);
    expect(roundsFor(6)).toBe(3);
    expect(roundsFor(4)).toBe(2);
  });

  it("lists each phase in the public summary", () => {
    const lines = rulesSummary("GROUP_KNOCKOUT", PRESETS.TOTAL_4, {
      groups: 2,
      perGroup: 2,
      ...policy,
    });
    expect(lines.some((l) => l.startsWith("Perempat final:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Semifinal:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Final:"))).toBe(true);
  });
});
