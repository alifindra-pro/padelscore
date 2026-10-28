"use client";

import { Icon } from "@/components/ui/Icon";

import React, { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  MatchMutationResult,
  MatchView,
  ScoreSnapshotView,
} from "@/types/match";

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function RefereeScoringContent({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMatch = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await apiFetch<MatchView>(`/api/v1/matches/${matchId}`);
      setMatch(data);
    } catch (err) {
      setErrorMessage(errorText(err, "Gagal memuat pertandingan."));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    let active = true;
    apiFetch<MatchView>(`/api/v1/matches/${matchId}`)
      .then((data) => {
        if (active) setMatch(data);
      })
      .catch((err) => {
        if (active)
          setErrorMessage(errorText(err, "Gagal memuat pertandingan."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [matchId]);

  const applyResult = (res: MatchMutationResult) =>
    setMatch((prev) =>
      prev
        ? {
            ...prev,
            ...res.match,
            scoreSnapshot: res.snapshot ?? prev.scoreSnapshot,
          }
        : prev,
    );

  const handleStartMatch = async () => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await apiFetch<MatchMutationResult>(
        `/api/v1/matches/${matchId}/start`,
        {
          method: "POST",
        },
      );
      applyResult(res);
      await loadMatch();
    } catch (err) {
      setErrorMessage(errorText(err, "Gagal memulai pertandingan."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleScorePoint = async (team: "A" | "B") => {
    if (!match || match.status !== "IN_PROGRESS" || actionLoading) return;

    if (!isOnline) {
      setErrorMessage(
        "Perangkat offline. Sambungkan internet sebelum mencatat poin.",
      );
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const idempotencyKey = crypto.randomUUID();

      const res = await apiFetch<MatchMutationResult>(
        `/api/v1/matches/${matchId}/score-events`,
        {
          method: "POST",
          body: JSON.stringify({
            team,
            clientVersion: match.version,
            idempotencyKey,
          }),
        },
      );

      // Update state immediately with server confirmation
      applyResult(res);
      await loadMatch();
    } catch (err) {
      if ((err as { status?: number }).status === 409) {
        // Concurrency conflict - auto sync latest server state
        setErrorMessage("Skor berubah di server. Memuat skor terbaru…");
        await loadMatch();
      } else {
        setErrorMessage(errorText(err, "Gagal mencatat poin."));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!match || actionLoading) return;

    const confirmUndo = window.confirm("Batalkan poin terakhir?");
    if (!confirmUndo) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const res = await apiFetch<MatchMutationResult>(
        `/api/v1/matches/${matchId}/undo`,
        {
          method: "POST",
          body: JSON.stringify({
            clientVersion: match.version,
            idempotencyKey: crypto.randomUUID(),
            reason: "Koreksi manual wasit",
          }),
        },
      );

      applyResult(res);
      await loadMatch();
    } catch (err) {
      setErrorMessage(errorText(err, "Gagal membatalkan poin."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinishMatch = async () => {
    const confirmFinish = window.confirm(
      "Akhiri pertandingan ini secara resmi?",
    );
    if (!confirmFinish) return;

    try {
      setActionLoading(true);
      await apiFetch(`/api/v1/matches/${matchId}/finish`, {
        method: "POST",
      });
      await loadMatch();
    } catch (err) {
      setErrorMessage(errorText(err, "Gagal mengakhiri pertandingan."));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!match) {
    return (
      <main className="page-shell py-16">
        <div role="alert" className="panel space-y-4">
          <h1 className="text-xl font-bold">Pertandingan belum dapat dimuat</h1>
          <p className="text-secondary">{errorMessage}</p>
          <button
            className="btn-primary"
            onClick={() => {
              setLoading(true);
              void loadMatch();
            }}
          >
            Coba lagi
          </button>
          <Link href="/referee" className="btn-secondary">
            Kembali ke daftar pertandingan
          </Link>
        </div>
      </main>
    );
  }

  const snapshot: ScoreSnapshotView = match.scoreSnapshot ?? {
    pointsA: "0",
    pointsB: "0",
    setsA: 0,
    setsB: 0,
    gamesA: [0],
    gamesB: [0],
    currentSet: 1,
    server: "A",
    isTiebreak: false,
  };

  const isGoldenPoint =
    match.stage?.category?.ruleset?.goldenPoint &&
    snapshot.pointsA === "40" &&
    snapshot.pointsB === "40";

  return (
    <div className="scoring-workspace bg-canvas text-ink flex flex-col w-full mx-auto select-none">
      {/* Top Status Header */}
      <header className="p-3 bg-card border-b border-line flex items-center justify-between">
        <Link
          href="/referee"
          className="text-xs font-bold text-secondary hover:text-ink flex items-center gap-1"
        >
          ← Keluar
        </Link>

        <div className="text-center">
          <span className="text-[10px] font-sans tabular-nums font-bold text-brand-strong uppercase tracking-widest bg-brand-soft px-2 py-0.5 rounded border border-brand/20">
            {match.court?.name || "Lapangan"}
          </span>
          <p className="text-[11px] font-extrabold text-ink mt-0.5">
            {match.stage?.category?.name} &bull; Set {snapshot.currentSet}
          </p>
        </div>

        {/* Network & Concurrency Indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isOnline ? "bg-brand" : "bg-critical animate-ping"
            }`}
          />
          <span className="text-[10px] font-sans tabular-nums text-secondary">
            {isOnline ? `v${match.version}` : "Offline"}
          </span>
        </div>
      </header>

      {/* Main Scoreboard & Controls */}
      <main className="p-4 sm:p-6 space-y-4 flex-1 flex flex-col">
        <div>
          <p className="page-eyebrow">POINT BY POINT.</p>
          <h1 className="page-heading">Papan skor wasit</h1>
        </div>
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-critical/10 border border-critical/30 text-danger text-xs rounded-xl flex justify-between items-center">
            <span>{errorMessage}</span>
            <button
              onClick={loadMatch}
              className="underline text-[11px] font-bold"
            >
              Muat ulang
            </button>
          </div>
        )}

        {/* Golden Point Banner */}
        {isGoldenPoint && (
          <div className="status-live p-3 text-center rounded-lg">
            Golden point: poin penentu game
          </div>
        )}

        {/* Big Scorecard Display */}
        <div className="bg-card border border-line rounded-2xl overflow-hidden shadow-card">
          {/* Header row */}
          <div className="grid grid-cols-12 bg-canvas px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider border-b border-line">
            <span className="col-span-7">Pasangan</span>
            <span className="col-span-2 text-center">Game</span>
            <span className="col-span-3 text-right">Poin</span>
          </div>

          {/* Team A Row */}
          <div className="grid grid-cols-12 items-center px-4 py-4 border-b border-line bg-card">
            <div className="col-span-7 flex items-center gap-2 pr-2">
              {snapshot.server === "A" && (
                <span className="text-sm">
                  <Icon name="court" size={20} />
                </span>
              )}
              <div className="truncate">
                <p className="font-extrabold text-ink text-sm truncate">
                  {match.entryA?.name || "Pasangan A"}
                </p>
                <span className="text-[10px] text-secondary">
                  Set menang: {snapshot.setsA}
                </span>
              </div>
            </div>

            <div className="col-span-2 text-center font-sans tabular-nums text-xl font-bold text-ink">
              {snapshot.gamesA
                ? (snapshot.gamesA[snapshot.currentSet - 1] ?? 0)
                : 0}
            </div>

            <div className="col-span-3 text-right font-sans tabular-nums text-3xl font-extrabold text-brand-strong">
              {snapshot.pointsA}
            </div>
          </div>

          {/* Team B Row */}
          <div className="grid grid-cols-12 items-center px-4 py-4 bg-card">
            <div className="col-span-7 flex items-center gap-2 pr-2">
              {snapshot.server === "B" && (
                <span className="text-sm">
                  <Icon name="court" size={20} />
                </span>
              )}
              <div className="truncate">
                <p className="font-extrabold text-ink text-sm truncate">
                  {match.entryB?.name || "Pasangan B"}
                </p>
                <span className="text-[10px] text-secondary">
                  Set menang: {snapshot.setsB}
                </span>
              </div>
            </div>

            <div className="col-span-2 text-center font-sans tabular-nums text-xl font-bold text-ink">
              {snapshot.gamesB
                ? (snapshot.gamesB[snapshot.currentSet - 1] ?? 0)
                : 0}
            </div>

            <div className="col-span-3 text-right font-sans tabular-nums text-3xl font-extrabold text-brand-strong">
              {snapshot.pointsB}
            </div>
          </div>
        </div>

        {/* Set History Bar */}
        {snapshot.gamesA && snapshot.gamesA.length > 0 && (
          <div className="p-2.5 bg-card border border-line rounded-xl flex items-center justify-between text-xs font-sans tabular-nums text-secondary">
            <span>Game per set:</span>
            <div className="flex gap-3">
              {snapshot.gamesA.map((gA, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded ${
                    idx + 1 === snapshot.currentSet
                      ? "bg-brand-soft text-brand-strong font-bold border border-brand/20"
                      : "text-secondary"
                  }`}
                >
                  Set {idx + 1}: {gA}-{snapshot.gamesB?.[idx] ?? 0}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Giant Interactive Scoring Buttons */}
        {match.status === "SCHEDULED" ? (
          <div className="py-6 space-y-3">
            <button
              onClick={handleStartMatch}
              disabled={actionLoading}
              className="w-full py-6 bg-kinetic hover:bg-kinetic-hover text-ink font-extrabold text-lg uppercase tracking-wider rounded-2xl shadow-card active:scale-95 transition cursor-pointer"
            >
              ▶ Mulai pertandingan
            </button>
            <p className="text-center text-xs text-muted">
              Tekan untuk mengaktifkan pencatatan skor dan memulai waktu
              pertandingan.
            </p>
          </div>
        ) : match.status === "IN_PROGRESS" ? (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Poin untuk A Button */}
              <button
                onClick={() => handleScorePoint("A")}
                disabled={actionLoading || !isOnline}
                className="py-12 px-4 rounded-2xl bg-kinetic hover:bg-kinetic-hover active:bg-kinetic-hover text-ink flex flex-col items-center justify-center gap-2 shadow-card active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-extrabold uppercase tracking-widest text-ink truncate w-full text-center">
                  Poin untuk A
                </span>
                <span className="text-xl font-extrabold truncate w-full text-center">
                  {match.entryA?.name || "Pasangan A"}
                </span>
                <span className="text-3xl font-extrabold mt-1">+1</span>
              </button>

              {/* Poin untuk B Button */}
              <button
                onClick={() => handleScorePoint("B")}
                disabled={actionLoading || !isOnline}
                className="py-12 px-4 rounded-2xl bg-kinetic hover:bg-kinetic-hover active:bg-kinetic-hover text-ink flex flex-col items-center justify-center gap-2 shadow-card active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                <span className="text-xs font-extrabold uppercase tracking-widest text-ink truncate w-full text-center">
                  Poin untuk B
                </span>
                <span className="text-xl font-extrabold truncate w-full text-center">
                  {match.entryB?.name || "Pasangan B"}
                </span>
                <span className="text-3xl font-extrabold mt-1">+1</span>
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleUndo}
                disabled={actionLoading}
                className="py-3 px-4 bg-surface-tint hover:bg-surface-hover text-ink font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>↩</span> Batalkan poin terakhir
              </button>

              <button
                onClick={handleFinishMatch}
                disabled={actionLoading}
                className="py-3 px-4 bg-kinetic hover:bg-kinetic-hover text-ink border border-kinetic font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Icon name="check" size={18} /> Kirim hasil
              </button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center bg-card border border-line rounded-2xl p-6 space-y-3">
            <span className="stat-icon mx-auto">
              <Icon name="trophy" size={28} />
            </span>
            <h3 className="text-base font-bold text-ink">
              {match.status === "FINISHED"
                ? "Pertandingan selesai"
                : `Status: ${match.status}`}
            </h3>
            <p className="text-xs text-secondary">
              {match.winner
                ? `Pemenang: ${match.winner.name}`
                : "Hasil telah dikirim ke pengelola turnamen."}
            </p>
            <Link
              href="/referee"
              className="inline-block mt-3 px-5 py-2.5 bg-surface-tint text-ink rounded-xl text-xs font-bold"
            >
              Kembali ke daftar pertandingan
            </Link>
          </div>
        )}

        {/* Live Event Stream / Audit Logs */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-secondary uppercase tracking-wider">
            <span>Aksi wasit terakhir</span>
            <span>Log audit</span>
          </div>

          <div className="bg-card border border-line rounded-xl p-3 max-h-32 overflow-y-auto divide-y divide-line text-xs">
            {!match.events?.length ? (
              <p className="text-muted text-center py-2 text-[11px]">
                Belum ada aksi tercatat.
              </p>
            ) : (
              match.events.map((e) => (
                <div
                  key={e.id}
                  className="py-1.5 flex justify-between items-center text-[11px]"
                >
                  <span className="text-secondary font-medium">
                    {e.eventType === "POINT_SCORED"
                      ? `Poin pasangan ${e.team}`
                      : e.eventType === "GAME_WON"
                        ? `Game dimenangkan pasangan ${e.team}`
                        : e.eventType === "SET_WON"
                          ? `Set dimenangkan pasangan ${e.team}`
                          : e.eventType === "UNDO"
                            ? `↩ Dibatalkan: ${e.reason || "poin ditarik"}`
                            : e.eventType}
                  </span>
                  <span className="text-[10px] text-muted font-sans tabular-nums">
                    #{e.sequence}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RefereeScoringPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RefereeScoringContent params={params} />
    </React.Suspense>
  );
}
