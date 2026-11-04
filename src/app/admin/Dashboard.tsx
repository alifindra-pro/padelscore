"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { TournamentList } from "@/components/TournamentList";
import { Icon } from "@/components/ui/Icon";
import { DashboardFeatures } from "@/components/ui/DashboardFeatures";
import { CourtScene } from "@/components/ui/CourtScene";
interface Tournament {
  id: string;
  name: string;
  status: string;
  location: string;
  startDate: string;
  timezone?: string;
}
export default function Dashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Tournament[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    players: 0,
    live: 0,
    registration: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Tournament[]; total: number }>(
        "/api/v1/tournaments?limit=4",
      ),
      apiFetch<{ total: number }>("/api/v1/players?limit=1"),
      apiFetch<{ total: number }>(
        "/api/v1/tournaments?limit=1&status=IN_PROGRESS",
      ),
      apiFetch<{ total: number }>(
        "/api/v1/tournaments?limit=1&status=REGISTRATION",
      ),
    ])
      .then(([t, p, live, registration]) => {
        if (!active) return;
        setEvents(t.items);
        setCounts({
          total: t.total,
          players: p.total,
          live: live.total,
          registration: registration.total,
        });
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const stats = [
    {
      label: "Total turnamen",
      value: counts.total,
      icon: "trophy",
      detail: "Seluruh acara organisasi",
      href: "/admin/tournaments",
      tone: "blue",
    },
    {
      label: "Pemain terdaftar",
      value: counts.players,
      icon: "users",
      detail: "Pemain dalam organisasi",
      href: "/admin/players",
      tone: "purple",
    },
    {
      label: "Sedang berlangsung",
      value: counts.live,
      icon: "live",
      detail: "Turnamen berstatus aktif",
      href: "/admin/tournaments?status=IN_PROGRESS",
      tone: "lime",
    },
    {
      label: "Pendaftaran dibuka",
      value: counts.registration,
      icon: "calendar",
      detail: "Siap menerima peserta",
      href: "/admin/tournaments?status=REGISTRATION",
      tone: "amber",
    },
  ];
  return (
    <div className="dashboard space-y-8">
      <div className="dashboard-heading">
        <div>
          <p className="page-eyebrow">RUANG PENGELOLA / DASHBOARD</p>
          <h1 className="page-heading">
            Halo, {user?.fullName.split(" ")[0] || "Pengelola"}.
          </h1>
          <p className="page-intro">
            Periksa turnamen aktif atau pilih menu untuk mengelola acara.
          </p>
        </div>
        <Link href="/admin/tournaments?new=1" className="btn-primary">
          <Icon name="plus" size={18} /> Buat turnamen
        </Link>
      </div>
      <section className="dashboard-hero" aria-labelledby="hero-title">
        <div className="dashboard-hero-copy">
          <span className="hero-kicker">
            <span /> PENGELOLAAN TURNAMEN
          </span>
          <h2 id="hero-title">
            Siapkan turnamen.
            <br />
            <span>Atur peserta dan jadwal.</span>
          </h2>
          <p>
            Buat acara, masukkan pasangan, lalu susun bagan pertandingan. Untuk
            Americano atau Mexicano, buka sesi sosial.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/tournaments?new=1" className="btn-kinetic">
              Buat turnamen <Icon name="arrow" size={17} />
            </Link>
            <Link href="/admin/social" className="hero-secondary">
              Buka sesi sosial <Icon name="arrow" size={17} />
            </Link>
          </div>
        </div>
        <div className="dashboard-court-scene" aria-hidden="true">
          <CourtScene className="dashboard-vector" />
          <span className="court-caption">
            PADEL SCORE by PADEL ADDICTIVE <span>TURNAMEN & PERTANDINGAN SOSIAL</span>
          </span>
        </div>
      </section>
      {error && (
        <div
          role="alert"
          className="panel flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <p className="font-bold text-danger">
              Ringkasan belum dapat dimuat
            </p>
            <p className="text-secondary text-sm">{error}</p>
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              setError("");
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
          <Link className="text-brand underline" href="/admin/organization">
            Pilih organisasi
          </Link>
        </div>
      )}
      <section
        aria-label="Statistik organisasi"
        aria-busy={loading}
        className="dashboard-stats"
      >
        {stats.map((stat) => (
          <Link
            href={stat.href}
            key={stat.label}
            className={`dashboard-stat tone-${stat.tone}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="shortcut-icon">
                <Icon name={stat.icon} />
              </span>
              <Icon name="arrow" size={17} />
            </div>
            <p className="stat-value">
              {loading || error ? "—" : stat.value.toLocaleString("id-ID")}
            </p>
            <h2>{stat.label}</h2>
            <p className="stat-detail">{stat.detail}</p>
          </Link>
        ))}
      </section>
      <DashboardFeatures />
      <section aria-labelledby="events-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="page-eyebrow">TURNAMEN ORGANISASI</p>
            <h2 id="events-title">Lanjutkan mengelola</h2>
          </div>
          <Link className="section-link" href="/admin/tournaments">
            Semua turnamen <Icon name="arrow" size={16} />
          </Link>
        </div>
        {loading ? (
          <div className="dashboard-loading panel" role="status">
            <span className="loading-orb" />
            Memuat turnamen organisasi…
          </div>
        ) : error ? (
          <div className="panel text-secondary">
            Daftar turnamen akan tampil setelah data berhasil dimuat.
          </div>
        ) : events.length ? (
          <TournamentList events={events} />
        ) : (
          <div className="panel empty-state">
            <span className="empty-court-icon">
              <Icon name="trophy" size={30} />
            </span>
            <h3 className="text-lg font-bold text-ink">Belum ada turnamen</h3>
            <p>
              Buat turnamen untuk menambahkan kategori, peserta, dan jadwal.
            </p>
            <Link href="/admin/tournaments?new=1" className="btn-primary">
              <Icon name="plus" size={17} /> Buat turnamen pertama
            </Link>
          </div>
        )}
      </section>
      <div className="dashboard-footer">
        <Icon name="court" size={17} />
        <span>Peserta dan hasil pertandingan dikelola oleh admin.</span>
        <span className="ml-auto font-bold">PADEL SCORE by PADEL ADDICTIVE</span>
      </div>
    </div>
  );
}
