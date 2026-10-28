export interface TournamentEntry {
  id: string;
  name: string;
  seed?: number | null;
  playerIds?: string[];
}

export interface GeneratedBracketSlot {
  round: number;
  position: number;
  entry: TournamentEntry | null;
  isBye: boolean;
}

export interface GeneratedMatch {
  id?: string;
  matchNumber: number;
  round: number;
  roundName: string;
  entryA: TournamentEntry | null;
  entryB: TournamentEntry | null;
  nextMatchNumber?: number | null;
  isByeMatch?: boolean;
}

export interface BracketGenerationResult {
  totalRounds: number;
  bracketSize: number;
  byesCount: number;
  matches: GeneratedMatch[];
  slots: GeneratedBracketSlot[];
}

export interface GroupPool {
  groupName: string;
  entries: TournamentEntry[];
  matches: GeneratedMatch[];
}

export interface GroupStageResult {
  groups: GroupPool[];
  advancingSlotsCount: number;
}

export interface MatchScoreResult {
  matchId: string;
  entryAId: string;
  entryBId: string;
  winnerId: string | null;
  setsA: number;
  setsB: number;
  gamesA: number[];
  gamesB: number[];
}

export interface GroupStandingEntry {
  entryId: string;
  entryName: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  setsWon: number;
  setsLost: number;
  setDifferential: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
  points: number;
  rank: number;
}

export interface AmericanoRoundMatch {
  matchNumber: number;
  round: number;
  courtNumber: number;
  teamA: {
    name: string;
    player1: TournamentEntry;
    player2: TournamentEntry;
  };
  teamB: {
    name: string;
    player1: TournamentEntry;
    player2: TournamentEntry;
  };
}

export interface AmericanoScheduleResult {
  totalRounds: number;
  courtsCount: number;
  matches: AmericanoRoundMatch[];
}
