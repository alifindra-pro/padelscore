"use client";

import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PlayerCareerStats } from "@/services/player-stats.service";

interface PlayerRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  rating: number | null;
  _count?: { entryPlayers?: number };
}

interface LeaderboardRow {
  id: string;
  fullName: string;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
}

type View = "directory" | "leaderboard";

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function AdminPlayersPage() {
  const [activeView, setActiveView] = useState<View>("directory");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");

  // Stats Modal state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerCareerStats | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const statsRequest = useRef<string | null>(null);

  // Form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const requestKey = `${activeView}|${activeView === "directory" ? search : ""}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let active = true;
    // Debounce typing in the search box; view switches and retries load at once
    const delay = activeView === "directory" && search ? 250 : 0;
    const timer = setTimeout(() => {
      const request =
        activeView === "directory"
          ? apiFetch<{ items: PlayerRow[]; total: number }>("/api/v1/players", {
              params: { search: search || undefined, limit: 50 },
            }).then((res) => {
              if (!active) return;
              setPlayers(res.items ?? []);
              setTotal(res.total ?? 0);
            })
          : apiFetch<LeaderboardRow[]>(
              "/api/v1/players/leaderboard?limit=25",
            ).then((res) => {
              if (active) setLeaderboard(res ?? []);
            });
      request
        .then(() => {
          if (active) setError("");
        })
        .catch((err) => {
          if (active) setError(errorText(err, "Gagal memuat data pemain."));
        })
        .finally(() => {
          if (active) setLoadedKey(requestKey);
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeView, search, requestKey]);

  const reload = () => setReloadToken((value) => value + 1);

  const closePlayerStats = () => {
    statsRequest.current = null;
    setSelectedPlayerId(null);
    setPlayerStats(null);
    setStatsError("");
  };

  const openPlayerStats = async (playerId: string) => {
    statsRequest.current = playerId;
    setSelectedPlayerId(playerId);
    setPlayerStats(null);
    setStatsError("");
    setStatsLoading(true);
    try {
      const res = await apiFetch<PlayerCareerStats>(
        `/api/v1/players/${playerId}/stats`,
      );
      if (statsRequest.current === playerId) setPlayerStats(res);
    } catch (err) {
      if (statsRequest.current === playerId)
        setStatsError(errorText(err, "Gagal memuat statistik pemain."));
    } finally {
      if (statsRequest.current === playerId) setStatsLoading(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setFormError("");
      await apiFetch("/api/v1/players", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          rating: rating ? Number(rating) : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      setShowModal(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setRating("");
      setNotes("");
      reload();
    } catch (err) {
      setFormError(errorText(err, "Gagal menambahkan pemain."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="page-eyebrow">PEMAIN HEBAT. KOMUNITAS KUAT.</p>
          <h1 className="page-heading">Direktori Pemain & Statistik</h1>
          <p className="page-intro">
            Manajemen atlet padel terdaftar ({total} atlet).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div
            className="choice-group"
            role="group"
            aria-label="Tampilan pemain"
          >
            <button
              onClick={() => setActiveView("directory")}
              className="choice-button"
              aria-pressed={activeView === "directory"}
            >
              Semua Atlet
            </button>
            <button
              onClick={() => setActiveView("leaderboard")}
              className="choice-button"
              aria-pressed={activeView === "leaderboard"}
            >
              Peringkat
            </button>
          </div>

          {activeView === "directory" && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari atlet..."
              aria-label="Cari pemain"
              className="px-3 py-2 bg-card border border-line rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:ring-1 focus:ring-brand"
            />
          )}

          <button
            onClick={() => {
              setFormError("");
              setShowModal(true);
            }}
            className="btn-primary"
          >
            + Tambah Atlet
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="panel space-y-3">
          <p className="text-danger">{error}</p>
          <button className="btn-secondary" onClick={reload}>
            Coba lagi
          </button>
        </div>
      )}

      {/* Directory Table View */}
      {activeView === "directory" ? (
        <div className="bg-card border border-line rounded-2xl overflow-x-auto shadow-card">
          {loading ? (
            <div className="py-16 text-center text-muted text-sm">
              Memuat daftar pemain...
            </div>
          ) : !players.length ? (
            <div className="py-16 text-center text-muted text-sm">
              Tidak ada atlet ditemukan.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line text-[11px] font-bold text-secondary uppercase tracking-wider bg-surface-tint">
                  <th className="py-3.5 px-6">Nama Atlet</th>
                  <th className="py-3.5 px-6">Kontak</th>
                  <th className="py-3.5 px-6">Rating Skill</th>
                  <th className="py-3.5 px-6">Total Entry</th>
                  <th className="py-3.5 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-tint transition">
                    <td className="py-4 px-6 font-bold text-ink">
                      {p.fullName}
                    </td>
                    <td className="py-4 px-6 text-xs text-secondary">
                      <div>{p.email || "—"}</div>
                      <div className="text-muted">{p.phone || ""}</div>
                    </td>
                    <td className="py-4 px-6">
                      {p.rating ? (
                        <span className="font-sans tabular-nums tabular-nums text-xs font-bold text-brand bg-brand-soft px-2 py-0.5 rounded border border-brand-accent">
                          {p.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-xs text-secondary">
                      {p._count?.entryPlayers || 0} turnamen
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => openPlayerStats(p.id)}
                        className="px-3 py-1.5 bg-surface-tint hover:bg-surface-hover text-brand text-xs font-bold rounded-lg cursor-pointer transition border border-brand-accent"
                      >
                        Lihat statistik & riwayat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Leaderboard Table View */
        <div className="bg-card border border-line rounded-2xl overflow-x-auto shadow-card">
          {loading ? (
            <div className="py-16 text-center text-muted text-sm">
              Memuat leaderboard...
            </div>
          ) : !leaderboard.length ? (
            <div className="py-16 text-center text-muted text-sm">
              Belum ada data pertandingan.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line text-[11px] font-bold text-secondary uppercase tracking-wider bg-surface-tint">
                  <th className="py-3.5 px-6">Peringkat</th>
                  <th className="py-3.5 px-6">Nama Atlet</th>
                  <th className="py-3.5 px-6 text-center">Menang</th>
                  <th className="py-3.5 px-6 text-center">Kalah</th>
                  <th className="py-3.5 px-6 text-center">Win Rate</th>
                  <th className="py-3.5 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {leaderboard.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-tint transition"
                  >
                    <td className="py-4 px-6 font-sans tabular-nums font-bold text-ink">
                      {idx + 1}
                    </td>
                    <td className="py-4 px-6 font-bold text-ink">
                      {item.fullName}
                    </td>
                    <td className="py-4 px-6 text-center font-bold text-brand">
                      {item.matchesWon}
                    </td>
                    <td className="py-4 px-6 text-center text-secondary">
                      {item.matchesLost}
                    </td>
                    <td className="py-4 px-6 text-center font-sans tabular-nums font-bold text-ink">
                      {item.winRate}%
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => openPlayerStats(item.id)}
                        className="px-3 py-1.5 bg-surface-tint hover:bg-surface-hover text-brand text-xs font-bold rounded-lg cursor-pointer transition border border-brand-accent"
                      >
                        Lihat statistik
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Player Career Stats & Match History Modal */}
      {selectedPlayerId && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-line rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-overlay max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-line pb-4">
              <div>
                <h3 className="text-xl font-bold text-ink">
                  {playerStats?.player?.fullName || "Statistik Atlet"}
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Profil Karir & Rekam Jejak Pertandingan Turnamen
                </p>
              </div>
              <button
                onClick={closePlayerStats}
                className="text-secondary hover:text-ink text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {statsLoading ? (
              <div className="py-20 text-center text-muted text-sm">
                Memuat statistik atlet...
              </div>
            ) : statsError ? (
              <div role="alert" className="py-10 text-center text-sm space-y-3">
                <p className="text-danger">{statsError}</p>
                <button
                  className="btn-secondary"
                  onClick={() => void openPlayerStats(selectedPlayerId)}
                >
                  Coba lagi
                </button>
              </div>
            ) : !playerStats ? (
              <div className="py-10 text-center text-muted text-sm">
                Data tidak ditemukan.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-surface-tint border border-line rounded-2xl text-center">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                      Win Rate
                    </span>
                    <span className="text-2xl font-bold text-brand mt-1 block">
                      {playerStats.overview.winRate}%
                    </span>
                  </div>

                  <div className="p-4 bg-surface-tint border border-line rounded-2xl text-center">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                      M - K (Match)
                    </span>
                    <span className="text-2xl font-bold text-ink mt-1 block">
                      {playerStats.overview.matchesWon} -{" "}
                      {playerStats.overview.matchesLost}
                    </span>
                  </div>

                  <div className="p-4 bg-surface-tint border border-line rounded-2xl text-center">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                      Selisih Set
                    </span>
                    <span className="text-2xl font-bold text-ink mt-1 block">
                      {playerStats.overview.setDifferential > 0
                        ? `+${playerStats.overview.setDifferential}`
                        : playerStats.overview.setDifferential}
                    </span>
                  </div>

                  <div className="p-4 bg-surface-tint border border-line rounded-2xl text-center">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                      Gelar Juara
                    </span>
                    <span className="text-2xl font-bold text-ink mt-1 block">
                      {playerStats.overview.titlesCount}
                    </span>
                  </div>
                </div>

                {/* Match History Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">
                    Riwayat Pertandingan Terakhir
                  </h4>

                  {playerStats.matchHistory.length === 0 ? (
                    <div className="py-8 text-center text-muted text-xs bg-surface-tint rounded-xl border border-line">
                      Belum ada catatan pertandingan resmi yang selesai.
                    </div>
                  ) : (
                    <div className="border border-line rounded-2xl overflow-x-auto bg-surface-tint">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-line text-[10px] text-secondary font-bold uppercase tracking-wider">
                            <th className="p-3">Hasil</th>
                            <th className="p-3">Turnamen & Kategori</th>
                            <th className="p-3">Lawan</th>
                            <th className="p-3 text-right">Skor Set</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {playerStats.matchHistory.map((m) => (
                            <tr
                              key={m.matchId}
                              className="hover:bg-surface-tint"
                            >
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    m.result === "WON"
                                      ? "bg-brand-soft text-brand border border-brand-accent"
                                      : "bg-rose-500/20 text-danger border border-rose-500/30"
                                  }`}
                                >
                                  {m.result === "WON" ? "MENANG" : "KALAH"}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-ink">
                                  {m.tournamentName}
                                </div>
                                <div className="text-[10px] text-secondary">
                                  {m.categoryName} • R{m.round}
                                </div>
                              </td>
                              <td className="p-3 text-secondary font-medium">
                                vs {m.opponentName}
                              </td>
                              <td className="p-3 text-right font-sans tabular-nums font-bold text-ink">
                                {m.setsScore}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-2xl max-w-md w-full p-6 space-y-4 shadow-overlay">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-ink">
                Tambah Atlet Baru
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-secondary"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlayer} className="space-y-4">
              {formError && (
                <p role="alert" className="text-danger text-sm">
                  {formError}
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="contoh: Fernando Belasteguin"
                  className="w-full px-3 py-2 bg-surface-tint border border-line rounded-xl text-ink text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="bela@padel.com"
                  className="w-full px-3 py-2 bg-surface-tint border border-line rounded-xl text-ink text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  Nomor Telepon (Opsional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+62 812..."
                  className="w-full px-3 py-2 bg-surface-tint border border-line rounded-xl text-ink text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  Skill Rating (1.0 - 7.0)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="7"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  placeholder="contoh: 5.5"
                  className="w-full px-3 py-2 bg-surface-tint border border-line rounded-xl text-ink text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? "Menyimpan..." : "Simpan Atlet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
