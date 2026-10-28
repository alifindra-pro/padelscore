/** Pure, replayable scoring. Time enters only through explicit actions. */
export type Team = "A" | "B";
export type MatchStatus =
  | "NOT_STARTED"
  | "WARMUP"
  | "IN_PROGRESS"
  | "SUSPENDED"
  | "COMPLETED"
  | "RETIRED"
  | "WALKOVER"
  | "DISQUALIFIED"
  | "CANCELLED";
export type Deuce = "ADVANTAGE" | "GOLDEN_POINT" | "STAR_POINT";
export interface Rules {
  version: 2;
  name: string;
  source: "FIP_REFERENCE" | "LOCAL" | "COMMUNITY";
  sourceUrl?: string;
  setsToWin: number;
  gamesPerSet: number;
  tiebreakAt: number;
  tiebreakPoints: number;
  deuce: Deuce;
  decidingMatchTiebreak: boolean;
  matchTiebreakPoints: number;
  mode: "SETS" | "TIMED";
  durationMinutes: number;
  allowDraw: boolean;
}
const base: Rules = {
  version: 2,
  name: "Dua Kemenangan Set Standar",
  source: "FIP_REFERENCE",
  sourceUrl:
    "https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf",
  setsToWin: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  deuce: "ADVANTAGE",
  decidingMatchTiebreak: false,
  matchTiebreakPoints: 10,
  mode: "SETS",
  durationMinutes: 20,
  allowDraw: false,
};
export const PRESETS: Record<string, Rules> = {
  STANDARD: { ...base },
  MATCH_TIEBREAK: {
    ...base,
    name: "Dua Set + Match Tie-Break",
    decidingMatchTiebreak: true,
  },
  SINGLE: { ...base, name: "Satu Set Standar", setsToWin: 1 },
  SHORT: {
    ...base,
    name: "Satu Set Pendek",
    source: "LOCAL",
    setsToWin: 1,
    gamesPerSet: 4,
    tiebreakAt: 4,
  },
  SHORT_THREE: {
    ...base,
    name: "Dua Kemenangan Set Pendek",
    source: "LOCAL",
    gamesPerSet: 4,
    tiebreakAt: 4,
  },
  TIMED: {
    ...base,
    name: "Pertandingan 20 Menit",
    source: "COMMUNITY",
    mode: "TIMED",
    allowDraw: true,
  },
  CUSTOM: { ...base, name: "Format Kustom", source: "LOCAL" },
};
export function validateRules(r: Rules): Rules {
  if (
    r.version !== 2 ||
    !["ADVANTAGE", "GOLDEN_POINT", "STAR_POINT"].includes(r.deuce) ||
    !["SETS", "TIMED"].includes(r.mode)
  )
    throw new Error("Format aturan tidak dikenal");
  for (const key of [
    "setsToWin",
    "gamesPerSet",
    "tiebreakAt",
    "tiebreakPoints",
    "matchTiebreakPoints",
    "durationMinutes",
  ] as const)
    if (!Number.isInteger(r[key]) || r[key] < 1 || r[key] > 120)
      throw new Error(`Konfigurasi ${key} tidak valid`);
  if (
    r.setsToWin > 3 ||
    r.tiebreakAt < r.gamesPerSet - 1 ||
    r.tiebreakAt > r.gamesPerSet ||
    r.tiebreakPoints < 2 ||
    r.matchTiebreakPoints < 2 ||
    (r.decidingMatchTiebreak && r.setsToWin < 2)
  )
    throw new Error("Kombinasi aturan bertentangan");
  return { ...r };
}
export function resolveRules(
  category: Rules,
  stage?: Partial<Rules>,
  round?: Partial<Rules>,
) {
  return validateRules({ ...category, ...stage, ...round });
}
export interface SetScore {
  kind: "STANDARD" | "MATCH_TIEBREAK";
  games: [number, number];
  tiebreak: [number, number];
  winner: Team | null;
}
export interface ScoreState {
  status: MatchStatus;
  rules: Rules;
  points: [number, number];
  sets: SetScore[];
  winner: Team | null;
  serviceOrder: [string, string, string, string];
  receivingOrder: [string, string, string, string];
  serverIndex: number;
  tiebreakFirstServer: number;
  faults: number;
  advantageCycles: number;
  goldenReceiverSide: "RIGHT" | "LEFT" | null;
  totalGames: number;
  changeEnds: boolean;
  elapsedMs: number;
  clockAt: number | null;
  timerExpired: boolean;
  decidingPoint: boolean;
  finalized: boolean;
}
export type Action =
  | {
      type: "START_MATCH";
      at: number;
      serviceOrder?: [string, string, string, string];
      receivingOrder?: [string, string, string, string];
    }
  | { type: "AWARD_POINT"; team: Team }
  | {
      type:
        | "RECORD_FIRST_SERVE_FAULT"
        | "RECORD_SECOND_SERVE_FAULT"
        | "WARMUP"
        | "CANCEL_MATCH"
        | "FINALIZE_MATCH";
    }
  | { type: "SELECT_RECEIVER_SIDE"; side: "RIGHT" | "LEFT" }
  | { type: "SUSPEND_MATCH" | "RESUME_MATCH" | "TIME_EXPIRED"; at: number }
  | {
      type: "RECORD_RETIREMENT" | "RECORD_WALKOVER" | "RECORD_DISQUALIFICATION";
      loser: Team;
      reason: string;
    }
  | {
      type: "CORRECT_SCORE";
      points: [number, number];
      games: [number, number];
      reason: string;
    }
  | { type: "UNDO_LAST_ACTION"; reason: string };
