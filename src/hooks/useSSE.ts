"use client";

import { useEffect, useState, useEffectEvent } from "react";
import {
  createRealtimeClient,
  type SealedLiveQuery,
} from "@neon/realtime/client";
import type { MatchUpdatePayload } from "@/types/match";

export interface UseSSEOptions<T = unknown, U = unknown> {
  url: string;
  onInitialState?: (data: T) => void;
  onUpdate?: (data: U) => void;
  enabled?: boolean;
}

type ScoreRow = {
  id: string;
  tournament_id: string;
  version: number;
  status: string;
  snapshot_id: string | null;
  current_set: number;
  points_a: string;
  points_b: string;
  sets_a: number;
  sets_b: number;
  games_a: number[];
  games_b: number[];
  server: string | null;
  is_tiebreak: boolean;
  tiebreak_pts_a: number;
  tiebreak_pts_b: number;
  score_version: number;
};
type LiveAccess = { url: string; sealedQuery: SealedLiveQuery<ScoreRow> };

function toPayload(row: ScoreRow): MatchUpdatePayload {
  return {
    matchId: row.id,
    tournamentId: row.tournament_id,
    version: row.version,
    status: row.status,
    snapshot: row.snapshot_id
      ? {
          currentSet: row.current_set,
          pointsA: row.points_a,
          pointsB: row.points_b,
          setsA: row.sets_a,
          setsB: row.sets_b,
          gamesA: row.games_a,
          gamesB: row.games_b,
          server: row.server ?? "A",
          isTiebreak: row.is_tiebreak,
          tiebreakPtsA: row.tiebreak_pts_a,
          tiebreakPtsB: row.tiebreak_pts_b,
          version: row.score_version,
        }
      : null,
  };
}

export function useSSE<T = unknown, U = unknown>({
  url,
  onInitialState,
  onUpdate,
  enabled = true,
}: UseSSEOptions<T, U>) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiveInitial = useEffectEvent((data: T) => onInitialState?.(data));
  const receiveUpdate = useEffectEvent((data: U) => onUpdate?.(data));

  useEffect(() => {
    if (!enabled || !url) return;
    let closed = false;
    let attempt = 0;
    let dispose = () => {};
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const liveUrl = url.replace("/api/v1/stream/", "/api/v1/live/");
    const isMatch = url.includes("/matches/");

    function failed(status?: number) {
      if (closed) return;
      dispose();
      clearTimeout(renewalTimer);
      clearTimeout(retryTimer);
      setIsConnected(false);
      setError("Koneksi skor langsung terputus");
      if (status && [401, 403, 404].includes(status)) return;
      retryTimer = setTimeout(
        () => void connect(),
        Math.min(1000 * 2 ** attempt++, 30000),
      );
    }

    function legacyStream() {
      const es = new EventSource(url);
      dispose = () => es.close();
      es.onopen = () => {
        if (closed) return;
        attempt = 0;
        setIsConnected(true);
        setError(null);
      };
      es.addEventListener("initial-state", (event) => {
        if (!closed) {
          try {
            receiveInitial(JSON.parse(event.data));
          } catch {
            failed();
          }
        }
      });
      for (const eventName of ["score-update", "match-update"]) {
        es.addEventListener(eventName, (event) => {
          if (!closed) {
            try {
              receiveUpdate(JSON.parse((event as MessageEvent).data));
            } catch {
              failed();
            }
          }
        });
      }
      es.onerror = () => failed();
    }

    async function access() {
      return fetch(liveUrl, { cache: "no-store", signal: abort.signal });
    }

    async function connect() {
      if (closed) return;
      try {
        const response = await access();
        if (closed) return;
        // Keep the existing transport for local setups without Neon configuration.
        if (response.status === 501) {
          legacyStream();
          return;
        }
        if (!response.ok) {
          failed(response.status);
          return;
        }
        const config = (await response.json()) as LiveAccess;
        if (closed) return;
        const client = createRealtimeClient({ url: config.url });
        const subscription = client.subscribe(config.sealedQuery);
        let active = true;
        dispose = () => {
          active = false;
          client.close();
        };
        let initial = true;
        const previous = new Map<string, string>();
        subscription.onChange((snapshot) => {
          if (
            closed ||
            !active ||
            snapshot.status !== "live" ||
            snapshot.data === undefined
          )
            return;
          const rows = snapshot.data;
          if (isMatch && rows.length === 0) {
            failed(404);
            return;
          }
          setIsConnected(true);
          setError(null);
          attempt = 0;
          if (initial) {
            receiveInitial(
              (isMatch
                ? toPayload(rows[0])
                : {
                    tournamentId: url.split("/").at(-1),
                    activeMatches: [],
                  }) as T,
            );
          }
          const ids = new Set(rows.map((row) => row.id));
          for (const id of previous.keys())
            if (!ids.has(id)) previous.delete(id);
          for (const row of rows) {
            const fingerprint = JSON.stringify(row);
            if (
              previous.get(row.id) !== fingerprint &&
              (!initial || !isMatch)
            ) {
              receiveUpdate(toPayload(row) as U);
            }
            previous.set(row.id, fingerprint);
          }
          initial = false;
        });
        subscription.onStateChange((state) => {
          if (closed || !active) return;
          if (state.status !== "live") setIsConnected(false);
          if (state.status === "error") failed();
        });
        const renew = async () => {
          if (closed || !active) return;
          try {
            const response = await access();
            if (closed || !active) return;
            if (!response.ok) {
              failed(response.status);
              return;
            }
            const fresh = (await response.json()) as LiveAccess;
            if (closed || !active) return;
            await subscription.renew(fresh.sealedQuery);
            schedule(fresh.sealedQuery.expiresAt);
          } catch {
            if (active) failed();
          }
        };
        const schedule = (expiresAt: number) => {
          clearTimeout(renewalTimer);
          if (!closed && active)
            renewalTimer = setTimeout(
              () => void renew(),
              Math.max(0, expiresAt - Date.now() - 10000),
            );
        };
        schedule(config.sealedQuery.expiresAt);
      } catch {
        failed();
      }
    }

    void connect();
    return () => {
      closed = true;
      abort.abort();
      clearTimeout(retryTimer);
      clearTimeout(renewalTimer);
      dispose();
      setIsConnected(false);
    };
  }, [url, enabled]);
  return { isConnected, error };
}
