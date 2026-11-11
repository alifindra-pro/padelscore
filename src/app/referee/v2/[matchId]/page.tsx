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
  CoinToss,
  Action,
  ScoreState,
  Rules,
  pointLabels,
  directPointsSummary,
  setPointScores,
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

function openingAction(
  tossChoice: "SERVE" | "RECEIVE",
  serviceOrder: [string, string, string, string],
): Action {
  return { type: "START_MATCH", at: Date.now(), tossChoice, serviceOrder };
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
  const [tossChoice, setTossChoice] = useState<"" | "SERVE" | "RECEIVE">("");
  const [openingA, setOpeningA] = useState<"A1" | "A2">("A1");
  const [openingB, setOpeningB] = useState<"B1" | "B2">("B1");
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
        coinToss: await apiFetch<CoinToss | null>(
          `/api/v2/matches/${matchId}/coin-toss`,
        ),
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
  async function runToss() {
    if (!match || locked.current || !online || match.pending.length) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const coinToss = await apiFetch<CoinToss>(
        `/api/v2/matches/${matchId}/coin-toss`,
        {
          method: "POST",
          body: JSON.stringify({
            deviceId: match.deviceId,
            ownershipVersion: match.ownershipVersion,
          }),
        },
      );
      await persist({ ...match, coinToss });
      setTossChoice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function startAfterToss() {
    if (!match?.coinToss || !tossChoice) {
      setError(
        "Lempar koin dan pilih keputusan pemenang undian terlebih dahulu",
      );
      return;
    }
    const first =
      tossChoice === "SERVE"
        ? match.coinToss.winner
        : match.coinToss.winner === "A"
          ? "B"
          : "A";
    const otherA = openingA === "A1" ? "A2" : "A1";
    const otherB = openingB === "B1" ? "B2" : "B1";
    await act(
      openingAction(
        tossChoice,
        first === "A"
          ? [openingA, openingB, otherA, otherB]
          : [openingB, openingA, otherB, otherA],
      ),
    );
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
  const beforeStart =
    !!match && ["NOT_STARTED", "WARMUP"].includes(match.state.status);
  const firstTeam =
    match?.coinToss && tossChoice
      ? tossChoice === "SERVE"
        ? match.coinToss.winner
        : match.coinToss.winner === "A"
          ? "B"
          : "A"
      : null;
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
        {online ? "Terhubung" : "Offline. Skor disimpan di perangkat."}
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
          {(beforeStart || match.coinToss) && (
            <section
              className="panel space-y-4"
              aria-label="Undian servis pertama"
            >
              <div>
                <h2 className="panel-title">Undian servis pertama</h2>
                <p className="text-sm text-secondary mt-2">
                  Kepala untuk pasangan A · Ekor untuk pasangan B. Pemenang
                  undian memilih servis atau menerima.
                </p>
              </div>
              <p className="text-sm">
                A: {match.teamA}
                <br />
                B: {match.teamB}
              </p>
              {match.coinToss ? (
                <div className="flex items-center gap-4 rounded-xl bg-brand-soft p-4">
                  <div className="w-20 h-20 shrink-0 rounded-full border-2 border-brand flex flex-col items-center justify-center text-brand font-bold">
                    <span>
                      {match.coinToss.face === "KEPALA" ? "Kepala" : "Ekor"}
                    </span>
                    <span>Pasangan {match.coinToss.winner}</span>
                  </div>
                  <p role="status" className="min-w-0 break-words">
                    Pemenang undian:{" "}
                    <strong>
                      {match.coinToss.winner === "A"
                        ? match.teamA
                        : match.teamB}
                    </strong>
                    <br />
                    <span className="text-sm text-secondary">
                      Hasil tersimpan. Undian tidak diulang.
                    </span>
                  </p>
                </div>
              ) : (
                <>
                  <button
                    className="btn-primary w-full"
                    disabled={
                      busy ||
                      !online ||
                      !!match.pending.length ||
                      !!match.conflict
                    }
                    onClick={() => void runToss()}
                  >
                    {busy ? "Mengundi…" : "Lempar koin online"}
                  </button>
                  {!online && (
                    <p className="text-sm text-secondary">
                      Hubungkan internet untuk melakukan undian.
                    </p>
                  )}
                </>
              )}
              {beforeStart && match.coinToss && (
                <div className="space-y-4">
                  <label className="field">
                    Pilihan pemenang undian
                    <select
                      aria-label="Pilihan pemenang undian"
                      value={tossChoice}
                      disabled={busy}
                      onChange={(e) =>
                        setTossChoice(
                          e.target.value as "" | "SERVE" | "RECEIVE",
                        )
                      }
                    >
                      <option value="">
                        Pilih setelah konfirmasi pasangan
                      </option>
                      <option value="SERVE">Servis terlebih dahulu</option>
                      <option value="RECEIVE">Menerima terlebih dahulu</option>
                    </select>
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="field">
                      Pemain pembuka pasangan A
                      <select
                        aria-label="Pemain pembuka pasangan A"
                        value={openingA}
                        disabled={busy}
                        onChange={(e) =>
                          setOpeningA(e.target.value as "A1" | "A2")
                        }
                      >
                        <option value="A1">A1 — pemain pertama</option>
                        <option value="A2">A2 — pemain kedua</option>
                      </select>
                    </label>
                    <label className="field">
                      Pemain pembuka pasangan B
                      <select
                        aria-label="Pemain pembuka pasangan B"
                        value={openingB}
                        disabled={busy}
                        onChange={(e) =>
                          setOpeningB(e.target.value as "B1" | "B2")
                        }
                      >
                        <option value="B1">B1 — pemain pertama</option>
                        <option value="B2">B2 — pemain kedua</option>
                      </select>
                    </label>
                  </div>
                  {firstTeam && (
                    <p role="status">
                      Servis pertama:{" "}
                      <strong>
                        {firstTeam === "A" ? match.teamA : match.teamB}
                      </strong>{" "}
                      · {firstTeam === "A" ? openingA : openingB}. Tekan mulai
                      setelah wasit mengonfirmasi.
                    </p>
                  )}
                </div>
              )}
              {!beforeStart && (
                <p className="text-sm">
                  Pembuka pertandingan: {match.state.serviceOrder[0]} ·{" "}
                  {match.state.serviceOrder[0].startsWith("A")
                    ? match.teamA
                    : match.teamB}
                </p>
              )}
            </section>
          )}
          <div className="scoring-card bg-card border border-line rounded-xl p-5 space-y-4">
            <p className="text-xs text-secondary">
              {match.rules.name} ·{" "}
              {match.rules.mode === "POINTS"
                ? directPointsSummary(match.rules)
                : match.rules.deuce}{" "}
              · {match.state.status}
            </p>
            {[match.teamA, match.teamB].map((name, i) => (
              <div key={i} className="flex justify-between items-center gap-4">
                <span className="font-bold">{name}</span>
                <strong className="scoring-points text-4xl tabular-nums">
                  {score[i]}
                </strong>
              </div>
            ))}
            {match.rules.mode === "POINTS" ? (
              <p role="status">
                {match.state.decidingPoint
                  ? "Seri — satu poin berikutnya menentukan pemenang set."
                  : match.rules.pointsFormat === "TARGET"
                    ? `Set ${match.state.sets.length} · target ${match.rules.totalPoints} poin${match.rules.pointsWinBy === 2 ? " · selisih 2" : ""}`
                    : `Set ${match.state.sets.length} · total ${match.state.points[0] + match.state.points[1]} dari ${match.rules.totalPoints} poin`}
              </p>
            ) : (
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
            )}
            {match.rules.mode === "POINTS" &&
              setPointScores(match.state).length > 0 && (
                <p>
                  Set:{" "}
                  {setPointScores(match.state)
                    .map((p, i) => `${i + 1}: ${p.join("–")}`)
                    .join(" / ")}{" "}
                  · Kemenangan set{" "}
                  {match.state.sets.filter((s) => s.winner === "A").length}–
                  {match.state.sets.filter((s) => s.winner === "B").length}
                </p>
              )}
            {!beforeStart && (
              <p className="text-sm">
                Servis {server?.server} ·{" "}
                {server?.side === "RIGHT" ? "kanan" : "kiri"} · percobaan{" "}
                {server?.attempt}
              </p>
            )}
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
                  disabled={busy || !match.coinToss || !tossChoice}
                  onClick={() => void startAfterToss()}
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
