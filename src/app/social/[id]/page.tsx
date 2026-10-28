"use client";
import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { apiFetch } from "@/lib/api-client";
import { SocialRound, SocialPlayer } from "../../../../packages/core/src";
interface PublicEvent {
  name: string;
  format: string;
  participants: SocialPlayer[];
  rounds: SocialRound[];
  leaderboard: {
    id: string;
    name: string;
    played: number;
    points: number;
    average: number;
  }[];
}
function PublicSocial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<PublicEvent>();
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    const load = () =>
      apiFetch<PublicEvent>(`/api/v2/public/social/${id}`)
        .then((e) => {
          setEvent(e);
          setUpdated(new Date().toLocaleTimeString("id-ID"));
          setError("");
        })
        .catch((e) => setError(e.message));
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [id]);
  return (
    <main className="page-shell py-8 sm:py-12 space-y-7">
      <Link className="section-link" href="/#events">
        ← Semua acara
      </Link>
      <header className="social-event-heading">
        <div>
          <p className="page-eyebrow">GOOD GAMES. GREAT COMPANY.</p>
          <h1 className="page-heading">
            {event?.name ?? "Pertandingan sosial"}
          </h1>
          <p className="page-intro">
            Rotasi pasangan, kumpulkan poin, dan nikmati setiap ronde.
          </p>
        </div>
        <div className="social-event-meta">
          <span className="status-pill">{event?.format || "SOCIAL PADEL"}</span>
          <p className="text-xs text-secondary">Diperbarui {updated || "—"}</p>
        </div>
      </header>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {!event && !error && (
        <p className="panel empty-state" role="status">
          Memuat pertandingan sosial…
        </p>
      )}
      {event && (
        <section className="panel social-leaderboard">
          <div className="dashboard-section-heading">
            <div>
              <p className="page-eyebrow">EVERY POINT COUNTS.</p>
              <h2 className="panel-title">Leaderboard</h2>
            </div>
            <Icon name="trophy" size={25} />
          </div>
          {event.leaderboard.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Klasemen pemain"
              tabIndex={0}
            >
              <table className="app-data-table">
                <thead>
                  <tr>
                    <th scope="col">Peringkat</th>
                    <th scope="col">Pemain</th>
                    <th scope="col">Main</th>
                    <th scope="col">Poin</th>
                    <th scope="col">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {event.leaderboard.map((player, i) => (
                    <tr key={player.id}>
                      <td>
                        <span
                          className={i === 0 ? "rank-first" : "rank-number"}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <th scope="row">{player.name}</th>
                      <td>{player.played}</td>
                      <td className="font-bold text-brand">{player.points}</td>
                      <td>{player.average.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <Icon name="users" size={32} />
              <p>Peringkat akan tampil setelah hasil ronde tersedia.</p>
            </div>
          )}
        </section>
      )}
      {event?.rounds.map((r) => (
        <section className="panel space-y-3" key={r.number}>
          <h2 className="panel-title">Ronde {r.number}</h2>
          {r.matches.map((m) => (
            <div className="social-match-row" key={m.court}>
              <p className="status-pill">
                <Icon name="court" size={15} /> Lapangan {m.court}
              </p>
              <p>
                {m.teamA
                  .map(
                    (id) => event.participants.find((p) => p.id === id)?.name,
                  )
                  .join(" / ")}{" "}
                <strong className="social-match-score">
                  {m.scoreA ?? "—"} : {m.scoreB ?? "—"}
                </strong>{" "}
                {m.teamB
                  .map(
                    (id) => event.participants.find((p) => p.id === id)?.name,
                  )
                  .join(" / ")}
              </p>
            </div>
          ))}
          {r.waiting.length > 0 && (
            <p>
              Menunggu:{" "}
              {r.waiting
                .map((id) => event.participants.find((p) => p.id === id)?.name)
                .join(", ")}
            </p>
          )}
        </section>
      ))}
    </main>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={<main className="page-shell py-16">Memuat halaman…</main>}
    >
      <PublicSocial {...props} />
    </Suspense>
  );
}
