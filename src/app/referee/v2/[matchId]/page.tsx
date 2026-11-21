"use client";
import { deuceLabel } from "@/lib/labels";

import {
  Suspense,
  use,
  useEffect,
  useEffectEvent,
  useState,
  useRef,
} from "react";
import Link from "next/link";
import { StartCodeGate } from "@/components/referee/StartCodeGate";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api-client";
import {
  saveMatch,
  loadMatch,
  forgetMatch,
  deviceId,
} from "@/lib/v2/offline-store";
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
type Team = "A" | "B";
type Ending =
  "RECORD_RETIREMENT" | "RECORD_WALKOVER" | "RECORD_DISQUALIFICATION";

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
  matchNumber?: number;
  actionEvents: { action: Action }[];
  court?: { name: string } | null;
  stage?: { name: string; category?: { name: string } } | null;
  entryA?: {
    name: string;
    players?: { player: { fullName: string } }[];
  } | null;
  entryB?: {
    name: string;
    players?: { player: { fullName: string } }[];
  } | null;
}

interface SyncResult {
  accepted: string[];
  state: ScoreState;
  version: number;
  sequence: number;
}

const FINISHED = ["COMPLETED", "RETIRED", "WALKOVER", "DISQUALIFIED"];
const endingText: Record<Ending, string> = {
  RECORD_RETIREMENT: "Pasangan mundur (cedera dll.)",
  RECORD_WALKOVER: "Tidak hadir (WO)",
  RECORD_DISQUALIFICATION: "Diskualifikasi",
};
const outcomeText: Record<string, string> = {
  RETIRED: "lawan mundur",
  WALKOVER: "menang WO",
  DISQUALIFIED: "lawan didiskualifikasi",
};

