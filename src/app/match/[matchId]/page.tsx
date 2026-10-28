"use client";

import { Icon } from "@/components/ui/Icon";

import React, { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useSSE } from "@/hooks/useSSE";
import {
  MatchUpdatePayload,
  MatchView,
  ScoreSnapshotView,
  playerNames,
} from "@/types/match";

const EMPTY_SNAPSHOT: ScoreSnapshotView = {
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

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Terjadwal",
  WARMUP: "Pemanasan",
  IN_PROGRESS: "Berlangsung",
  FINISHED: "Selesai",
  CANCELLED: "Dibatalkan",
};

function MatchScoreboardContent({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState(false);

  // Load initial match data from REST
  useEffect(() => {
    let active = true;
    async function load() {
      setError("");
      setLoading(true);
      try {
        const data = await apiFetch<MatchView>(`/api/v1/matches/${matchId}`);
        if (active) setMatch(data);
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Gagal memuat pertandingan.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [matchId, retry]);

  // Connect to SSE stream for live real-time score events
  const { isConnected } = useSSE<MatchUpdatePayload, MatchUpdatePayload>({
    url: `/api/v1/stream/matches/${matchId}`,
    enabled: !!match && !error,
    onInitialState: (payload) => {
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              status: payload.status ?? prev.status,
              scoreSnapshot: payload.snapshot ?? prev.scoreSnapshot,
              version: payload.version ?? prev.version,
            }
          : prev,
      );
    },
    onUpdate: (payload) => {
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              status: payload.status ?? prev.status,
              scoreSnapshot: payload.snapshot ?? prev.scoreSnapshot,
              version: payload.snapshot?.version ?? prev.version,
            }
          : prev,
      );
    },
  });

  if (error) {
    return (
      <main className="page-shell py-16">
        <div role="alert" className="panel space-y-4">
          <h1 className="text-xl font-bold">
            Pertandingan belum dapat ditampilkan
          </h1>
          <p className="text-secondary">{error}</p>
          <button
            className="btn-primary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Coba lagi
          </button>
          <Link href="/" className="btn-secondary">
            Kembali ke beranda
          </Link>
        </div>
      </main>
    );
  }

  if (loading || !match) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Menghubungkan papan skor langsung…</p>
        </div>
      </div>
    );
  }

  const snapshot = match.scoreSnapshot ?? EMPTY_SNAPSHOT;

  const isGoldenPoint =
    match.stage?.category?.ruleset?.goldenPoint &&
    snapshot.pointsA === "40" &&
    snapshot.pointsB === "40";

  const category = match.stage?.category;
  const tournament = category?.tournament;

  return (
    <div className="match-public-page bg-canvas text-ink flex flex-col">
      {/* Broadcast Top Bar */}
      <header className="border-b border-line glass-header px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={tournament ? `/tournament/${tournament.slug}` : "/"}
              className="text-xs text-secondary hover:text-ink transition flex items-center gap-1 font-semibold"
            >
              ← {tournament?.name || "Beranda"}
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-tint border border-line">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-kinetic animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary">
                {isConnected ? "Langsung" : "Menghubungkan"}
              </span>
            </div>

            <span
              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                match.status === "IN_PROGRESS"
                  ? "status-live"
                  : match.status === "FINISHED"
                    ? "bg-brand-soft text-brand-strong border border-brand/20"
                    : "bg-surface-tint text-secondary"
              }`}
            >
              {STATUS_LABEL[match.status] ?? match.status}
            </span>
          </div>
        </div>
      </header>

      {/* Main Broadcast Scoreboard */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8 flex flex-col justify-center">
        {/* Match Context Banner */}
        <div className="text-center space-y-1">
          <span className="text-xs font-sans tabular-nums font-bold uppercase tracking-widest text-brand-strong bg-brand-soft px-3 py-1 rounded-full border border-brand/20">
            {match.court?.name || "Lapangan belum ditentukan"} &bull; Babak{" "}
            {match.round}
          </span>
          <p className="page-eyebrow justify-center mt-4">
            EVERY POINT MATTERS.
          </p>
          <h1 className="page-heading pt-2">
            {category?.name || "Pertandingan"}
          </h1>
        </div>

        {/* Golden Point Alert */}
        {isGoldenPoint && (
          <div className="status-live p-3 text-center rounded-lg">
            Golden point: poin berikutnya menentukan game
          </div>
        )}

        {/* Jumbo Digital Scoreboard */}
        <div className="bg-card border border-line rounded-2xl overflow-hidden shadow-card">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-canvas px-6 py-3 text-xs font-extrabold text-secondary uppercase tracking-wider border-b border-line">
            <span className="col-span-7">Pasangan</span>
            <span className="col-span-2 text-center">Set</span>
            <span className="col-span-3 text-right">Poin</span>
          </div>

          {/* Team A Score Row */}
          <div className="grid grid-cols-12 items-center px-6 py-6 border-b border-line bg-card">
            <div className="col-span-7 flex items-center gap-3 pr-2">
              {snapshot.server === "A" && (
                <span className="text-xl" title="Servis">
                  <Icon name="court" size={20} />
                </span>
              )}
              <div className="truncate">
                <h2 className="text-lg md:text-2xl font-extrabold text-ink tracking-tight truncate">
                  {match.entryA?.name || "Pasangan A"}
                </h2>
                <p className="text-xs text-secondary truncate">
                  {playerNames(match.entryA)}
                </p>
              </div>
            </div>

            <div className="col-span-2 text-center font-sans tabular-nums text-3xl font-extrabold text-ink">
              {snapshot.setsA}
            </div>

            <div className="col-span-3 text-right font-sans tabular-nums text-4xl md:text-6xl font-extrabold text-brand-strong tracking-tight transition-all">
              {snapshot.pointsA}
            </div>
          </div>

          {/* Team B Score Row */}
          <div className="grid grid-cols-12 items-center px-6 py-6 bg-card">
            <div className="col-span-7 flex items-center gap-3 pr-2">
              {snapshot.server === "B" && (
                <span className="text-xl" title="Servis">
                  <Icon name="court" size={20} />
                </span>
              )}
              <div className="truncate">
                <h2 className="text-lg md:text-2xl font-extrabold text-ink tracking-tight truncate">
                  {match.entryB?.name || "Pasangan B"}
                </h2>
                <p className="text-xs text-secondary truncate">
                  {playerNames(match.entryB)}
                </p>
              </div>
            </div>

            <div className="col-span-2 text-center font-sans tabular-nums text-3xl font-extrabold text-ink">
              {snapshot.setsB}
            </div>

            <div className="col-span-3 text-right font-sans tabular-nums text-4xl md:text-6xl font-extrabold text-brand-strong tracking-tight transition-all">
              {snapshot.pointsB}
            </div>
          </div>
        </div>

        {/* Set By Set Breakdown */}
        {snapshot.gamesA && snapshot.gamesA.length > 0 && (
          <div className="p-4 bg-card border border-line rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">
              Game per set
            </span>
            <div className="flex gap-4">
              {snapshot.gamesA.map((gA, idx) => {
                const gB = snapshot.gamesB?.[idx] ?? 0;
                const isCurrent = idx + 1 === snapshot.currentSet;
                return (
                  <div
                    key={idx}
                    className={`px-4 py-2 rounded-xl text-center font-sans tabular-nums ${
                      isCurrent
                        ? "bg-brand-soft border border-brand/20 text-brand-strong font-extrabold"
                        : "bg-canvas text-secondary"
                    }`}
                  >
                    <div className="text-[10px] text-muted uppercase font-sans">
                      Set {idx + 1}
                    </div>
                    <div className="text-lg font-bold">
                      {gA} - {gB}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Shareable Link Card */}
        <div className="p-4 bg-card border border-line rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-secondary">
          <span>Skor diperbarui otomatis tanpa memuat ulang halaman.</span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className="px-4 py-2 bg-surface-tint hover:bg-surface-hover text-ink font-bold rounded-xl transition cursor-pointer"
          >
            <span aria-live="polite">
              {copied ? "Tautan disalin" : "Salin tautan papan skor"}
            </span>
          </button>
        </div>
      </main>

      {/* Broadcast Footer */}
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Padel Tournament OS &bull; Papan skor langsung
      </footer>
    </div>
  );
}

export default function MatchScoreboardPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MatchScoreboardContent params={params} />
    </Suspense>
  );
}
