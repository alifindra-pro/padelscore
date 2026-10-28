export interface DrawEntry {
  id: string;
  seed?: number | null;
}
export interface DrawMatch {
  number: number;
  round: number;
  side: "WINNERS" | "LOSERS" | "FINAL" | "THIRD";
  a: string | null;
  b: string | null;
  winnerTo?: [number, "a" | "b"];
  loserTo?: [number, "a" | "b"];
  bye: boolean;
  conditionalReset?: boolean;
}
export function seedPositions(size: number): number[] {
  let p = [1, 2];
  while (p.length < size) {
    const n = p.length * 2 + 1;
    p = p.flatMap((x) => [x, n - x]);
  }
  return p;
}
export function draw(
  entries: DrawEntry[],
  format: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION",
  mode: "SEEDED" | "RANDOM" | "MANUAL",
  randomValues: number[],
  thirdPlace = false,
): DrawMatch[] {
  if (
    entries.length < 2 ||
    entries.length > 128 ||
    new Set(entries.map((e) => e.id)).size !== entries.length
  )
    throw new Error("Jumlah/identitas peserta tidak valid");
  const seeds = entries.filter((e) => e.seed != null).map((e) => e.seed!);
  if (
    new Set(seeds).size !== seeds.length ||
    seeds.some((s) => s < 1 || s > entries.length)
  )
    throw new Error("Seed harus unik dan dalam rentang peserta");
  const size = 2 ** Math.ceil(Math.log2(entries.length));
  const ordered = [...entries];
  if (mode !== "MANUAL") {
    let n = 0;
    for (let i = ordered.length - 1; i > 0; i--) {
      const value = randomValues[n++];
      if (value === undefined || value < 0 || value >= 1)
        throw new Error("Sumber acak tidak cukup");
      const j = Math.floor(value * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }
  const slots: (string | null)[] = Array(size).fill(null);
  if (mode === "SEEDED") {
    const positions = seedPositions(size);
    for (const e of entries.filter((e) => e.seed))
      slots[positions.indexOf(e.seed!)] = e.id;
    const unseeded = ordered.filter((e) => !e.seed);
    for (let seed = 1; seed <= size; seed++) {
      const pos = positions.indexOf(seed);
      if (slots[pos] === null && unseeded.length)
        slots[pos] = unseeded.shift()!.id;
    }
  } else {
    // spread non-power-of-two fields across seeded slots so byes have an opponent
    const positions = seedPositions(size);
    ordered.forEach((e, i) => {
      slots[mode === "MANUAL" ? i : positions.indexOf(i + 1)] = e.id;
    });
  }
  const matches: DrawMatch[] = [];
  const winners: DrawMatch[][] = [];
  let number = 1;
  for (let r = 1, count = size / 2; count >= 1; r++, count /= 2) {
    const row: DrawMatch[] = [];
    for (let i = 0; i < count; i++)
      row.push({
        number: number++,
        round: r,
        side: "WINNERS",
        a: r === 1 ? slots[i * 2] : null,
        b: r === 1 ? slots[i * 2 + 1] : null,
        bye: false,
      });
    winners.push(row);
    matches.push(...row);
  }
  for (let r = 0; r < winners.length - 1; r++)
    winners[r].forEach(
      (m, i) =>
        (m.winnerTo = [
          winners[r + 1][Math.floor(i / 2)].number,
          i % 2 ? "b" : "a",
        ]),
    );
  if (format === "SINGLE_ELIMINATION" && thirdPlace && winners.length >= 2) {
    const m: DrawMatch = {
      number: number++,
      round: winners.length,
      side: "THIRD",
      a: null,
      b: null,
      bye: false,
    };
    matches.push(m);
    winners.at(-2)!.forEach((x, i) => (x.loserTo = [m.number, i ? "b" : "a"]));
  }
  if (format === "DOUBLE_ELIMINATION") {
    const levels = winners.length;
    let previous: DrawMatch[] = [];
    for (let w = 0; w < levels; w++) {
      if (w === 0 && levels > 1) {
        previous = Array.from({ length: size / 4 }, () => ({
          number: number++,
          round: 1,
          side: "LOSERS" as const,
          a: null,
          b: null,
          bye: false,
        }));
        matches.push(...previous);
        winners[0].forEach(
          (m, i) =>
            (m.loserTo = [
              previous[Math.floor(i / 2)].number,
              i % 2 ? "b" : "a",
            ]),
        );
        continue;
      }
      if (levels === 1) break;
      const injection: DrawMatch[] = winners[w].map(() => ({
        number: number++,
        round: w * 2,
        side: "LOSERS" as const,
        a: null,
        b: null,
        bye: false,
      }));
      matches.push(...injection);
      previous.forEach((m, i) => (m.winnerTo = [injection[i].number, "a"]));
      winners[w].forEach(
        (m, i) =>
          (m.loserTo = [injection[injection.length - 1 - i].number, "b"]),
      );
      previous = injection;
      if (w < levels - 1) {
        const reduction: DrawMatch[] = Array.from(
          { length: injection.length / 2 },
          () => ({
            number: number++,
            round: w * 2 + 1,
            side: "LOSERS" as const,
            a: null,
            b: null,
            bye: false,
          }),
        );
        matches.push(...reduction);
        injection.forEach(
          (m, i) =>
            (m.winnerTo = [
              reduction[Math.floor(i / 2)].number,
              i % 2 ? "b" : "a",
            ]),
        );
        previous = reduction;
      }
    }
    const final: DrawMatch = {
      number: number++,
      round: levels + 1,
      side: "FINAL",
      a: null,
      b: null,
      bye: false,
    };
    const reset: DrawMatch = {
      number: number++,
      round: levels + 2,
      side: "FINAL",
      a: null,
      b: null,
      bye: false,
      conditionalReset: true,
    };
    winners.at(-1)![0].winnerTo = [final.number, "a"];
    if (levels === 1) winners[0][0].loserTo = [final.number, "b"];
    else previous[0].winnerTo = [final.number, "b"];
    matches.push(final, reset);
  }
  // Resolve empty branches and byes in dependency order. A future match is not a bye until every feeder is resolved.
  const resolved = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      if (resolved.has(m.number) || m.side === "FINAL") continue;
      const feeders = matches.filter(
        (x) => x.winnerTo?.[0] === m.number || x.loserTo?.[0] === m.number,
      );
      if (feeders.some((x) => !resolved.has(x.number))) continue;
      if (m.a && m.b) continue;
      m.bye = true;
      resolved.add(m.number);
      changed = true;
      const winner = m.a ?? m.b;
      if (m.winnerTo) {
        const target = matches.find((x) => x.number === m.winnerTo![0])!;
        target[m.winnerTo[1]] = winner;
      }
    }
  }
  return matches;
}
export interface Result {
  a: string;
  b: string;
  winner: string | null;
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
}
export type TieBreaker =
  | "POINTS"
  | "WINS"
  | "HEAD_TO_HEAD"
  | "SET_DIFFERENCE"
  | "GAME_DIFFERENCE"
  | "SETS_WON"
  | "GAMES_WON"
  | "PLAYOFF";
