"use client";

import { Icon } from "@/components/ui/Icon";

import React, { useCallback, useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useSSE } from "@/hooks/useSSE";
import { BracketViewer } from "@/components/BracketViewer";
import {
  EntryView,
  MatchUpdatePayload,
  MatchView,
  StageView,
} from "@/types/match";

type TabKey = "live" | "brackets" | "matches" | "entries" | "categories";
type MatchFilter = "ALL" | "IN_PROGRESS" | "FINISHED" | "SCHEDULED";

interface PublicCategory {
  id: string;
  name: string;
  format: string;
  entries?: EntryView[];
  stages?: StageView[];
  ruleset?: {
    setsToWin: number;
    goldenPoint: boolean;
    superTiebreak: boolean;
    superTiebreakPts: number;
  } | null;
}

interface PublicTournament {
  id: string;
  name: string;
  slug: string;
  status: string;
  location?: string | null;
  startDate: string;
  endDate: string;
  categories?: PublicCategory[];
}

interface LiveCourt {
  courtId: string;
  courtName: string;
  priority: number;
  activeMatch: MatchView | null;
  nextMatch: MatchView | null;
}

async function fetchTournament(slug: string) {
  const tournament = await apiFetch<PublicTournament>(
    `/api/v1/tournaments/slug/${slug}/public`,
  );
  const courts = await apiFetch<LiveCourt[]>(
    `/api/v1/tournaments/${tournament.id}/courts/live`,
  );
  return { tournament, courts: courts ?? [] };
}

function TournamentPublicContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [tournament, setTournament] = useState<PublicTournament | null>(null);
  const [liveCourts, setLiveCourts] = useState<LiveCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("live");

  // Bracket Tab State
  const [selectedBracketCatId, setSelectedBracketCatId] = useState("");
  const [bracketStages, setBracketStages] = useState<StageView[]>([]);
  const [bracketsLoadedFor, setBracketsLoadedFor] = useState("");
  const [bracketError, setBracketError] = useState("");
  const [bracketRetry, setBracketRetry] = useState(0);

  // Match status filter
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("ALL");

  const applyData = useCallback(
    ({ tournament, courts }: Awaited<ReturnType<typeof fetchTournament>>) => {
      setTournament(tournament);
      setLiveCourts(courts);
      setError("");
      setSelectedBracketCatId((current) =>
        current && tournament.categories?.some((c) => c.id === current)
          ? current
          : (tournament.categories?.[0]?.id ?? ""),
      );
    },
    [],
  );

  const showError = (err: unknown) =>
    setError(err instanceof Error ? err.message : "Gagal memuat turnamen.");

  const loadData = () =>
    fetchTournament(slug)
      .then(applyData)
      .catch(showError)
      .finally(() => setLoading(false));

  useEffect(() => {
    let active = true;
    fetchTournament(slug)
      .then((data) => {
        if (active) applyData(data);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Gagal memuat turnamen.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, applyData]);

  // Load category bracket stages when bracket tab or category changes
  useEffect(() => {
    if (activeTab !== "brackets" || !selectedBracketCatId) return;
    let active = true;
    apiFetch<StageView[]>(`/api/v1/categories/${selectedBracketCatId}/brackets`)
      .then((res) => {
        if (!active) return;
        setBracketStages(res ?? []);
        setBracketError("");
      })
      .catch((err) => {
        if (!active) return;
        setBracketStages([]);
        setBracketError(
          err instanceof Error ? err.message : "Gagal memuat bagan.",
        );
      })
      .finally(() => {
        if (active) setBracketsLoadedFor(selectedBracketCatId);
      });
    return () => {
      active = false;
    };
  }, [activeTab, selectedBracketCatId, bracketRetry]);

  const bracketLoading = bracketsLoadedFor !== selectedBracketCatId;

  // Connect to SSE stream for tournament-wide real-time updates
  const { isConnected } = useSSE<unknown, MatchUpdatePayload>({
    url: tournament ? `/api/v1/stream/tournaments/${tournament.id}` : "",
    enabled: !!tournament && !error,
    onInitialState: () => {
      void loadData();
    },
    onUpdate: (payload) => {
      // Whenever a match update is broadcasted, update the matching court card
      if (payload.matchId && payload.snapshot) {
        setLiveCourts((prevCourts) =>
          prevCourts.map((c) => {
            if (c.activeMatch && c.activeMatch.id === payload.matchId) {
              return {
                ...c,
                activeMatch: {
                  ...c.activeMatch,
                  status: payload.status || c.activeMatch.status,
                  scoreSnapshot: payload.snapshot,
                },
              };
            }
            return c;
          }),
        );
      }
    },
  });

  if (error) {
    return (
      <main className="page-shell py-16">
        <div role="alert" className="panel space-y-4">
          <h1 className="text-xl font-bold">
            Turnamen belum dapat ditampilkan
          </h1>
          <p className="text-secondary">{error}</p>
          <button
            className="btn-primary"
            onClick={() => {
              setError("");
              setLoading(true);
              void loadData();
            }}
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

  if (loading || !tournament) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Menghubungkan ke pusat live score...</p>
        </div>
      </div>
    );
  }

  // Flatten and filter all matches
  const allMatches =
    tournament.categories?.flatMap(
      (cat) =>
        cat.stages?.flatMap(
          (st) =>
            st.matches?.map((m) => ({
              ...m,
              categoryName: cat.name,
            })) || [],
        ) || [],
    ) || [];

  const filteredMatches = allMatches.filter((m) => {
    if (matchFilter === "ALL") return true;
    return m.status === matchFilter;
  });

  return (
    <div className="event-public-page bg-canvas text-ink flex flex-col">
      {/* Tournament Header */}
      <header className="event-context-header border-b border-line">
        <div className="page-shell py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="stat-icon"
              aria-label="Kembali ke beranda"
            >
              <Icon name="court" size={20} />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="page-heading">{tournament.name}</h1>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    tournament.status === "IN_PROGRESS"
                      ? "status-live"
                      : tournament.status === "COMPLETED"
                        ? "bg-surface-tint text-secondary border border-line"
                        : "bg-brand-soft text-brand border border-brand-accent"
                  }`}
                >
                  {(
                    {
                      DRAFT: "Draf",
                      REGISTRATION: "Pendaftaran",
                      PUBLISHED: "Akan datang",
                      IN_PROGRESS: "Berlangsung",
                      COMPLETED: "Selesai",
                      ARCHIVED: "Arsip",
                    } as Record<string, string>
                  )[tournament.status] ?? tournament.status}
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                {tournament.location || "Venue TBA"} &bull;{" "}
                {new Date(tournament.startDate).toLocaleDateString()} -{" "}
                {new Date(tournament.endDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* SSE Connection Pill & Referee Link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-line text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-kinetic animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary">
                {isConnected ? "Skor terhubung" : "Menghubungkan"}
              </span>
            </div>

            <Link
              href="/login"
              className="px-3.5 py-1.5 bg-surface-tint hover:bg-surface-hover text-xs font-semibold text-ink rounded-xl transition"
            >
              Ruang pengelola
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hub Content */}
      <main className="flex-1 page-shell py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="app-tabs flex border-b border-line space-x-6 overflow-x-auto pb-1">
          {[
            {
              key: "live" as const,
              label: `Lapangan live (${liveCourts.filter((c) => c.activeMatch).length})`,
            },
            { key: "brackets" as const, label: "Bagan & klasemen" },
            {
              key: "matches" as const,
              label: `Jadwal pertandingan (${allMatches.length})`,
            },
            {
              key: "entries" as const,
              label: `Peserta terdaftar (${
                tournament.categories?.reduce(
                  (acc, c) => acc + (c.entries?.length || 0),
                  0,
                ) || 0
              })`,
            },
            {
              key: "categories" as const,
              label: `Kategori & format (${tournament.categories?.length || 0})`,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={`pb-3 text-sm font-extrabold tracking-wide transition border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === tab.key
                  ? "border-brand text-white"
                  : "border-transparent text-secondary hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Live Courts */}
        {activeTab === "live" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-ink tracking-tight">
                Langsung dari lapangan
              </h2>
              <span className="text-xs text-secondary">
                Skor diperbarui otomatis selama pertandingan.
              </span>
            </div>

            {!liveCourts.length ? (
              <div className="py-20 text-center text-muted text-sm bg-card border border-line rounded-2xl">
                Belum ada lapangan yang terdaftar pada turnamen ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveCourts.map((c) => {
                  const m = c.activeMatch;
                  const snap = m?.scoreSnapshot;

                  return (
                    <div
                      key={c.courtId}
                      className="bg-card border border-line rounded-2xl p-6 space-y-4 hover:border-brand-accent transition shadow-card flex flex-col justify-between"
                    >
                      <div>
                        {/* Court Name Header */}
                        <div className="flex justify-between items-center pb-3 border-b border-line">
                          <span className="font-extrabold text-ink text-sm">
                            {c.courtName}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                              m
                                ? "status-live"
                                : "bg-surface-tint text-secondary"
                            }`}
                          >
                            {m ? "BERLANGSUNG" : "KOSONG"}
                          </span>
                        </div>

                        {/* Active Match */}
                        {m ? (
                          <div className="pt-4 space-y-3">
                            <div className="text-[10px] font-mono text-secondary uppercase tracking-wider">
                              {m.stage?.category?.name || "Match"} &bull; Babak{" "}
                              {m.round}
                            </div>

                            {/* Team A */}
                            <div className="flex justify-between items-center bg-surface-tint p-3 rounded-xl border border-line">
                              <div className="flex items-center gap-2 truncate pr-2">
                                {snap?.server === "A" && (
                                  <span className="text-xs">
                                    <Icon name="court" size={20} />
                                  </span>
                                )}
                                <span className="font-bold text-ink text-sm truncate">
                                  {m.entryA?.name || "Team A"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 font-mono">
                                <span className="text-xs text-secondary font-bold">
                                  {snap?.setsA ?? 0}s
                                </span>
                                <span className="text-lg font-black text-brand">
                                  {snap?.pointsA ?? "0"}
                                </span>
                              </div>
                            </div>

                            {/* Team B */}
                            <div className="flex justify-between items-center bg-surface-tint p-3 rounded-xl border border-line">
                              <div className="flex items-center gap-2 truncate pr-2">
                                {snap?.server === "B" && (
                                  <span className="text-xs">
                                    <Icon name="court" size={20} />
                                  </span>
                                )}
                                <span className="font-bold text-ink text-sm truncate">
                                  {m.entryB?.name || "Team B"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 font-mono">
                                <span className="text-xs text-secondary font-bold">
                                  {snap?.setsB ?? 0}s
                                </span>
                                <span className="text-lg font-black text-brand">
                                  {snap?.pointsB ?? "0"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-10 text-center text-xs text-muted">
                            {c.nextMatch
                              ? `Selanjutnya: ${c.nextMatch.entryA?.name || "TBD"} vs ${
                                  c.nextMatch.entryB?.name || "TBD"
                                }`
                              : "Tidak ada pertandingan saat ini"}
                          </div>
                        )}
                      </div>

                      {/* Scoreboard Link */}
                      {m && (
                        <Link
                          href={`/match/${m.id}`}
                          className="mt-4 block w-full py-2.5 text-center bg-brand hover:bg-brand-hover text-inverse font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-card shadow-brand/10"
                        >
                          Buka Scoreboard Siaran Langsung ↗
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Brackets & Standings (BracketViewer) */}
        {activeTab === "brackets" && (
          <div className="space-y-6">
            {/* Category Select Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {tournament.categories?.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedBracketCatId(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    selectedBracketCatId === cat.id
                      ? "bg-brand text-inverse shadow-md shadow-brand/10"
                      : "bg-card border border-line text-secondary hover:text-ink"
                  }`}
                >
                  {cat.name} ({cat.format})
                </button>
              ))}
            </div>

            {bracketLoading ? (
              <div className="py-20 text-center text-muted text-sm">
                Memuat bagan pertandingan...
              </div>
            ) : bracketError ? (
              <div role="alert" className="panel space-y-3 text-sm">
                <p className="font-bold">Bagan belum dapat dimuat</p>
                <p className="text-secondary">{bracketError}</p>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setBracketsLoadedFor("");
                    setBracketRetry((value) => value + 1);
                  }}
                >
                  Coba lagi
                </button>
              </div>
            ) : (
              <BracketViewer stages={bracketStages} />
            )}
          </div>
        )}

        {/* Tab 3: Matches & Schedule */}
        {activeTab === "matches" && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "ALL" as const, label: "Semua Pertandingan" },
                { key: "IN_PROGRESS" as const, label: "Sedang berlangsung" },
                { key: "SCHEDULED" as const, label: "Terjadwal" },
                { key: "FINISHED" as const, label: "Selesai" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setMatchFilter(f.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    matchFilter === f.key
                      ? "bg-brand text-inverse"
                      : "bg-card border border-line text-secondary hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="bg-card border border-line rounded-2xl overflow-hidden shadow-card">
              <div className="divide-y divide-line">
                {filteredMatches.length === 0 ? (
                  <div className="py-16 text-center text-muted text-xs">
                    Tidak ada pertandingan untuk filter ini.
                  </div>
                ) : (
                  filteredMatches.map((m) => (
                    <div
                      key={m.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-tint transition text-sm"
                    >
                      <div>
                        <div className="font-bold text-ink">
                          {m.entryA?.name || "TBD"} vs {m.entryB?.name || "TBD"}
                        </div>
                        <div className="text-xs text-secondary mt-0.5">
                          {m.categoryName} &bull;{" "}
                          {m.court?.name || "Lapangan TBA"} &bull; Babak{" "}
                          {m.round}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                            m.status === "IN_PROGRESS"
                              ? "status-live"
                              : m.status === "FINISHED"
                                ? "bg-surface-tint text-secondary border border-line"
                                : "bg-surface-tint text-secondary"
                          }`}
                        >
                          {m.status}
                        </span>
                        <Link
                          href={`/match/${m.id}`}
                          className="px-3.5 py-1.5 bg-surface-tint hover:bg-surface-hover text-xs font-bold text-brand rounded-xl"
                        >
                          Scoreboard ↗
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Registered Pairs */}
        {activeTab === "entries" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {tournament.categories?.flatMap((cat) =>
              cat.entries?.map((e) => (
                <div
                  key={e.id}
                  className="p-4 bg-card border border-line rounded-2xl space-y-1 shadow-card"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-ink text-sm">{e.name}</span>
                    {e.seed && (
                      <span className="text-[10px] font-mono font-bold text-warning-ink bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Unggulan #{e.seed}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary">{cat.name}</p>
                </div>
              )),
            )}
          </div>
        )}

        {/* Tab 5: Categories */}
        {activeTab === "categories" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tournament.categories?.map((cat) => (
              <div
                key={cat.id}
                className="bg-card border border-line rounded-2xl p-6 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold text-ink">{cat.name}</h3>
                    <span className="text-[10px] font-mono bg-surface-tint text-secondary px-2 py-0.5 rounded mt-1 inline-block uppercase">
                      {cat.format}
                    </span>
                  </div>
                  <span className="text-xs text-secondary">
                    {cat.entries?.length || 0} pasangan terdaftar
                  </span>
                </div>

                {cat.ruleset && (
                  <div className="bg-canvas p-3.5 rounded-xl border border-line text-xs space-y-1.5 text-secondary">
                    <div className="flex justify-between">
                      <span>Sistem Set:</span>
                      <span className="text-ink font-medium">
                        Best of {cat.ruleset.setsToWin * 2 - 1} sets
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Format Deuce:</span>
                      <span className="text-brand font-bold">
                        {cat.ruleset.goldenPoint
                          ? "Golden Point (Punto de Oro)"
                          : "Advantage"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Super Tiebreak:</span>
                      <span className="text-ink font-medium">
                        {cat.ruleset.superTiebreak
                          ? `Super tiebreak ${cat.ruleset.superTiebreakPts} poin`
                          : "Set penuh"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Spectator Footer */}
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Padel Tournament OS &bull; Live Spectator &amp; Broadcast Portal
      </footer>
    </div>
  );
}

export default function TournamentPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TournamentPublicContent params={params} />
    </Suspense>
  );
}
