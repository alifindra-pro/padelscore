import { Action, Rules, ScoreState, replay } from "./scoring";
export interface PendingAction {
  id: string;
  baseVersion: number;
  sequence: number;
  action: Action;
}
export interface OfflineMatch {
  id: string;
  deviceId: string;
  ownershipVersion: number;
  rules: Rules;
  state: ScoreState;
  confirmedState: ScoreState;
  version: number;
  sequence: number;
  history: Action[];
  pending: PendingAction[];
  lastSyncedAt: string | null;
  teamA: string;
  teamB: string;
  conflict: string | null;
}
export function enqueue(
  match: OfflineMatch,
  action: Action,
  eventId: string,
): OfflineMatch {
  if (match.conflict) throw new Error("Selesaikan konflik sebelum melanjutkan");
  const history = [
    ...match.history,
    ...match.pending.map((e) => e.action),
    action,
  ];
  const state = replay(match.rules, history);
  return {
    ...match,
    state,
    pending: [
      ...match.pending,
      {
        id: eventId,
        sequence: match.sequence + match.pending.length + 1,
        baseVersion: match.version + match.pending.length,
        action,
      },
    ],
  };
}
export function acknowledge(
  match: OfflineMatch,
  result: {
    accepted: string[];
    state: ScoreState;
    version: number;
    sequence: number;
  },
  now: string,
): OfflineMatch {
  const ids = new Set(result.accepted);
  const synced = match.pending.filter((e) => ids.has(e.id));
  const pending = match.pending.filter((e) => !ids.has(e.id));
  const history = [...match.history, ...synced.map((e) => e.action)];
  return {
    ...match,
    history,
    pending,
    confirmedState: result.state,
    state: pending.length
      ? replay(match.rules, [...history, ...pending.map((e) => e.action)])
      : result.state,
    version: result.version,
    sequence: result.sequence,
    lastSyncedAt: now,
    conflict: null,
  };
}