export interface StandingsPolicy {
  winPoints: number;
  lossPoints: number;
  drawPoints: number;
  tieBreakers: TieBreaker[];
}
export const DEFAULT_STANDINGS: StandingsPolicy = {
  winPoints: 2,
  lossPoints: 0,
  drawPoints: 1,
  tieBreakers: [
    "POINTS",
    "HEAD_TO_HEAD",
    "SET_DIFFERENCE",
    "GAME_DIFFERENCE",
    "PLAYOFF",
  ],
};
export function standings(
  ids: string[],
  results: Result[],
  policy = DEFAULT_STANDINGS,
) {
  const rows = ids.map((id) => ({
    id,
    played: 0,
    won: 0,
    lost: 0,
    points: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 0,
    needsPlayoff: false,
  }));
  for (const row of rows)
    for (const m of results)
      if (m.a === row.id || m.b === row.id) {
        const a = m.a === row.id;
        row.played++;
        row.won += +(m.winner === row.id);
        row.lost += +(m.winner !== null && m.winner !== row.id);
        row.points +=
          m.winner === null
            ? policy.drawPoints
            : m.winner === row.id
              ? policy.winPoints
              : policy.lossPoints;
        row.setsWon += a ? m.setsA : m.setsB;
        row.setsLost += a ? m.setsB : m.setsA;
        row.gamesWon += a ? m.gamesA : m.gamesB;
        row.gamesLost += a ? m.gamesB : m.gamesA;
      }
  type Row = (typeof rows)[number];
  function split(group: Row[], level: number): Row[] {
    if (group.length < 2) return group;
    if (
      level >= policy.tieBreakers.length ||
      policy.tieBreakers[level] === "PLAYOFF"
    ) {
      group.forEach((r) => (r.needsPlayoff = true));
      return group;
    }
    const criterion = policy.tieBreakers[level];
    const included = new Set(group.map((x) => x.id));
    const mini =
      criterion === "HEAD_TO_HEAD"
        ? standings(
            [...included],
            results.filter((r) => included.has(r.a) && included.has(r.b)),
            {
              ...policy,
              tieBreakers: ["POINTS", "SET_DIFFERENCE", "GAME_DIFFERENCE"],
            },
          )
        : [];
    const value = (r: Row) =>
      criterion === "POINTS"
        ? r.points
        : criterion === "WINS"
          ? r.won
          : criterion === "SET_DIFFERENCE"
            ? r.setsWon - r.setsLost
            : criterion === "GAME_DIFFERENCE"
              ? r.gamesWon - r.gamesLost
              : criterion === "SETS_WON"
                ? r.setsWon
                : criterion === "GAMES_WON"
                  ? r.gamesWon
                  : -(mini.find((m) => m.id === r.id)?.rank ?? 0);
    const sorted = [...group].sort((a, b) => value(b) - value(a));
    const groups: Row[][] = [];
    for (const r of sorted) {
      if (!groups.length || value(groups.at(-1)![0]) !== value(r))
        groups.push([r]);
      else groups.at(-1)!.push(r);
    }
    return groups.flatMap((g) => split(g, level + 1));
  }
  const sorted = split(rows, 0);
  sorted.forEach(
    (r, i) =>
      (r.rank =
        r.needsPlayoff && i > 0 && sorted[i - 1].needsPlayoff
          ? sorted[i - 1].rank
          : i + 1),
  );
  return sorted;
}
