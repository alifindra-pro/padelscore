"use client";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useSSE } from "@/hooks/useSSE";
import { MatchView } from "@/types/match";
import { AppBrand } from "@/components/ui/AppBrand";
import type { ScoreState } from "../../../../packages/core/src";
type TVMatch = MatchView & {
  finishedAt?: string;
  approvalStatus?: string;
  updatedAt?: string;
  state?: ScoreState | null;
};
function Screen({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const [match, setMatch] = useState<TVMatch>();
  const [error, setError] = useState("");
  const [received, setReceived] = useState("");
  const [fullError, setFullError] = useState("");
  const requestState = useRef({ version: 0 });
  const load = useCallback(async () => {
    const version = ++requestState.current.version;
    try {
      const m = await apiFetch<TVMatch>(`/api/v2/public/matches/${matchId}`);
      if (version !== requestState.current.version) return;
      setMatch(m);
      setReceived(
        new Date().toLocaleTimeString("id-ID", {
          timeZone: m.stage?.category?.tournament?.timezone ?? "Asia/Jakarta",
          timeZoneName: "short",
        }),
      );
      setError("");
    } catch (e) {
      if (version !== requestState.current.version) return;
      if (
        [401, 403, 404].includes((e as Error & { status?: number }).status ?? 0)
      )
        setMatch(undefined);
      setError((e as Error).message);
    }
  }, [matchId]);
  useEffect(() => {
    const requests = requestState.current;
    // The callback updates state only after the network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), 5000);
    const refresh = () => void load();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requests.version++;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const { isConnected } = useSSE({
    url: `/api/v1/stream/matches/${matchId}`,
    enabled: !!match && !error,
    onInitialState: () => void load(),
    onUpdate: () => void load(),
  });
  const s = match?.scoreSnapshot;
  return (
    <main className="tv-screen">
      <header className="tv-header">
        <AppBrand />
        <div className="text-right">
          <p className="font-bold">
            {match?.stage?.category?.tournament?.name ??
              "Papan skor pertandingan"}
          </p>
          <p className="text-secondary">
            {match?.court?.name}{" "}
            {match?.stage?.category?.name && `· ${match.stage.category.name}`}
          </p>
        </div>
      </header>
      {!match ? (
        <div className="tv-empty" role="status">
          <h1>{error ? "Skor belum tersedia" : "Memuat pertandingan…"}</h1>
          <p>{error || "Menghubungkan papan skor."}</p>
          <p>
            Pengelola perlu mempublikasikan acara sebelum menampilkan skor di
            TV.
          </p>
        </div>
      ) : (
        <>
          <div className="tv-meta">
            <h1>
              Pertandingan {match.matchNumber} · Babak {match.round}
            </h1>
            <span>
              {match.status === "FINISHED" || match.status === "APPROVED"
                ? "HASIL AKHIR"
                : match.status === "IN_PROGRESS"
                  ? "SEDANG BERMAIN"
                  : match.status === "SUSPENDED"
                    ? "DITUNDA"
                    : match.status === "CANCELLED"
                      ? "DIBATALKAN"
                      : "MENUNGGU PERTANDINGAN"}
            </span>
          </div>
          {match.state?.rules.mode === "POINTS" && (
            <p className="tv-result">
              Poin langsung · total {match.state.rules.totalPoints} poin
              {match.state.decidingPoint ? " · Seri: satu poin penentu" : ""}
            </p>
          )}
          <section className="tv-board" aria-label="Skor pertandingan">
            {[match.entryA, match.entryB].map((team, i) => (
              <div
                key={i}
                className={`tv-team ${match.winnerId && team?.id === match.winnerId ? "tv-winner" : ""}`}
              >
                <div className="tv-team-name">
                  <span className="tv-team-label">
                    PASANGAN {i === 0 ? "A" : "B"}{" "}
                    {s?.server === (i === 0 ? "A" : "B") &&
                    match.status === "IN_PROGRESS"
                      ? "· SERVIS"
                      : ""}
                  </span>
                  <h2>{team?.name ?? "Menunggu pasangan"}</h2>
                  {match.winnerId && team?.id === match.winnerId && (
                    <span className="status-pill">Pemenang</span>
                  )}
                </div>
                <div className="tv-sets">
                  {(i === 0 ? s?.gamesA : s?.gamesB)?.map((games, j) => (
                    <div key={j}>
                      <span>SET {j + 1}</span>
                      <strong>
                        {match.state?.sets[j]?.kind === "MATCH_TIEBREAK"
                          ? match.state.sets[j].tiebreak[i]
                          : games}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="tv-points">
                  <span>POIN</span>
                  <strong>
                    {i === 0 ? (s?.pointsA ?? "0") : (s?.pointsB ?? "0")}
                  </strong>
                </div>
              </div>
            ))}
          </section>
          {match.finishedAt && (
            <p className="tv-result">
              Hasil diterima server:{" "}
              {new Date(match.finishedAt).toLocaleString("id-ID", {
                timeZone:
                  match.stage?.category?.tournament?.timezone ?? "Asia/Jakarta",
                timeZoneName: "short",
              })}{" "}
              {" · "}
              {match.approvalStatus === "APPROVED"
                ? "Disahkan admin"
                : "Menunggu pengesahan admin"}
            </p>
          )}
        </>
      )}
      <footer className="tv-footer">
        <p role="status">
          {error
            ? match
              ? "Koneksi terganggu. Menampilkan skor terakhir."
              : "Skor belum tersedia. Mencoba kembali setiap 5 detik."
            : isConnected
              ? "Terhubung ke pencatatan wasit"
              : "Memeriksa skor setiap 5 detik"}
          {received && ` · Diperiksa ${received}`}
        </p>
        <div className="action-row">
          <Link href={`/match/${matchId}`} className="btn-secondary">
            Detail laga
          </Link>
          {(match?.approvalStatus === "APPROVED" ||
            match?.status === "APPROVED") &&
            match?.entryA &&
            match?.entryB && (
              <a
                href={`/api/v2/matches/${matchId}/result.pdf`}
                className="btn-secondary"
              >
                PDF hasil
              </a>
            )}
          <button
            className="btn-primary"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
                setFullError("");
              } catch {
                setFullError(
                  "Layar penuh tidak tersedia. Gunakan pengaturan layar penuh browser TV.",
                );
              }
            }}
          >
            Layar penuh
          </button>
        </div>
      </footer>
      {fullError && <p role="alert">{fullError}</p>}
    </main>
  );
}
export default function Page(props: { params: Promise<{ matchId: string }> }) {
  return (
    <Suspense fallback={<main className="tv-screen">Memuat papan skor…</main>}>
      <Screen {...props} />
    </Suspense>
  );
}
