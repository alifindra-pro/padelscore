"use client";
import {
  formatLabel,
  matchStatusLabel,
  tournamentStatusLabel,
} from "@/lib/labels";

/** "20 November 2026" for a one-day event, otherwise the full range. */
function eventDates(start: string, end: string) {
  const day = (value: string) =>
    new Date(value).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  return day(start) === day(end)
    ? day(start)
    : `${day(start)} sampai ${day(end)}`;
}

import { Sponsors } from "@/components/tournament/Sponsors";
import { Icon } from "@/components/ui/Icon";

import React, { useCallback, useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { entryStatusLabel, isMainEntry } from "@/lib/entry-status";
import {
  TournamentPoster,
  TournamentTheme,
} from "@/components/tournament/TournamentHeader";
import { RegistrationForm } from "@/components/tournament/RegistrationForm";
import { DisputeForm } from "@/components/tournament/DisputeForm";
import { EventHero } from "@/components/tournament/EventHero";
import { categoryStyle } from "@/lib/category-color";
import { RulesExplainer } from "@/components/tournament/RulesExplainer";
import type { RulesInfo } from "@/lib/rules-summary";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { apiFetch } from "@/lib/api-client";
import { useSSE } from "@/hooks/useSSE";
import { BracketViewer } from "@/components/BracketViewer";
import {
  EntryView,
  MatchUpdatePayload,
  MatchView,
  StageView,
} from "@/types/match";

type TabKey =
  | "live"
  | "brackets"
  | "groups"
  | "matches"
  | "entries"
  | "categories"
  | "disputes";
type MatchFilter = "ALL" | "IN_PROGRESS" | "FINISHED" | "SCHEDULED";

interface PublicCategory {
  /** Plain-language rule lines prepared by the server, "Label: text". */
  rulesSummary?: string[];
  /** Plain numbers for the rules diagram. */
  rulesInfo?: RulesInfo | null;
  maxEntries?: number | null;
  /** Set once the organizer schedules venue check-in. */
  checkInOpensAt?: string | null;
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
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [objection, setObjection] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  // Load the selected category's stages; the groups tab can be the opening tab.
  useEffect(() => {
    if (!selectedBracketCatId) return;
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
  }, [selectedBracketCatId, bracketRetry]);

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
              categoryId: cat.id,
              categoryName: cat.name,
            })) || [],
        ) || [],
    ) || [];

  const filteredMatches = allMatches.filter(
    (m) =>
      (matchFilter === "ALL" || m.status === matchFilter) &&
      (categoryFilter === "ALL" || m.categoryId === categoryFilter),
  );
  // Categories with identical rules share one card instead of repeating it.
  const ruleGroups = (tournament.categories ?? []).reduce<
    {
      key: string;
      names: string[];
      lines: string[];
      info: RulesInfo | null;
    }[]
  >((acc, cat) => {
    const lines = cat.rulesSummary ?? [];
    if (!lines.length) return acc;
    const key = lines.join("|");
    const same = acc.find((g) => g.key === key);
    if (same) same.names.push(cat.name);
    else
      acc.push({ key, names: [cat.name], lines, info: cat.rulesInfo ?? null });
    return acc;
  }, []);
  // One event, several categories ("nomor"): each shows its pairs and its own start.
  const nomor = (tournament.categories ?? []).map((cat) => {
    const first = cat.stages
      ?.flatMap((st) => st.matches ?? [])
      .map((m) => m.scheduledAt)
      .filter((d): d is string => !!d)
      .sort()[0];
    return {
      id: cat.id,
      name: cat.name,
      pairs: cat.entries?.filter(isMainEntry).length ?? 0,
      start: first
        ? new Date(first).toLocaleTimeString("id-ID", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    };
  });

  const stageTypes = new Set(
    (tournament.categories ?? []).flatMap(
      (c) => c.stages?.map((st) => st.type) ?? [],
    ),
  );
  // Only tabs with something to show; before the draw that is just the pairs.
  const visibleTabs: { key: TabKey; label: string }[] = [
    ...(allMatches.length
      ? [
          {
            key: "live" as const,
            label: `Lapangan live (${liveCourts.filter((c) => c.activeMatch).length})`,
          },
        ]
      : []),
    ...(stageTypes.has("GROUP")
      ? [{ key: "groups" as const, label: "Klasemen grup" }]
      : []),
    ...(stageTypes.has("SINGLE_ELIMINATION") ||
    stageTypes.has("DOUBLE_ELIMINATION")
      ? [{ key: "brackets" as const, label: "Bagan gugur" }]
      : []),
    ...(allMatches.length
      ? [
          {
            key: "matches" as const,
            label: `Jadwal pertandingan (${allMatches.length})`,
          },
        ]
      : []),
    ...(allMatches.some((m) => ["FINISHED", "APPROVED"].includes(m.status))
      ? [{ key: "disputes" as const, label: "Sanggah hasil" }]
      : []),
  ];
  const currentTab: TabKey | null = visibleTabs.some((t) => t.key === activeTab)
    ? activeTab
    : (visibleTabs.find((t) =>
        tournament.status === "IN_PROGRESS"
          ? t.key === "live"
          : t.key !== "live",
      )?.key ??
      visibleTabs[0]?.key ??
      null);
  return (
    <TournamentTheme id={tournament.id}>
      {/* Tournament Header */}
      <EventHero
        id={tournament.id}
        name={tournament.name}
        status={{
          label:
            tournament.status === "PUBLISHED"
              ? "Akan datang"
              : tournamentStatusLabel(tournament.status),
          live: tournament.status === "IN_PROGRESS",
        }}
        dateText={eventDates(tournament.startDate, tournament.endDate)}
        location={tournament.location || "Lokasi belum diumumkan"}
        categories={nomor}
        actions={
          <>
            <a className="event-hero-primary" href="#peserta">
              Lihat peserta
            </a>
            {ruleGroups.length > 0 && (
              <a className="event-hero-secondary" href="#aturan">
                Aturan main
              </a>
            )}
            {tournament.status === "REGISTRATION" && (
              <a className="event-hero-secondary" href="#registration">
                Daftar pasangan
              </a>
            )}
          </>
        }
      />
      {tournament.status === "IN_PROGRESS" && (
        <p className="page-shell event-connection" role="status">
          <span className={isConnected ? "is-on" : ""} aria-hidden="true" />
          {isConnected
            ? "Skor diperbarui langsung"
            : "Menghubungkan ke skor langsung…"}
        </p>
      )}

      {/* Main Hub Content */}
      <main className="flex-1 page-shell py-8 space-y-10">
        {/* Navigation Tabs */}
        {visibleTabs.length > 0 && (
          <div className="app-tabs flex border-b border-line space-x-6 overflow-x-auto pb-1">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={currentTab === tab.key}
                className={`pb-3 text-sm font-extrabold tracking-wide transition border-b-2 whitespace-nowrap cursor-pointer ${
                  currentTab === tab.key
                    ? "border-brand text-white"
                    : "border-transparent text-secondary hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {currentTab === "disputes" && (
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold">Sanggah hasil pertandingan</h2>
            <p className="text-secondary">
              Pilih laga yang sudah selesai, lalu ajukan sanggahan dari halaman
              detail. Admin akan meninjau alasan Anda.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {allMatches
                .filter(
                  (m) =>
                    ["FINISHED", "APPROVED"].includes(m.status) &&
                    m.entryA &&
                    m.entryB,
                )
                .map((m) => (
                  <Link
                    className="dispute-match-link"
                    key={m.id}
                    href={`/match/${m.id}#dispute-title`}
                  >
                    <span>
                      Laga {m.matchNumber} · {m.categoryName}
                    </span>
                    <strong>
                      {m.entryA?.name} vs {m.entryB?.name}
                    </strong>
                    <span>Lihat hasil & ajukan sanggahan →</span>
                  </Link>
                ))}
            </div>
            {!allMatches.some(
              (m) =>
                ["FINISHED", "APPROVED"].includes(m.status) &&
                m.entryA &&
                m.entryB,
            ) && <p>Belum ada hasil pertandingan yang dapat disanggah.</p>}
          </section>
        )}
        {/* Tab 1: Live Courts */}
        {currentTab === "live" && (
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
        {["brackets", "groups"].includes(currentTab) && (
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
                  {cat.name} ({formatLabel(cat.format)})
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
              <BracketViewer
                stages={bracketStages}
                view={currentTab === "groups" ? "GROUP" : "KNOCKOUT"}
              />
            )}
          </div>
        )}

        {/* Tab 3: Matches & Schedule */}
        {currentTab === "matches" && (
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
            {nomor.length > 1 && (
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Pilih nomor"
              >
                {[{ id: "ALL", name: "Semua nomor" }, ...nomor].map((n) => (
                  <button
                    key={n.id}
                    aria-pressed={categoryFilter === n.id}
                    onClick={() => setCategoryFilter(n.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      categoryFilter === n.id
                        ? "bg-ink text-inverse"
                        : "bg-card border border-line text-secondary hover:text-ink"
                    }`}
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            )}

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
                          <span
                            className="cat-chip"
                            style={categoryStyle(
                              m.categoryName,
                              (tournament.categories ?? []).findIndex(
                                (c) => c.id === m.categoryId,
                              ),
                            )}
                          >
                            {m.categoryName}
                          </span>{" "}
                          &bull; {m.court?.name || "Lapangan TBA"} &bull; Babak{" "}
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
                          {matchStatusLabel(m.status)}
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
        <TournamentPoster id={tournament.id} name={tournament.name} />
        <Sponsors tournamentId={tournament.id} />
        {ruleGroups.length > 0 && (
          <section
            id="aturan"
            className="event-section"
            aria-labelledby="rules-title"
          >
            <h2 id="rules-title">Aturan main</h2>
            <div className="rules-grid">
              {ruleGroups.map((group) => (
                <article key={group.key} className="rules-card">
                  <h3>
                    {group.names.length > 1 ? "Berlaku untuk " : ""}
                    {group.names.map((n) => (
                      <span
                        key={n}
                        className="cat-chip"
                        style={categoryStyle(
                          n,
                          (tournament.categories ?? []).findIndex(
                            (c) => c.name === n,
                          ),
                        )}
                      >
                        {n}
                      </span>
                    ))}
                  </h3>
                  <dl>
                    {group.lines.map((line) => {
                      const [term, ...rest] = line.split(": ");
                      return (
                        <div key={line}>
                          <dt>{term}</dt>
                          <dd>{rest.join(": ")}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  {group.info && <RulesExplainer info={group.info} />}
                </article>
              ))}
            </div>
          </section>
        )}
        <section
          id="peserta"
          className="event-section"
          aria-labelledby="pairs-title"
        >
          <h2 id="pairs-title">Peserta</h2>

          <div className="space-y-8">
            {tournament.categories?.map((cat, catIndex) => {
              const list = (cat.entries ?? []).filter(
                (e) => e.status !== "WITHDRAWN",
              );
              // Objections to a pair are taken until this category is drawn.
              const open = !cat.stages?.length && list.length > 0;
              const objected = list.find((e) => e.id === objection?.id);
              return (
                <section
                  key={cat.id}
                  className="entry-board"
                  style={categoryStyle(cat.name, catIndex)}
                >
                  <header>
                    <h3>{cat.name}</h3>
                    <span className="entry-count">
                      <strong>{list.filter(isMainEntry).length}</strong>
                      {cat.maxEntries ? ` / ${cat.maxEntries}` : ""} pasangan
                    </span>
                  </header>
                  {open && (
                    <p className="entry-note">
                      Ada pasangan yang menurut Anda tidak memenuhi syarat?
                      Tekan <strong>Sanggah</strong> di baris pasangan itu.
                      Sanggahan dibuka sampai undian {cat.name}.
                    </p>
                  )}
                  {objected && (
                    <DisputeForm
                      key={objected.id}
                      tournamentId={tournament.id}
                      entry={{ id: objected.id, name: objected.name }}
                      onClose={() => setObjection(null)}
                    />
                  )}
                  {list.length ? (
                    <ol>
                      {list.map((e, i) => (
                        <li key={e.id}>
                          <span className="entry-number">{i + 1}</span>
                          <span className="entry-photos" aria-hidden="true">
                            {e.players?.map(
                              ({ player }) =>
                                player && (
                                  <PlayerPhoto
                                    key={player.id}
                                    id={player.id}
                                    name={player.fullName}
                                  />
                                ),
                            )}
                          </span>
                          <span className="entry-name">{e.name}</span>
                          {cat.checkInOpensAt && isMainEntry(e) && (
                            <CheckInTag players={e.players ?? []} />
                          )}
                          {e.seed ? (
                            <span className="entry-tag">Unggulan {e.seed}</span>
                          ) : !isMainEntry(e) ? (
                            <span className="entry-tag">
                              {entryStatusLabel(e, cat.entries ?? [])}
                            </span>
                          ) : null}
                          {open && e.status !== "DISQUALIFIED" && (
                            <button
                              className="entry-object"
                              aria-label={`Sanggah ${e.name}`}
                              aria-pressed={objection?.id === e.id}
                              onClick={() =>
                                setObjection({ id: e.id, name: e.name })
                              }
                            >
                              Sanggah
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="entry-empty">
                      {tournament.status === "REGISTRATION" ? (
                        <>
                          Belum ada pasangan terdaftar.{" "}
                          <a href="#registration">Daftarkan pasangan Anda</a>
                        </>
                      ) : (
                        "Daftar pasangan diumumkan menyusul."
                      )}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </section>
        {tournament.status === "REGISTRATION" && (
          <RegistrationForm
            categories={tournament.categories ?? []}
            onRegistered={() => {
              void fetchTournament(slug).then((data) =>
                setTournament(data.tournament),
              );
            }}
          />
        )}
      </main>

      {/* Spectator Footer */}
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Berpadel Score for Padel Addictive &bull; Skor dan hasil pertandingan
      </footer>
    </TournamentTheme>
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

/** Venue attendance of one pair, shown once the organizer schedules check-in. */
function CheckInTag({
  players,
}: {
  players: { checkedInAt?: string | null }[];
}) {
  const n = players.filter((p) => p.checkedInAt).length;
  const all = n > 0 && n === players.length;
  return (
    <span className={all ? "entry-checkin is-in" : "entry-checkin"}>
      {all ? "Hadir" : n ? `Hadir ${n}/${players.length}` : "Belum check-in"}
    </span>
  );
}
