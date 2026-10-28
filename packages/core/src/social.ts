export interface SocialPlayer {
  id: string;
  name: string;
  active: boolean;
}
export interface SocialConfig {
  courts: number;
  rounds: number;
  target: number;
  ranking: "AVERAGE" | "TOTAL";
  pairing: "BALANCED" | "ADJACENT";
}
export interface SocialMatch {
  court: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
  approved: boolean;
}
export interface SocialRound {
  number: number;
  matches: SocialMatch[];
  waiting: string[];
  compromises: string[];
}
export function leaderboard(
  players: SocialPlayer[],
  rounds: SocialRound[],
  ranking: SocialConfig["ranking"] = "AVERAGE",
) {
  const rows = players.map((p) => ({
    id: p.id,
    name: p.name,
    played: 0,
    points: 0,
    average: 0,
  }));
  const byId = new Map(rows.map((x) => [x.id, x]));
  for (const r of rounds)
    for (const m of r.matches)
      if (m.approved && m.scoreA !== null && m.scoreB !== null)
        for (const [team, score] of [
          [m.teamA, m.scoreA],
          [m.teamB, m.scoreB],
        ] as const)
          for (const id of team) {
            const x = byId.get(id);
            if (x) {
              x.played++;
              x.points += score;
            }
          }
  for (const x of rows) x.average = x.played ? x.points / x.played : 0;
  return rows.sort(
    (a, b) =>
      (ranking === "AVERAGE" ? b.average - a.average : b.points - a.points) ||
      b.points - a.points ||
      a.id.localeCompare(b.id),
  );
}
export function nextSocialRound(
  format: "AMERICANO" | "MEXICANO",
  players: SocialPlayer[],
  history: SocialRound[],
  config: SocialConfig,
): SocialRound {
  if (
    ![config.courts, config.rounds, config.target].every(
      (x) => Number.isInteger(x) && x > 0 && x <= 200,
    )
  )
    throw new Error("Konfigurasi sosial tidak valid");
  if (history.length >= config.rounds) throw new Error("Seluruh ronde selesai");
  if (history.some((r) => r.matches.some((m) => !m.approved)))
    throw new Error(
      "Sahkan seluruh hasil ronde sebelum membuat ronde berikutnya",
    );
  const active = players.filter((p) => p.active);
  if (
    active.length < 4 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    throw new Error("Minimal empat peserta unik diperlukan");
  const standings = leaderboard(players, history, config.ranking);
  const rank = new Map(standings.map((x, i) => [x.id, i]));
  const played = new Map(standings.map((x) => [x.id, x.played]));
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const key = (a: string, b: string) => [a, b].sort().join(":");
  for (const r of history)
    for (const m of r.matches) {
      for (const pair of [m.teamA, m.teamB])
        partners.set(key(...pair), (partners.get(key(...pair)) ?? 0) + 1);
      for (const a of m.teamA)
        for (const b of m.teamB)
          opponents.set(key(a, b), (opponents.get(key(a, b)) ?? 0) + 1);
    }
  const eligible = active
    .map((p) => p.id)
    .sort(
      (a, b) =>
        played.get(a)! - played.get(b)! ||
        (format === "MEXICANO"
          ? rank.get(a)! - rank.get(b)!
          : a.localeCompare(b)),
    );
  const count = Math.min(config.courts, Math.floor(eligible.length / 4));
  const selected = eligible.slice(0, count * 4);
  const waiting = eligible.slice(count * 4);
  if (format === "MEXICANO")
    selected.sort((a, b) => rank.get(a)! - rank.get(b)!);
  const matches: SocialMatch[] = [];
  const compromises: string[] = [];
  const cost = (a: string, b: string, c: string, d: string) =>
    100 * ((partners.get(key(a, b)) ?? 0) + (partners.get(key(c, d)) ?? 0)) +
    [a, b].reduce(
      (sum, p) =>
        sum + (opponents.get(key(p, c)) ?? 0) + (opponents.get(key(p, d)) ?? 0),
      0,
    );
  while (selected.length) {
    const a = selected.shift()!;
    let chosen: [string, string, string] = [
      selected[0],
      selected[1],
      selected[2],
    ];
    if (format === "AMERICANO") {
      let best = Infinity; // Bound candidate search to keep large community events responsive.
      const pool = selected.slice(0, 24);
      for (let i = 0; i < pool.length; i++)
        for (let j = 0; j < pool.length; j++)
          for (let k = j + 1; k < pool.length; k++)
            if (i !== j && i !== k) {
              const c = cost(a, pool[i], pool[j], pool[k]);
              if (c < best) {
                best = c;
                chosen = [pool[i], pool[j], pool[k]];
              }
            }
    } else if (config.pairing === "BALANCED")
      chosen = [selected[2], selected[0], selected[1]];
    const [b, c, d] = chosen;
    if (cost(a, b, c, d) > 0)
      compromises.push(
        `Lapangan ${matches.length + 1}: pengulangan pasangan/lawan untuk menjaga pemerataan bermain${format === "MEXICANO" ? " dan kelompok peringkat" : ""}.`,
      );
    for (const id of chosen) selected.splice(selected.indexOf(id), 1);
    matches.push({
      court: matches.length + 1,
      teamA: [a, b],
      teamB: [c, d],
      scoreA: null,
      scoreB: null,
      approved: false,
    });
  }
  return { number: history.length + 1, matches, waiting, compromises };
}
export function setSocialScore(
  round: SocialRound,
  court: number,
  a: number,
  b: number,
  target: number,
): SocialRound {
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0) || a + b !== target)
    throw new Error(`Jumlah skor harus ${target}`);
  if (!round.matches.some((m) => m.court === court))
    throw new Error("Lapangan tidak ditemukan");
  return {
    ...round,
    matches: round.matches.map((m) =>
      m.court === court ? { ...m, scoreA: a, scoreB: b, approved: true } : m,
    ),
  };
}