function OfflineScoring({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const { user } = useAuth();
  const [match, setMatch] = useState<OfflineMatch>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [gone, setGone] = useState(false);
  const [tossChoice, setTossChoice] = useState<"" | "SERVE" | "RECEIVE">("");
  const [openingA, setOpeningA] = useState<"A1" | "A2">("A1");
  const [openingB, setOpeningB] = useState<"B1" | "B2">("B1");
  const [undoOpen, setUndoOpen] = useState(false);
  const [ending, setEnding] = useState<{
    type: Ending | "";
    loser: Team | "";
    reason: string;
  }>({ type: "", loser: "", reason: "" });
  const [syncing, setSyncing] = useState(false);
  const online = useOnlineStatus();
  // The latest match, so a tap during an upload builds on the newest score.
  const latest = useRef<OfflineMatch | undefined>(undefined);
  const network = useRef(false);
  const uploading = useRef(false);
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const persist = (next: OfflineMatch) => {
    latest.current = next;
    setMatch(next);
    // Saved to the device in the order the taps happened.
    saves.current = saves.current.catch(() => {}).then(() => saveMatch(next));
    return saves.current;
  };
  useEffect(() => {
    let active = true;
    loadMatch(matchId)
      .then((cached) => {
        if (active && cached) {
          latest.current = cached;
          setMatch(cached);
          // A redraw deletes matches: drop a copy the server no longer has.
          if (navigator.onLine)
            apiFetch(`/api/v2/matches/${matchId}`).catch(async (e) => {
              const status = (e as { status?: number }).status;
              if (!active || (status !== 404 && status !== 403)) return;
              await forgetMatch(matchId);
              latest.current = undefined;
              setMatch(undefined);
              setGone(true);
            });
        }
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
      setError("Kirim semua skor yang tersimpan di HP sebelum membuka ulang.");
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
        info: {
          category: m.stage?.category?.name,
          matchNumber: m.matchNumber,
          court: m.court?.name ?? null,
          playersA: m.entryA?.players?.map((p) => p.player.fullName),
          playersB: m.entryB?.players?.map((p) => p.player.fullName),
        },
      });
      setError("");
      setNeedsCode(false);
    } catch (e) {
      // A referee needs the control desk's start code before the first download.
      if ((e as { code?: string }).code === "START_LOCKED") {
        setNeedsCode(true);
        setError("");
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runToss() {
    const match = latest.current;
    if (!match || network.current || !online || match.pending.length) return;
    network.current = true;
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
      await persist({ ...latest.current!, coinToss });
      setTossChoice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      network.current = false;
      setBusy(false);
    }
  }
  async function startAfterToss() {
    if (!match?.coinToss || !tossChoice) {
      setError("Lempar koin dan pilih keputusan pemenang undian dahulu.");
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
  // Scoring is applied on the device at once and never waits for an upload.
  async function act(action: Action) {
    const match = latest.current;
    if (!match) return;
    if (action.type === "FINALIZE_MATCH" && (!online || match.pending.length)) {
      setError("Kirim semua skor ke server sebelum mengirim hasil akhir.");
      return;
    }
    try {
      await persist(enqueue(match, action, crypto.randomUUID()));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sync() {
    const match = latest.current;
    if (!match || !match.pending.length || uploading.current) return;
    uploading.current = true;
    setSyncing(true);
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
      // Taps made while this upload was in flight stay queued.
      await persist(
        acknowledge(latest.current!, result, new Date().toISOString()),
      );
      setError("");
    } catch (e) {
      const problem = e as Error & { status?: number };
      setError(problem.message);
      if (problem.status === 409)
        await persist({ ...latest.current!, conflict: problem.message });
    } finally {
      uploading.current = false;
      setSyncing(false);
    }
  }
  const autoSync = useEffectEvent(() => void sync());
  // Uploads every half second while scores are waiting. Depends on whether
  // anything is waiting, not on each tap, so fast tapping cannot postpone it.
  const waiting = !!match?.pending.length && !match.conflict;
  useEffect(() => {
    if (online && waiting && !syncing) {
      const timer = setTimeout(autoSync, 500);
      return () => clearTimeout(timer);
    }
  }, [online, waiting, syncing]);

  const isReferee = user?.role === "REFEREE";
  const name = (slot: string) => {
    const list = slot.startsWith("A")
      ? match?.info?.playersA
      : match?.info?.playersB;
    return list?.[Number(slot[1]) - 1] ?? slot;
  };
  const team = (t: Team) => (t === "A" ? match?.teamA : match?.teamB) ?? t;
  const beforeStart =
    !!match && ["NOT_STARTED", "WARMUP"].includes(match.state.status);
  const playing =
    !!match && ["IN_PROGRESS", "SUSPENDED"].includes(match.state.status);
  const ended = !!match && FINISHED.includes(match.state.status);
  const firstTeam =
    match?.coinToss && tossChoice
      ? tossChoice === "SERVE"
        ? match.coinToss.winner
        : match.coinToss.winner === "A"
          ? "B"
          : "A"
      : null;
  const points = match ? pointLabels(match.state) : ["0", "0"];
  const server = match && !beforeStart ? serviceInfo(match.state) : null;
  const sets = match ? setPointScores(match.state) : [];
  const games = match?.state.sets.at(-1)?.games ?? [0, 0];
  const finalScore = sets.map((s) => s.join("–")).join(", ");
  const canUndo =
    !!match &&
    !match.state.finalized &&
    match.history.length + match.pending.length > 0;
  const info = match?.info;
  // At 40–40 under golden point, the receiving pair picks the side.
  const goldenPoint =
    !!match &&
    match.state.status === "IN_PROGRESS" &&
    match.rules.mode !== "POINTS" &&
    (match.rules.deuce === "GOLDEN_POINT" ||
      (match.rules.deuce === "STAR_POINT" &&
        match.state.advantageCycles >= 2)) &&
    match.state.points[0] >= 3 &&
    match.state.points[0] === match.state.points[1];
  const title = match ? `${match.teamA} vs ${match.teamB}` : "Konsol wasit";

  return (
    <main className="scoring-workspace referee-console mx-auto w-full p-4 sm:p-6 space-y-4">
      <Link href="/referee" className="text-brand">
        ← Daftar laga
      </Link>
      <header className="console-head">
        <p className="page-eyebrow">
          {[
            info?.category,
            info?.matchNumber ? `Laga ${info.matchNumber}` : "",
            info?.court,
          ]
            .filter(Boolean)
            .join(" · ") || "Pencatatan skor"}
        </p>
        <h1 className="console-title">{title}</h1>
        <p
          role="status"
          className={online ? "console-net" : "console-net is-offline"}
        >
          {!online
            ? "Offline. Skor tetap tersimpan di HP dan terkirim saat online."
            : match?.pending.length
              ? `Mengirim ${match.pending.length} skor…`
              : match
                ? "Terhubung. Semua skor sudah terkirim."
                : "Terhubung"}
        </p>
      </header>
      {error && (
        <p role="alert" className="console-error">
          {error}
        </p>
      )}
      {match?.conflict && (
        <section className="panel console-conflict" role="alert">
          <h2 className="panel-title">Skor berbeda dengan server</h2>
          <p className="text-sm">
            {match.conflict} Jangan lanjut mencatat. Hubungi panitia; mereka
            bisa mengambil alih laga ini.
          </p>
        </section>
      )}

      {gone ? (
        <section className="panel space-y-3" role="alert">
          <h2 className="panel-title">Laga ini sudah tidak ada</h2>
          <p className="text-sm text-secondary">
            Panitia mengulang undian atau jadwal. Salinan di HP ini sudah
            dihapus. Buka daftar laga untuk melihat laga terbaru.
          </p>
          <Link className="btn-primary w-full text-center" href="/referee">
            Kembali ke daftar laga
          </Link>
        </section>
      ) : !match && needsCode ? (
        <StartCodeGate matchId={matchId} onUnlocked={() => void download()} />
      ) : !match ? (
        <section className="panel space-y-3">
          <p className="text-sm text-secondary">
            Buka laga ini di HP Anda untuk mulai mencatat skor. Skor tetap
            tersimpan di HP jika sinyal hilang.
          </p>
          <button
            className="btn-kinetic w-full"
            disabled={busy || !online}
            onClick={() => download()}
          >
            {busy ? "Membuka…" : "Buka laga ini"}
          </button>
        </section>
      ) : (
        <>
          {beforeStart && (
            <section className="panel console-setup" aria-label="Sebelum mulai">
              <h2 className="panel-title">Sebelum mulai</h2>
              <ol className="console-steps">
                <li>
                  <p className="console-step-title">1. Undian koin</p>
                  <p className="text-sm text-secondary">
                    Kepala untuk {match.teamA}. Ekor untuk {match.teamB}.
                  </p>
                  {match.coinToss ? (
                    <p className="console-toss" role="status">
                      {match.coinToss.face === "KEPALA" ? "Kepala" : "Ekor"}:{" "}
                      <strong>{team(match.coinToss.winner)}</strong> menang
                      undian
                    </p>
                  ) : (
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
                      {busy ? "Mengundi…" : "Lempar koin"}
                    </button>
                  )}
                  {!online && !match.coinToss && (
                    <p className="text-sm text-secondary">
                      Butuh internet untuk undian.
                    </p>
                  )}
                </li>
                {match.coinToss && (
                  <li>
                    <p className="console-step-title">
                      2. {team(match.coinToss.winner)} memilih
                    </p>
                    <div className="console-choice" role="group">
                      {(
                        [
                          ["SERVE", "Servis dulu"],
                          ["RECEIVE", "Terima dulu"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          aria-pressed={tossChoice === value}
                          disabled={busy}
                          onClick={() => setTossChoice(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                )}
                {match.coinToss && tossChoice && (
                  <li>
                    <p className="console-step-title">
                      3. Siapa yang mulai di tiap pasangan
                    </p>
                    {(["A", "B"] as const).map((t) => (
                      <div key={t} className="console-opening">
                        <p className="text-sm text-secondary">
                          {team(t)}{" "}
                          {firstTeam === t ? "(servis pertama)" : "(menerima)"}
                        </p>
                        <div className="console-choice" role="group">
                          {([1, 2] as const).map((n) => {
                            const slot = `${t}${n}`;
                            const chosen =
                              t === "A" ? openingA === slot : openingB === slot;
                            return (
                              <button
                                key={slot}
                                aria-pressed={chosen}
                                disabled={busy}
                                onClick={() =>
                                  t === "A"
                                    ? setOpeningA(slot as "A1" | "A2")
                                    : setOpeningB(slot as "B1" | "B2")
                                }
                              >
                                {name(slot)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </li>
                )}
              </ol>
              <button
                className="btn-kinetic w-full console-big"
                disabled={busy || !match.coinToss || !tossChoice}
                onClick={() => void startAfterToss()}
              >
                Mulai pertandingan
              </button>
            </section>
          )}

          {!beforeStart && (
            <section className="console-board" aria-label="Papan skor">
              <p className="console-rules">
                {match.rules.name} ·{" "}
                {match.rules.mode === "POINTS"
                  ? directPointsSummary(match.rules)
                  : deuceLabel(match.rules.deuce)}
              </p>
              {(["A", "B"] as const).map((t, i) => (
                <div
                  key={t}
                  className={
                    match.state.winner === t
                      ? "console-row is-winner"
                      : "console-row"
                  }
                >
                  <span className="console-team">
                    {team(t)}
                    {server?.team === t && playing && (
                      <small>Servis: {name(server.server)}</small>
                    )}
                  </span>
                  {match.rules.mode !== "POINTS" && (
                    <span className="console-games" aria-label="Game">
                      {games[i]}
                    </span>
                  )}
                  {(playing || match.rules.mode === "POINTS") && (
                    <span className="console-points" aria-label="Poin">
                      {points[i]}
                    </span>
                  )}
                </div>
              ))}
              {sets.length > 1 && (
                <p className="text-sm text-secondary">
                  Set: {sets.map((s) => s.join("–")).join(" / ")}
                </p>
              )}
              {playing && server && (
                <p className="text-sm">
                  Servis dari sisi {server.side === "RIGHT" ? "kanan" : "kiri"}
                  {server.attempt > 1 ? " · servis kedua" : ""}
                </p>
              )}
              {goldenPoint && (
                <div className="console-golden">
                  <p className="console-alert">
                    Poin penentu. Pasangan penerima memilih sisi:
                  </p>
                  <div
                    className="console-choice"
                    role="group"
                    aria-label="Sisi penerima golden point"
                  >
                    {(["RIGHT", "LEFT"] as const).map((side) => (
                      <button
                        key={side}
                        disabled={busy}
                        aria-pressed={match.state.goldenReceiverSide === side}
                        onClick={() =>
                          act({ type: "SELECT_RECEIVER_SIDE", side })
                        }
                      >
                        Terima di {side === "RIGHT" ? "kanan" : "kiri"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {match.state.decidingPoint && (
                <p className="console-alert">
                  Poin penentu: poin berikutnya menentukan.
                </p>
              )}
              {match.state.changeEnds && (
                <p className="console-alert">Bertukar sisi lapangan</p>
              )}
            </section>
          )}

          {match.state.status === "IN_PROGRESS" && !match.conflict && (
            <section className="console-actions" aria-label="Catat poin">
              {(["A", "B"] as const).map((t) => (
                <button
                  key={t}
                  className="btn-kinetic console-point"
                  disabled={busy}
                  onClick={() => act({ type: "AWARD_POINT", team: t })}
                >
                  <small>Poin untuk</small>
                  {team(t)}
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
                {match.state.faults ? "Double fault" : "Fault servis"}
              </button>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => act(timedAction("SUSPEND_MATCH"))}
              >
                Tunda laga
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
            </section>
          )}

          {match.state.status === "SUSPENDED" && !match.conflict && (
            <button
              className="btn-primary w-full console-big"
              disabled={busy}
              onClick={() => act(timedAction("RESUME_MATCH"))}
            >
              Lanjutkan laga
            </button>
          )}

          {ended && !match.state.finalized && !match.conflict && (
            <section className="panel console-finish" aria-label="Kirim hasil">
              <h2 className="panel-title">Laga selesai</h2>
              <p>
                Pemenang:{" "}
                <strong>
                  {match.state.winner ? team(match.state.winner) : "—"}
                </strong>
                {finalScore ? ` · ${finalScore}` : ""}
                {outcomeText[match.state.status]
                  ? ` (${outcomeText[match.state.status]})`
                  : ""}
              </p>
              <p className="text-sm text-secondary">
                Tunjukkan skor ke kedua pasangan. Jika sudah benar, kirim ke
                panitia. Jika ada yang salah, batalkan aksi terakhir.
              </p>
              <button
                className="btn-kinetic w-full console-big"
                disabled={busy || !online || !!match.pending.length}
                onClick={() => act({ type: "FINALIZE_MATCH" })}
              >
                Kirim hasil ke panitia
              </button>
              {(!online || match.pending.length > 0) && (
                <p className="text-sm text-secondary">
                  Menunggu semua skor terkirim…
                </p>
              )}
            </section>
          )}

          {match.state.finalized && (
            <section
              className="panel console-done"
              role="status"
              aria-label="Hasil terkirim"
            >
              <h2 className="panel-title">
                {match.pending.length ? "Mengirim hasil…" : "Hasil terkirim"}
              </h2>
              <p>
                {match.state.winner ? team(match.state.winner) : "—"} menang
                {finalScore ? ` ${finalScore}` : ""}.
              </p>
              <p className="text-sm text-secondary">
                Panitia akan mengesahkan hasil ini. Anda bisa kembali ke daftar
                laga.
              </p>
              <Link className="btn-primary w-full text-center" href="/referee">
                Kembali ke daftar laga
              </Link>
            </section>
          )}

          {canUndo && !match.conflict && (
            <div className="console-undo">
              {!undoOpen ? (
                <button
                  className="btn-secondary w-full"
                  disabled={busy}
                  onClick={() => setUndoOpen(true)}
                >
                  Batalkan aksi terakhir
                </button>
              ) : (
                <div
                  className="panel space-y-3"
                  role="group"
                  aria-label="Alasan pembatalan"
                >
                  <p className="font-semibold">Kenapa dibatalkan?</p>
                  <div className="console-choice">
                    {["Salah tekan", "Koreksi skor"].map((reason) => (
                      <button
                        key={reason}
                        disabled={busy}
                        onClick={() => {
                          setUndoOpen(false);
                          void act({ type: "UNDO_LAST_ACTION", reason });
                        }}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-sm text-secondary underline"
                    onClick={() => setUndoOpen(false)}
                  >
                    Tidak jadi
                  </button>
                </div>
              )}
            </div>
          )}

          {!match.state.finalized && (
            <details className="console-more">
              <summary>Laga berakhir lebih awal, atau masalah lain</summary>
              <div className="space-y-4 mt-3">
                {!ended && (
                  <div className="panel space-y-3">
                    <p className="font-semibold">Akhiri laga lebih awal</p>
                    <div className="console-choice is-stacked" role="group">
                      {(Object.keys(endingText) as Ending[]).map((type) => (
                        <button
                          key={type}
                          aria-pressed={ending.type === type}
                          onClick={() => setEnding({ ...ending, type })}
                        >
                          {endingText[type]}
                        </button>
                      ))}
                    </div>
                    {ending.type && (
                      <>
                        <p className="text-sm text-secondary">
                          Pasangan yang tidak melanjutkan:
                        </p>
                        <div className="console-choice" role="group">
                          {(["A", "B"] as const).map((t) => (
                            <button
                              key={t}
                              aria-pressed={ending.loser === t}
                              onClick={() => setEnding({ ...ending, loser: t })}
                            >
                              {team(t)}
                            </button>
                          ))}
                        </div>
                        <label className="field">
                          Keterangan singkat
                          <input
                            value={ending.reason}
                            maxLength={200}
                            placeholder="Contoh: cedera pergelangan kaki"
                            onChange={(e) =>
                              setEnding({ ...ending, reason: e.target.value })
                            }
                          />
                        </label>
                        <button
                          className="btn-primary w-full"
                          disabled={
                            busy ||
                            !ending.loser ||
                            ending.reason.trim().length < 3
                          }
                          onClick={() => {
                            const { type, loser, reason } = ending;
                            if (!type || !loser) return;
                            setEnding({ type: "", loser: "", reason: "" });
                            void act({ type, loser, reason: reason.trim() });
                          }}
                        >
                          Catat: {team((ending.loser || "A") as Team)}{" "}
                          {ending.loser ? "tidak melanjutkan" : "…"}
                        </button>
                      </>
                    )}
                  </div>
                )}
                <button
                  className="btn-secondary w-full"
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
                  Simpan cadangan skor (untuk panitia)
                </button>
                {!isReferee && (
                  <button
                    className="btn-secondary w-full"
                    disabled={busy || !!match.pending.length}
                    onClick={() => download(true)}
                  >
                    Ambil alih laga ini (admin)
                  </button>
                )}
              </div>
            </details>
          )}
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
