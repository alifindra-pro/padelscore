import { roundFormat, type Rules } from "../../packages/core/src";

/**
 * Match format per knockout phase, kept in a category's qualificationPolicy.
 * knockoutRules covers every knockout round; the others override the last
 * three rounds. The third-place match shares the final's round.
 */
export interface PhasePolicy {
  knockoutRules?: Partial<Rules>;
  quarterfinalRules?: Partial<Rules>;
  semifinalRules?: Partial<Rules>;
  finalRules?: Partial<Rules>;
}

export const KNOCKOUT_PHASES = [
  "knockout",
  "quarterfinal",
  "semifinal",
  "final",
] as const;
export type KnockoutPhase = (typeof KNOCKOUT_PHASES)[number];
export const phaseKey = (p: KnockoutPhase) => `${p}Rules` as const;

/** Presets offered per phase (timed matches can end level, so not here). */
export const PHASE_PRESETS = [
  "SINGLE",
  "STANDARD",
  "MATCH_TIEBREAK",
  "SHORT",
  "SHORT_THREE",
  "TOTAL_4",
  "RACE_4",
  "RACE_6",
  "POINTS",
];

export const presetRules = (key: string) => roundFormat(key);

/** Stage-wide and per-round rules for a knockout stage of `maxRound` rounds. */
export function knockoutStageRules(
  policy: PhasePolicy | null | undefined,
  maxRound: number,
) {
  const roundRules: Record<string, Partial<Rules>> = {};
  const put = (round: number, rules?: Partial<Rules>) => {
    if (round >= 1 && rules) roundRules[String(round)] = rules;
  };
  put(maxRound - 2, policy?.quarterfinalRules);
  put(maxRound - 1, policy?.semifinalRules);
  put(maxRound, policy?.finalRules);
  return {
    rulesOverride: policy?.knockoutRules ?? null,
    roundRules: Object.keys(roundRules).length ? roundRules : null,
  };
}

/** Knockout rounds for a field of `entries` pairs (8 pairs: QF, SF, F = 3). */
export const roundsFor = (entries: number) =>
  entries >= 2 ? Math.ceil(Math.log2(entries)) : 0;

/** Plain name of a knockout round counted from the final. */
export function roundName(round: number, maxRound: number) {
  const left = maxRound - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semifinal";
  if (left === 2) return "Perempat final";
  return `${2 ** (left + 1)} besar`;
}