const other = (t: Team): Team => (t === "A" ? "B" : "A");
const idx = (t: Team) => (t === "A" ? 0 : 1);
const emptySet = (kind: SetScore["kind"] = "STANDARD"): SetScore => ({
  kind,
  games: [0, 0],
  tiebreak: [0, 0],
  winner: null,
});
export function initialState(rules: Rules): ScoreState {
  return {
    status: "NOT_STARTED",
    rules: validateRules(rules),
    points: [0, 0],
    sets: [emptySet()],
    winner: null,
    serviceOrder: ["A1", "B1", "A2", "B2"],
    receivingOrder: ["A1", "A2", "B1", "B2"],
    serverIndex: 0,
    tiebreakFirstServer: 0,
    faults: 0,
    advantageCycles: 0,
    goldenReceiverSide: null,
    totalGames: 0,
    changeEnds: false,
    elapsedMs: 0,
    clockAt: null,
    timerExpired: false,
    decidingPoint: false,
    finalized: false,
  };
}
export function isTiebreak(s: ScoreState) {
  const set = s.sets.at(-1)!;
  return (
    set.kind === "MATCH_TIEBREAK" ||
    (s.rules.mode === "SETS" &&
      set.games[0] === s.rules.tiebreakAt &&
      set.games[1] === s.rules.tiebreakAt)
  );
}
export function pointLabels(s: ScoreState): [string, string] {
  if (isTiebreak(s)) return s.points.map(String) as [string, string];
  const [a, b] = s.points;
  if (a >= 3 && b >= 3)
    return a === b ? ["40", "40"] : a > b ? ["AD", "40"] : ["40", "AD"];
  return [
    String([0, 15, 30, 40][Math.min(a, 3)]),
    String([0, 15, 30, 40][Math.min(b, 3)]),
  ];
}
export function serviceInfo(s: ScoreState) {
  const count = s.points[0] + s.points[1];
  const tb = isTiebreak(s);
  const serverIndex = tb
    ? (s.tiebreakFirstServer +
        (count === 0 ? 0 : 1 + Math.floor((count - 1) / 2))) %
      4
    : s.serverIndex;
  const side = s.goldenReceiverSide ?? (count % 2 === 0 ? "RIGHT" : "LEFT");
  const servingTeam: Team = s.serviceOrder[serverIndex].startsWith("A")
    ? "A"
    : "B";
  return {
    server: s.serviceOrder[serverIndex],
    team: servingTeam,
    side,
    receiver:
      s.receivingOrder[
        (servingTeam === "A" ? 2 : 0) + (side === "RIGHT" ? 0 : 1)
      ],
    attempt: s.faults + 1,
  };
}
function finishSet(s: ScoreState, team: Team) {
  s.sets.at(-1)!.winner = team;
  if (s.sets.filter((x) => x.winner === team).length >= s.rules.setsToWin) {
    s.winner = team;
    s.status = "COMPLETED";
    return;
  }
  const deciding =
    s.rules.decidingMatchTiebreak &&
    s.sets.length === 2 * (s.rules.setsToWin - 1);
  s.sets.push(emptySet(deciding ? "MATCH_TIEBREAK" : "STANDARD"));
  s.tiebreakFirstServer = s.serverIndex;
}
function award(s: ScoreState, team: Team) {
  const i = idx(team),
    j = 1 - i;
  const tb = isTiebreak(s);
  const set = s.sets.at(-1)!;
  s.points[i]++;
  s.faults = 0;
  s.goldenReceiverSide = null;
  s.changeEnds = false;
  if (s.rules.mode === "TIMED" && s.decidingPoint) {
    s.winner = team;
    s.status = "COMPLETED";
    return;
  }
  if (tb) {
    set.tiebreak = [...s.points];
    s.changeEnds = (s.points[0] + s.points[1]) % 6 === 0;
    const target =
      set.kind === "MATCH_TIEBREAK"
        ? s.rules.matchTiebreakPoints
        : s.rules.tiebreakPoints;
    if (s.points[i] >= target && s.points[i] - s.points[j] >= 2) {
      if (set.kind === "STANDARD") {
        set.games[i]++;
        s.totalGames++;
      }
      s.serverIndex = (s.tiebreakFirstServer + 1) % 4;
      s.points = [0, 0];
      finishSet(s, team);
    }
    return;
  }
  if (s.points[0] === s.points[1] && s.points[0] > 3) s.advantageCycles++;
  const sudden =
    s.rules.deuce === "GOLDEN_POINT" ||
    (s.rules.deuce === "STAR_POINT" && s.advantageCycles >= 2);
  if (
    s.points[i] >= 4 &&
    (s.points[i] - s.points[j] >= 2 || (sudden && s.points[i] > s.points[j]))
  ) {
    set.games[i]++;
    s.totalGames++;
    s.changeEnds = s.totalGames % 2 === 1;
    s.serverIndex = (s.serverIndex + 1) % 4;
    s.points = [0, 0];
    s.advantageCycles = 0;
    s.tiebreakFirstServer = s.serverIndex;
    if (
      s.rules.mode === "SETS" &&
      set.games[i] >= s.rules.gamesPerSet &&
      set.games[i] - set.games[j] >= 2
    )
      finishSet(s, team);
  }
  if (s.rules.mode === "TIMED" && s.timerExpired) {
    const games = s.sets.reduce(
      (a, x) => [a[0] + x.games[0], a[1] + x.games[1]] as [number, number],
      [0, 0] as [number, number],
    );
    const diff = games[0] - games[1] || s.points[0] - s.points[1];
    if (diff || s.rules.allowDraw) {
      s.winner = diff > 0 ? "A" : diff < 0 ? "B" : null;
      s.status = "COMPLETED";
    } else s.decidingPoint = true;
  }
}
export function applyAction(previous: ScoreState, action: Action): ScoreState {
  const s: ScoreState = JSON.parse(JSON.stringify(previous));
  if (s.finalized) throw new Error("Hasil sudah difinalisasi");
  const active = () => {
    if (s.status !== "IN_PROGRESS") throw new Error("Pertandingan tidak aktif");
  };
  switch (action.type) {
    case "WARMUP":
      if (s.status !== "NOT_STARTED")
        throw new Error("Pemanasan tidak tersedia");
      s.status = "WARMUP";
      break;
    case "START_MATCH":
      if (!["NOT_STARTED", "WARMUP"].includes(s.status))
        throw new Error("Pertandingan sudah dimulai");
      if (action.serviceOrder) {
        if (
          new Set(action.serviceOrder).size !== 4 ||
          !action.serviceOrder.every(
            (p, i) =>
              ["A1", "A2", "B1", "B2"].includes(p) &&
              (i === 0 || p[0] !== action.serviceOrder![i - 1][0]),
          )
        )
          throw new Error("Urutan servis harus bergantian pasangan");
        s.serviceOrder = action.serviceOrder;
      }
      if (action.receivingOrder) {
        if (
          new Set(action.receivingOrder).size !== 4 ||
          !action.receivingOrder.every((p, i) =>
            (i < 2 ? ["A1", "A2"] : ["B1", "B2"]).includes(p),
          )
        )
          throw new Error("Urutan penerima tidak valid");
        s.receivingOrder = action.receivingOrder;
      }
      s.status = "IN_PROGRESS";
      s.clockAt = action.at;
      break;
    case "AWARD_POINT":
      active();
      award(s, action.team);
      break;
    case "RECORD_FIRST_SERVE_FAULT":
      active();
      if (s.faults !== 0) throw new Error("Servis pertama sudah fault");
      s.faults = 1;
      break;
    case "RECORD_SECOND_SERVE_FAULT":
      active();
      if (s.faults !== 1) throw new Error("Catat first fault terlebih dahulu");
      award(s, other(serviceInfo(s).team));
      break;
    case "SELECT_RECEIVER_SIDE":
      active();
      if (
        s.points[0] !== s.points[1] ||
        s.points[0] < 3 ||
        !(
          s.rules.deuce === "GOLDEN_POINT" ||
          (s.rules.deuce === "STAR_POINT" && s.advantageCycles >= 2)
        )
      )
        throw new Error("Pemilihan sisi hanya pada poin penentu");
      s.goldenReceiverSide = action.side;
      break;
    case "SUSPEND_MATCH":
      active();
      s.elapsedMs += Math.max(0, action.at - (s.clockAt ?? action.at));
      s.clockAt = null;
      s.status = "SUSPENDED";
      break;
    case "RESUME_MATCH":
      if (s.status !== "SUSPENDED")
        throw new Error("Pertandingan tidak ditunda");
      s.clockAt = action.at;
      s.status = "IN_PROGRESS";
      break;
    case "TIME_EXPIRED":
      active();
      if (
        s.rules.mode !== "TIMED" ||
        s.elapsedMs + Math.max(0, action.at - (s.clockAt ?? action.at)) <
          s.rules.durationMinutes * 60000
      )
        throw new Error("Waktu belum habis");
      s.timerExpired = true;
      break;
    case "CORRECT_SCORE":
      active();
      if (
        !action.reason.trim() ||
        [...action.points, ...action.games].some(
          (x) => !Number.isInteger(x) || x < 0,
        ) ||
        (action.points[0] !== action.points[1] &&
          Math.max(...action.points) >= 4 &&
          Math.abs(action.points[0] - action.points[1]) >= 2 &&
          !isTiebreak(s))
      )
        throw new Error(
          "Koreksi tidak valid atau sudah melewati kemenangan game",
        );
      s.points = action.points;
      s.sets.at(-1)!.games = action.games;
      s.faults = 0;
      break;
    case "RECORD_RETIREMENT":
    case "RECORD_WALKOVER":
    case "RECORD_DISQUALIFICATION":
      if (
        !action.reason.trim() ||
        !["NOT_STARTED", "WARMUP", "IN_PROGRESS", "SUSPENDED"].includes(
          s.status,
        )
      )
        throw new Error("Alasan/status tidak valid");
      s.status =
        action.type === "RECORD_RETIREMENT"
          ? "RETIRED"
          : action.type === "RECORD_WALKOVER"
            ? "WALKOVER"
            : "DISQUALIFIED";
      s.winner = other(action.loser);
      break;
    case "CANCEL_MATCH":
      if (
        ["COMPLETED", "RETIRED", "WALKOVER", "DISQUALIFIED"].includes(s.status)
      )
        throw new Error("Hasil sudah selesai");
      s.status = "CANCELLED";
      break;
    case "FINALIZE_MATCH":
      if (
        ![
          "COMPLETED",
          "RETIRED",
          "WALKOVER",
          "DISQUALIFIED",
          "CANCELLED",
        ].includes(s.status)
      )
        throw new Error("Pertandingan belum selesai");
      s.finalized = true;
      break;
    case "UNDO_LAST_ACTION":
      throw new Error("Undo harus dijalankan melalui replay riwayat");
  }
  return s;
}
export function replay(rules: Rules, actions: Action[]): ScoreState {
  const states = [initialState(rules)];
  for (const action of actions) {
    if (action.type === "UNDO_LAST_ACTION") {
      if (
        !action.reason.trim() ||
        states.length <= 1 ||
        states.at(-1)!.finalized
      )
        throw new Error("Tidak ada aksi yang dapat dibatalkan");
      states.pop();
    } else states.push(applyAction(states.at(-1)!, action));
  }
  return states.at(-1)!;
}
