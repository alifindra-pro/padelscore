export interface Ruleset {
  setsToWin: number;        // e.g., 2 for best-of-3
  gamesPerSet: number;      // e.g., 6
  tiebreakAt: number;       // e.g., 6 (tiebreak at 6-6)
  tiebreakPoints: number;   // e.g., 7 (first to 7)
  goldenPoint: boolean;     // No advantage at deuce
  superTiebreak: boolean;   // Final set is a super tiebreak
  superTiebreakPts: number; // e.g., 10
  deuceType: 'ADVANTAGE' | 'GOLDEN_POINT' | 'NO_AD';
}

export type Team = 'A' | 'B';
export type PointScore = '0' | '15' | '30' | '40' | 'AD';

export interface SetState {
  setNumber: number;
  gamesA: number;
  gamesB: number;
  isTiebreak: boolean;
  tiebreakPointsA: number;
  tiebreakPointsB: number;
  winner: Team | null;
}

export interface MatchState {
  currentSet: number;       // 1-indexed
  sets: SetState[];
  pointsA: PointScore;
  pointsB: PointScore;
  server: Team;
  isDeuce: boolean;
  isTiebreak: boolean;
  isSuperTiebreak: boolean;
  tiebreakPointsA: number;
  tiebreakPointsB: number;
  isFinished: boolean;
  winner: Team | null;
  setsWonA: number;
  setsWonB: number;
}

export interface ScoringEvent {
  type: 'POINT_SCORED' | 'GAME_WON' | 'SET_WON' | 'MATCH_WON' | 'TIEBREAK_START' | 'SUPER_TIEBREAK_START';
  team: Team;
  data?: Record<string, unknown>;
}

export interface ScoringResult {
  state: MatchState;
  events: ScoringEvent[];
}
