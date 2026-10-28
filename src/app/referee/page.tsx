"use client";

import { Icon } from "@/components/ui/Icon";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { MatchView } from "@/types/match";

export default function RefereeDashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    apiFetch<MatchView[]>("/api/v1/matches/assigned")
      .then((res) => {
        if (!active) return;
        setMatches(res ?? []);
        setLoadError(null);
      })
      .catch((err) => {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Gagal memuat pertandingan.",
          );
      })
      .finally(() => {
        if (active) setLoadingMatches(false);
      });
    return () => {
      active = false;
    };
  }, [user, reloadToken]);

  const loadAssignedMatches = () => {
    setLoadingMatches(true);
    setReloadToken((value) => value + 1);
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-secondary">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="referee-home bg-canvas text-ink flex flex-col w-full mx-auto">
      {/* Mobile Top Header */}
      <header className="referee-heading flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-lg">
            <Icon name="court" size={20} />
          </div>
          <div>
            <h1 className="page-heading">Konsol wasit</h1>
            <p className="text-[11px] text-secondary truncate max-w-[180px]">
              Wasit:{" "}
              <strong className="text-brand-strong">{user.fullName}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="text-xs text-danger bg-critical/10 hover:bg-critical/20 px-3 py-1.5 rounded-lg border border-critical/20 transition cursor-pointer"
        >
          Keluar
        </button>
      </header>

      {/* Main Content */}
      <main className="space-y-6 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-secondary uppercase tracking-wider">
            Pertandingan ditugaskan ({matches.length})
          </h2>
          <button
            onClick={loadAssignedMatches}
            className="text-xs text-brand-strong hover:underline flex items-center gap-1"
          >
            <Icon name="refresh" size={16} /> Muat ulang
          </button>
        </div>

        {loadingMatches ? (
          <div className="py-20 text-center text-muted text-sm">
            Memuat pertandingan…
          </div>
        ) : loadError ? (
          <div role="alert" className="panel space-y-3 text-sm">
            <p className="font-bold">Daftar pertandingan belum dapat dimuat</p>
            <p className="text-secondary">{loadError}</p>
            <button className="btn-primary" onClick={loadAssignedMatches}>
              Coba lagi
            </button>
          </div>
        ) : !matches.length ? (
          <div className="py-20 text-center text-muted text-sm bg-card border border-line rounded-2xl p-6 space-y-3">
            <p className="text-base">
              Belum ada pertandingan yang ditugaskan kepada Anda.
            </p>
            <p className="text-xs text-secondary">
              Hubungi pengelola turnamen untuk ditugaskan sebagai wasit di
              lapangan aktif.
            </p>
            <Link
              href="/admin"
              className="inline-block mt-2 px-4 py-2 bg-surface-tint text-ink text-xs font-bold rounded-xl"
            >
              Buka halaman pengelola
            </Link>
          </div>
        ) : (
          <div className="referee-match-grid">
            {matches.map((m) => (
              <div
                key={m.id}
                className="p-5 bg-card border border-line rounded-2xl space-y-4 hover:border-brand-accent transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-sans tabular-nums text-brand-strong font-bold uppercase tracking-wider bg-brand-soft px-2 py-0.5 rounded border border-brand/20">
                      {m.court?.name || "Lapangan belum ditentukan"}
                    </span>
                    <h3 className="text-sm font-bold text-ink mt-1.5">
                      {m.stage?.category?.tournament?.name || "Turnamen"}
                    </h3>
                    <p className="text-[11px] text-secondary">
                      {m.stage?.category?.name || "Kategori"} &bull; Babak{" "}
                      {m.round}
                    </p>
                  </div>

                  <span
                    className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      m.status === "IN_PROGRESS"
                        ? "status-live"
                        : m.status === "FINISHED"
                          ? "bg-brand-soft text-brand-strong border border-brand/20"
                          : "bg-surface-tint text-secondary"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                {/* Team Lineup */}
                <div className="p-3 bg-canvas border border-line rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-ink truncate">
                      {m.entryA?.name || "Pasangan A"}
                    </span>
                    {m.scoreSnapshot && (
                      <span className="text-brand-strong font-sans tabular-nums text-sm ml-2">
                        {m.scoreSnapshot.setsA} ({m.scoreSnapshot.pointsA})
                      </span>
                    )}
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-ink truncate">
                      {m.entryB?.name || "Pasangan B"}
                    </span>
                    {m.scoreSnapshot && (
                      <span className="text-brand-strong font-sans tabular-nums text-sm ml-2">
                        {m.scoreSnapshot.setsB} ({m.scoreSnapshot.pointsB})
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href={
                    m.engineVersion === 2 || m.status === "SCHEDULED"
                      ? `/referee/v2/${m.id}`
                      : `/referee/scoring/${m.id}`
                  }
                  className="block w-full py-3 text-center bg-brand hover:bg-brand-hover text-inverse font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-card"
                >
                  {m.status === "IN_PROGRESS"
                    ? "Lanjutkan pencatatan skor"
                    : "Buka papan skor wasit →"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Mobile Footer */}
      <footer className="p-4 bg-card border-t border-line text-center text-[10px] text-muted">
        Padel Tournament OS &bull; Konsol wasit
      </footer>
    </div>
  );
}
