"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import styles from "./landing.module.css";

interface Tournament {
  id: string;
  name: string;
  slug: string;
  location: string;
  status: string;
  startDate: string;
  timezone: string;
}
interface Social {
  id: string;
  name: string;
  format: string;
}
const filters = [
  { value: "all", label: "Semua acara" },
  { value: "live", label: "Sedang berlangsung" },
  { value: "upcoming", label: "Akan datang" },
  { value: "social", label: "Social padel" },
] as const;
const statuses: Record<string, string> = {
  PUBLISHED: "Akan datang",
  IN_PROGRESS: "Sedang berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Arsip",
};
function formatDate(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone || "Asia/Jakarta",
    }).format(new Date(value));
  } catch {
    return "Jadwal menyusul";
  }
}
export function EventExplorer() {
  const [events, setEvents] = useState<Tournament[]>([]);
  const [social, setSocial] = useState<Social[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    Promise.allSettled([
      apiFetch<Tournament[]>("/api/v2/public/tournaments", {
        signal: controller.signal,
      }),
      apiFetch<Social[]>("/api/v2/public/social", {
        signal: controller.signal,
      }),
    ]).then(([tournaments, sessions]) => {
      if (!active) return;
      const failures: string[] = [];
      if (tournaments.status === "fulfilled") setEvents(tournaments.value);
      else failures.push("turnamen");
      if (sessions.status === "fulfilled") setSocial(sessions.value);
      else failures.push("social padel");
      setErrors(failures);
      setLoading(false);
      clearTimeout(timeout);
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  const search = query.trim().toLowerCase();
  const visibleEvents = events.filter(
    (event) =>
      filter !== "social" &&
      (filter !== "live" || event.status === "IN_PROGRESS") &&
      (filter !== "upcoming" || event.status === "PUBLISHED") &&
      `${event.name} ${event.location ?? ""}`.toLowerCase().includes(search),
  );
  const visibleSocial = social.filter(
    (session) =>
      ["all", "social"].includes(filter) &&
      session.name.toLowerCase().includes(search),
  );
  const count = visibleEvents.length + visibleSocial.length;
  const filtered = search || filter !== "all";
  return (
    <div>
      <div className={styles.eventToolbar}>
        <div
          className={styles.filterGroup}
          role="group"
          aria-label="Filter acara"
        >
          {filters.map((item) => (
            <button
              key={item.value}
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.value === "live" && <span className={styles.filterDot} />}
              {item.label}
            </button>
          ))}
        </div>
        <label className={styles.searchField}>
          <Icon name="search" size={18} />
          <span className={styles.srOnly}>Cari acara atau lokasi</span>
          <input
            type="search"
            placeholder="Cari acara atau lokasi..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {errors.length > 0 && (
        <div role="alert" className={styles.errorNotice}>
          <span>
            Data {errors.join(" dan ")} belum dapat dimuat. Coba lagi beberapa
            saat.
          </span>
          <button
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setAttempt((current) => current + 1);
            }}
          >
            {loading ? "Memuat…" : "Coba lagi"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
      {loading ? (
        <div className={styles.loadingEvents} role="status">
          <span className={styles.loadingBar} />
          Memuat acara dari lapangan…
        </div>
      ) : count > 0 ? (
        <>
          <p className={styles.resultCount} role="status">
            {count} acara ditemukan
          </p>
          <div className={styles.eventGrid}>
            {visibleEvents.map((event) => (
              <Link
                href={`/tournament/${encodeURIComponent(event.slug)}`}
                className={styles.eventCard}
                key={event.id}
              >
                <div className={styles.eventArtwork}>
                  <Icon name="trophy" size={40} />
                  <span>
                    PLAY.
                    <br />
                    COMPETE.
                    <br />
                    <b>CONNECT.</b>
                  </span>
                  <span className={styles.eventCategory}>TOURNAMENT</span>
                </div>
                <div className={styles.eventBody}>
                  <span
                    className={
                      event.status === "IN_PROGRESS"
                        ? styles.liveBadge
                        : styles.eventBadge
                    }
                  >
                    {event.status === "IN_PROGRESS" && (
                      <span className={styles.liveDot} />
                    )}
                    {statuses[event.status] || "Turnamen"}
                  </span>
                  <h3>{event.name}</h3>
                  <p>
                    <Icon name="pin" size={15} />
                    {event.location || "Lokasi menyusul"}
                  </p>
                  <p>
                    <Icon name="calendar" size={15} />
                    {formatDate(event.startDate, event.timezone)}
                  </p>
                  <span className={styles.eventLink}>
                    Lihat pertandingan <Icon name="arrow" size={18} />
                  </span>
                </div>
              </Link>
            ))}
            {visibleSocial.map((session) => (
              <Link
                href={`/social/${encodeURIComponent(session.id)}`}
                className={`${styles.eventCard} ${styles.socialCard}`}
                key={session.id}
              >
                <div className={styles.eventArtwork}>
                  <Icon name="users" size={40} />
                  <span>
                    GOOD GAMES.
                    <br />
                    <b>
                      GREAT
                      <br />
                      COMPANY.
                    </b>
                  </span>
                  <span className={styles.eventCategory}>SOCIAL PADEL</span>
                </div>
                <div className={styles.eventBody}>
                  <span className={styles.eventBadge}>
                    Social · {session.format}
                  </span>
                  <h3>{session.name}</h3>
                  <p>
                    Rotasi pasangan, hasil ronde, dan leaderboard individual.
                  </p>
                  <span className={styles.eventLink}>
                    Lihat acara <Icon name="arrow" size={18} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.emptyEvents} role="status">
          <div className={styles.emptyCourt} aria-hidden="true">
            <Icon name={filtered ? "search" : "court"} size={40} />
          </div>
          <div>
            <p className={styles.eyebrow}>
              {filtered ? "COBA PENCARIAN LAIN" : "SEE YOU ON COURT"}
            </p>
            <h3>
              {filtered
                ? "Belum ada acara yang cocok."
                : errors.length
                  ? "Lapangan akan segera terhubung."
                  : "Permainan berikutnya segera hadir."}
            </h3>
            <p>
              {filtered
                ? "Coba nama, lokasi, atau kategori acara lainnya."
                : errors.length
                  ? "Kamu tetap bisa mencoba papan skor interaktif di atas."
                  : "Acara yang dipublikasikan penyelenggara akan tampil di sini."}
            </p>
          </div>
          {filtered ? (
            <button
              className={styles.emptyAction}
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Reset filter <Icon name="arrow" size={17} />
            </button>
          ) : (
            <a className={styles.emptyAction} href="#demo">
              Coba live scoring <Icon name="arrow" size={17} />
            </a>
          )}
        </div>
      )}
      <p className={styles.eventFootnote}>
        <Icon name="check" size={14} /> Acara resmi dari penyelenggara. Terbuka
        untuk semua penonton.
      </p>
    </div>
  );
}
