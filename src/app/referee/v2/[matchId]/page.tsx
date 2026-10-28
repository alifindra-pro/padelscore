"use client";

import {
  Suspense,
  use,
  useEffect,
  useEffectEvent,
  useState,
  useRef,
} from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { saveMatch, loadMatch, deviceId } from "@/lib/v2/offline-store";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  OfflineMatch,
  Action,
  ScoreState,
  Rules,
  pointLabels,
  serviceInfo,
  enqueue,
  acknowledge,
} from "../../../../../packages/core/src";

type TimedActionType =
  "START_MATCH" | "SUSPEND_MATCH" | "RESUME_MATCH" | "TIME_EXPIRED";

// Only called from tap handlers; stamps the action with the moment of the tap.
function timedAction(type: TimedActionType): Action {
  return { type, at: Date.now() };
}

interface V2MatchResponse {
  ownershipVersion: number;
  rulesSnapshot: Rules;
  stateV2: ScoreState;
  version: number;
  sequence: number;
  actionEvents: { action: Action }[];
  entryA?: { name: string } | null;
  entryB?: { name: string } | null;
}

interface SyncResult {
  accepted: string[];
  state: ScoreState;
  version: number;
  sequence: number;
}
function OfflineScoring({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const [match, setMatch] = useState<OfflineMatch>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();
  const locked = useRef(false);
  const persist = async (next: OfflineMatch) => {
    await saveMatch(next);
    setMatch(next);
  };
  useEffect(() => {
    let active = true;
    loadMatch(matchId)
      .then((cached) => {
        if (active && cached) setMatch(cached);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    navigator.serviceWorker
      ?.register("/scoring-sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = [
          location.pathname,
          ...performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) =>
              new URL(url, location.origin).pathname.startsWith(
                "/_next/static/",
              ),
            ),
        ];
        registration.active?.postMessage({ type: "CACHE_SCORING", urls });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [matchId]);
  async function download(takeover = false) {
    if (match?.pending.length) {
      setError("Sinkronkan atau ekspor antrean sebelum mengunduh ulang.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/v2/matches/${matchId}/claim`, {
        method: "POST",
        body: JSON.stringify({ deviceId: deviceId(), takeover }),
      });
      const m = await apiFetch<V2MatchResponse>(`/api/v2/matches/${matchId}`);
      await persist({
        id: matchId,
        deviceId: deviceId(),
        ownershipVersion: m.ownershipVersion,
        rules: m.rulesSnapshot,
        state: m.stateV2,
        confirmedState: m.stateV2,
        version: m.version,
        sequence: m.sequence,
        history: m.actionEvents.map((e) => e.action),
        pending: [],
        lastSyncedAt: new Date().toISOString(),
        teamA: m.entryA?.name ?? "Pasangan A",
        teamB: m.entryB?.name ?? "Pasangan B",
        conflict: null,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: Action) {
    if (!match || locked.current) return;
    if (action.type === "FINALIZE_MATCH" && (!online || match.pending.length)) {
      setError("Sinkronkan semua aksi sebelum finalisasi.");
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      await persist(enqueue(match, action, crypto.randomUUID()));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function sync() {
    if (!match || !match.pending.length || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await apiFetch<SyncResult>(
        `/api/v2/matches/${matchId}/actions`,
        {
          method: "POST",
          body: JSON.stringify({
            deviceId: match.deviceId,
            ownershipVersion: match.ownershipVersion,
            rulesVersion: 2,
            events: match.pending.slice(0, 500),
          }),
        },
      );
      await persist(acknowledge(match, result, new Date().toISOString()));
      setError("");
    } catch (e) {
      const problem = e as Error & { status?: number };
      setError(problem.message);
      if (problem.status === 409)
        await persist({ ...match, conflict: problem.message });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const autoSync = useEffectEvent(() => void sync());
  useEffect(() => {
    if (online && match?.pending.length && !match.conflict && !busy) {
      const timer = setTimeout(autoSync, 500);
      return () => clearTimeout(timer);
    }
  }, [online, match, busy]);
  const score = match ? pointLabels(match.state) : [];
  const server = match ? serviceInfo(match.state) : null;
  return (
    <main className="scoring-workspace mx-auto w-full p-4 sm:p-6 space-y-5">
      <Link href="/referee" className="text-brand">
        ← Daftar pertandingan
      </Link>
      <div>
        <p className="page-eyebrow">POINT BY POINT.</p>
        <h1 className="page-heading">Konsol wasit</h1>
      </div>
      <p role="status" className="connection-status">
        {online ? "Terhubung" : "Offline — skor disimpan di perangkat"}
      </p>
      {error && (
        <p role="alert" className="p-3 bg-critical/10 text-danger rounded-lg">
          {error}
        </p>
      )}
      {!match ? (
        <button
          className="btn-primary w-full"
          disabled={busy || !online}
          onClick={() => download()}
        >
          Unduh pertandingan & mulai mencatat
        </button>
      ) : (
        <>
          <div className="scoring-card bg-card border border-line rounded-xl p-5 space-y-4">
            <p className="text-xs text-secondary">
              {match.rules.name} · {match.rules.deuce} · {match.state.status}
            </p>
            {[match.teamA, match.teamB].map((name, i) => (
              <div key={i} className="flex justify-between items-center gap-4">
                <span className="font-bold">{name}</span>
                <strong className="scoring-points text-4xl tabular-nums">
                  {score[i]}
                </strong>
              </div>
            ))}
            <p>
              Set:{" "}
              {match.state.sets
                .map((s) =>
                  s.kind === "MATCH_TIEBREAK"
                    ? `MTB ${s.tiebreak.join("–")}`
                    : s.games.join("–"),
                )
                .join(" / ")}
            </p>
            <p className="text-sm">
              Servis {server?.server} ·{" "}
              {server?.side === "RIGHT" ? "kanan" : "kiri"} · percobaan{" "}
              {server?.attempt}
            </p>
            {match.state.changeEnds && (
              <p className="status-live">Bertukar sisi lapangan</p>
            )}
          </div>
          <p className="text-sm">
            {match.pending.length} aksi tersimpan di perangkat, belum
            tersinkron.
            <br />
            Terakhir sinkron:{" "}
            {match.lastSyncedAt
              ? new Date(match.lastSyncedAt).toLocaleTimeString("id-ID")
              : "belum"}
          </p>
          <button
            className="btn-primary w-full"
            disabled={
              busy || !online || !match.pending.length || !!match.conflict
            }
            onClick={sync}
          >
            Sinkronkan sekarang
          </button>
          {!match.conflict && (
            <div className="grid grid-cols-2 gap-3">
              {["NOT_STARTED", "WARMUP"].includes(match.state.status) ? (
                <button
                  className="btn-kinetic col-span-2"
                  disabled={busy}
                  onClick={() => act(timedAction("START_MATCH"))}
                >
                  Mulai pertandingan
                </button>
              ) : match.state.status === "IN_PROGRESS" ? (
                <>
                  {(["A", "B"] as const).map((team, i) => (
                    <button
                      className="btn-kinetic py-10 text-xl"
                      disabled={busy}
                      key={team}
                      onClick={() => act({ type: "AWARD_POINT", team })}
                    >
                      +1 {i === 0 ? match.teamA : match.teamB}
                    </button>
                  ))}
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      act({
                        type: match.state.faults
                          ? "RECORD_SECOND_SERVE_FAULT"
                          : "RECORD_FIRST_SERVE_FAULT",
                      })
                    }
                  >
                    {match.state.faults ? "Double fault" : "First fault"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => act(timedAction("SUSPEND_MATCH"))}
                  >
                    Tunda
                  </button>
                  {match.rules.mode === "TIMED" && (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => act(timedAction("TIME_EXPIRED"))}
                    >
                      Waktu habis
                    </button>
                  )}
                </>
              ) : match.state.status === "SUSPENDED" ? (
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => act(timedAction("RESUME_MATCH"))}
                >
                  Lanjutkan
                </button>
              ) : (
                !match.state.finalized && (
                  <button
                    className="btn-kinetic col-span-2"
                    disabled={busy || !online || !!match.pending.length}
                    onClick={() => act({ type: "FINALIZE_MATCH" })}
                  >
                    Finalisasi hasil
                  </button>
                )
              )}
              {!match.state.finalized && (
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt("Alasan membatalkan aksi terakhir");
                    if (reason) void act({ type: "UNDO_LAST_ACTION", reason });
                  }}
                >
                  Batalkan aksi terakhir
                </button>
              )}
            </div>
          )}
          <details>
            <summary className="cursor-pointer">
              Kontrol lanjutan & pemulihan
            </summary>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {(["RIGHT", "LEFT"] as const).map((side) => (
                <button
                  className="btn-secondary"
                  key={side}
                  onClick={() => act({ type: "SELECT_RECEIVER_SIDE", side })}
                >
                  Terima {side === "RIGHT" ? "kanan" : "kiri"}
                </button>
              ))}
              {(
                [
                  "RECORD_RETIREMENT",
                  "RECORD_WALKOVER",
                  "RECORD_DISQUALIFICATION",
                ] as const
              ).map((type, i) => (
                <button
                  className="btn-secondary"
                  key={type}
                  onClick={() => {
                    const loser = prompt(
                      "Pasangan yang tidak melanjutkan: A atau B",
                    );
                    const reason = prompt("Alasan");
                    if ((loser === "A" || loser === "B") && reason)
                      void act({ type, loser, reason });
                  }}
                >
                  {["Retirement", "Walkover", "Diskualifikasi"][i]}
                </button>
              ))}
              <button
                className="btn-secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(match, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `skor-${match.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Ekspor antrean untuk admin
              </button>
              <button
                className="btn-secondary"
                disabled={busy || !!match.pending.length}
                onClick={() => download(true)}
              >
                Ambil alih (admin)
              </button>
            </div>
          </details>
        </>
      )}
    </main>
  );
}

export default function Page(props: { params: Promise<{ matchId: string }> }) {
  return (
    <Suspense
      fallback={<main className="page-shell py-16">Memuat halaman…</main>}
    >
      <OfflineScoring {...props} />
    </Suspense>
  );
}
