import { directPointsSummary, type Rules } from "../../packages/core/src";

interface QualificationPolicy {
  perGroup?: number;
  groups?: number;
  bestRunnersUp?: number;
  knockoutRules?: Partial<Rules>;
  quarterfinalRules?: Partial<Rules>;
  semifinalRules?: Partial<Rules>;
  finalRules?: Partial<Rules>;
}

/** How one match is won, in plain words. */
export function matchFormat(r: Rules) {
  if (r.mode === "POINTS") return directPointsSummary(r);
  if (r.mode === "TIMED") return `Berbatas waktu ${r.durationMinutes} menit`;
  const g = r.gamesPerSet;
  if (r.setFormat === "RACE")
    return `Race to ${g}, siapa duluan ${g} game menang`;
  if (r.setFormat === "TOTAL_GAMES")
    return g % 2 === 0
      ? `Total ${g} game; jika ${g / 2}–${g / 2}, satu game penentu`
      : `Total ${g} game`;
  const set = `set sampai ${g} game, tie-break di ${r.tiebreakAt}–${r.tiebreakAt}`;
  if (r.setsToWin === 1) return `Satu ${set}`;
  return `Menang ${r.setsToWin} ${set}${r.decidingMatchTiebreak ? `, set penentu memakai match tie-break ${r.matchTiebreakPoints} poin` : ""}`;
}

const deuce = (r: Rules) =>
  r.mode === "POINTS"
    ? null
    : r.deuce === "GOLDEN_POINT"
      ? "Golden point, pada 40–40 satu poin langsung menentukan game"
      : r.deuce === "STAR_POINT"
        ? "Star point, dua kali advantage lalu satu poin penentu"
        : "Advantage, pada 40–40 harus unggul dua poin";

/** Knockout default, then each phase that has its own format. */
function knockoutLines(rules: Rules, policy: QualificationPolicy | null) {
  const knockout = { ...rules, ...policy?.knockoutRules };
  const lines = [`Babak gugur: ${matchFormat(knockout)}`];
  for (const [label, own] of [
    ["Perempat final", policy?.quarterfinalRules],
    ["Semifinal", policy?.semifinalRules],
    ["Final", policy?.finalRules],
  ] as const)
    if (own) lines.push(`${label}: ${matchFormat({ ...knockout, ...own })}`);
  return lines;
}

/**
 * Public, plain-language lines describing how a category is played, e.g.
 * "Babak gugur: Race to 4: siapa duluan 4 game menang". Only these strings
 * leave the server; the raw rule objects stay private.
 */
export function rulesSummary(
  format: string,
  rules: Rules | null,
  policy: QualificationPolicy | null,
  maxEntries?: number | null,
): string[] {
  if (!rules) return [];
  const lines: string[] = [];
  if (format === "GROUP_KNOCKOUT") {
    const groups = policy?.groups;
    const per = policy?.perGroup ?? 2;
    const extra = policy?.bestRunnersUp ?? 0;
    if (groups)
      lines.push(
        `Fase grup: ${groups} grup${
          maxEntries && maxEntries % groups === 0
            ? `, ${maxEntries / groups} pasangan per grup`
            : ""
        }`,
      );
    lines.push(`Laga grup: ${matchFormat(rules)}`);
    lines.push(
      `Lolos ke babak gugur: ${
        per === 1
          ? "Juara tiap grup"
          : per === 2
            ? "Juara dan runner-up tiap grup"
            : `${per} terbaik tiap grup`
      }${extra ? `, ditambah ${extra} peringkat berikutnya terbaik` : ""}${
        groups ? ` (${groups * per + extra} pasangan)` : ""
      }`,
    );
    lines.push(...knockoutLines(rules, policy));
  } else if (format === "SINGLE_ELIMINATION") {
    lines.push(...knockoutLines(rules, policy));
  } else {
    lines.push(`Format laga: ${matchFormat(rules)}`);
  }
  const d = deuce(rules);
  if (d) lines.push(`Deuce: ${d}`);
  return lines;
}

/** How one match is decided, reduced to what a public explainer needs. */
export interface MatchKind {
  kind: "RACE" | "TOTAL_GAMES" | "STANDARD" | "POINTS" | "TIMED";
  games: number;
  setsToWin: number;
}
export interface RulesInfo {
  format: string;
  deuce: string;
  groups: number;
  groupSize: number;
  qualifiers: number;
  perGroup: number;
  bestRunnersUp: number;
  winPoints: number;
  tieBreakers: string[];
  groupMatch: MatchKind;
  knockoutMatch: MatchKind;
  finalMatch: MatchKind;
}
const kindOf = (r: Rules): MatchKind => ({
  kind:
    r.mode === "POINTS"
      ? "POINTS"
      : r.mode === "TIMED"
        ? "TIMED"
        : (r.setFormat ?? "STANDARD"),
  games: r.mode === "POINTS" ? (r.totalPoints ?? 0) : r.gamesPerSet,
  setsToWin: r.setsToWin,
});

/**
 * Numbers for the public rules diagram (groups, qualifiers, scoring). Built on
 * the server so only these plain values leave it, never raw rule objects.
 */
export function rulesInfo(
  format: string,
  rules: Rules | null,
  policy: QualificationPolicy | null,
  maxEntries: number | null | undefined,
  standings: { winPoints?: number; tieBreakers?: string[] } | null,
): RulesInfo | null {
  if (!rules) return null;
  const groups = format === "GROUP_KNOCKOUT" ? (policy?.groups ?? 0) : 0;
  const perGroup = policy?.perGroup ?? 2;
  const bestRunnersUp = policy?.bestRunnersUp ?? 0;
  return {
    format,
    deuce: rules.deuce,
    groups,
    groupSize:
      groups && maxEntries && maxEntries % groups === 0
        ? maxEntries / groups
        : 0,
    qualifiers: groups ? groups * perGroup + bestRunnersUp : 0,
    perGroup,
    bestRunnersUp,
    winPoints: standings?.winPoints ?? 2,
    tieBreakers: standings?.tieBreakers ?? [
      "POINTS",
      "HEAD_TO_HEAD",
      "SET_DIFFERENCE",
      "GAME_DIFFERENCE",
      "PLAYOFF",
    ],
    groupMatch: kindOf(rules),
    knockoutMatch: kindOf({ ...rules, ...policy?.knockoutRules }),
    finalMatch: kindOf({
      ...rules,
      ...policy?.knockoutRules,
      ...policy?.finalRules,
    }),
  };
}
