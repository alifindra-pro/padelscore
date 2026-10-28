// Client-side shapes of v1 match payloads after JSON serialization.

export interface PlayerView {
  id: string;
  fullName: string;
}

export interface EntryView {
  id: string;
  name: string;
  seed?: number | null;
  players?: { player?: PlayerView | null }[];
}

export interface ScoreSnapshotView {
  pointsA: string;
  pointsB: string;
  setsA: number;
  setsB: number;
  gamesA: number[];
  gamesB: number[];
  currentSet: number;
  server: string;
  isTiebreak: boolean;
  tiebreakPtsA?: number;
  tiebreakPtsB?: number;
  version?: number;
}

export interface MatchEventView {
  id: string;
  eventType: string;
  team?: string | null;
  reason?: string | null;
  sequence: number;
  undone?: boolean;
  createdAt?: string;
}

export interface MatchView {
  id: string;
  status: string;
  version: number;
  engineVersion?: number;
  round: number;
  matchNumber: number;
  scheduledAt?: string | null;
  entryAId?: string | null;
  entryBId?: string | null;
  winnerId?: string | null;
  entryA?: EntryView | null;
  entryB?: EntryView | null;
  winner?: EntryView | null;
  court?: { id: string; name: string } | null;
  scoreSnapshot?: ScoreSnapshotView | null;
  events?: MatchEventView[];
  stage?: {
    id?: string;
    name?: string;
    category?: {
      id?: string;
      name: string;
      ruleset?: { goldenPoint?: boolean; superTiebreak?: boolean } | null;
      tournament?: { id: string; name: string; slug: string } | null;
    } | null;
  } | null;
}

/** Response of score/undo/start endpoints. */
export interface MatchMutationResult {
  match: Partial<MatchView>;
  snapshot: ScoreSnapshotView | null;
}

/** Payload pushed over the match/tournament SSE streams. */
export interface MatchUpdatePayload {
  matchId: string;
  tournamentId?: string;
  status?: string;
  snapshot?: ScoreSnapshotView | null;
  version?: number;
}

export function playerNames(entry?: EntryView | null): string {
  return (
    entry?.players
      ?.map((p) => p.player?.fullName)
      .filter(Boolean)
      .join(" & ") ?? ""
  );
}

export interface StandingView {
  id: string;
  entry?: EntryView | null;
  won: number;
  lost: number;
  points: number;
}

export interface GroupView {
  id: string;
  name: string;
  standings?: StandingView[];
}

export interface StageView {
  id: string;
  name: string;
  type: string;
  groups?: GroupView[];
  matches?: MatchView[];
}
