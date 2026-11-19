"use client";
import { formatLabel } from "@/lib/labels";
import { useEffect, useState } from "react";
import { categoryStyle } from "@/lib/category-color";
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
  /** Which uploaded header image the card can show, if any. */
  image?: "logo" | "banner" | null;
  imageVersion?: string;
  themeColor?: string | null;
  categories?: {
    id: string;
    name: string;
    maxEntries: number | null;
    pairs: number;
  }[];
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
  REGISTRATION: "Pendaftaran dibuka",
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
  // When the list was loaded; picks the featured event and its countdown.
  const [loadedAt, setLoadedAt] = useState(0);
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
      setLoadedAt(Date.now());
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
      (filter !== "upcoming" ||
        ["PUBLISHED", "REGISTRATION"].includes(event.status)) &&
      `${event.name} ${event.location ?? ""}`.toLowerCase().includes(search),
  );
  const visibleSocial = social.filter(
    (session) =>
      ["all", "social"].includes(filter) &&
      session.name.toLowerCase().includes(search),
  );
  const filtered = search || filter !== "all";
  // The next tournament to watch: live first, then the soonest upcoming one.
  const today = new Date(loadedAt - 86400000).toISOString();
  const featured = filtered
    ? undefined
    : (events.find((e) => e.status === "IN_PROGRESS") ??
      events
        .filter(
          (e) =>
            ["REGISTRATION", "PUBLISHED"].includes(e.status) &&
            e.startDate >= today,
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]);
  const gridEvents = visibleEvents.filter((e) => e.id !== featured?.id);
  const count = visibleEvents.length + visibleSocial.length;
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
          Memuat daftar acara…
        </div>
      ) : count > 0 ? (
        <>
          {featured && <FeaturedEvent event={featured} now={loadedAt} />}
          <p className={styles.resultCount} role="status">
            {count} acara ditemukan
          </p>
          <div className={styles.eventGrid}>
            {gridEvents.map((event) => (
              <Link
                href={`/tournament/${encodeURIComponent(event.slug)}`}
                className={styles.eventCard}
                key={event.id}
              >
                {event.image ? (
                  <div
                    className={styles.eventCover}
                    style={
                      event.themeColor
                        ? { borderBottomColor: event.themeColor }
                        : undefined
                    }
                  >
                    {/* Header images are served by the application with access checks. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/v2/tournaments/${event.id}/header?image=${event.image}&v=${encodeURIComponent(event.imageVersion ?? "")}`}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className={styles.eventArtwork}>
                    <Icon name="trophy" size={40} />
                    <span>
                      JADWAL
                      <br />
                      BAGAN
                      <br />
                      <b>HASIL</b>
                    </span>
                    <span className={styles.eventCategory}>TURNAMEN</span>
                  </div>
                )}
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
                    Sosial · {formatLabel(session.format)}
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

function daysUntil(start: string, timezone: string, now: number) {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Asia/Jakarta",
    }).format(d);
  const diff = Math.round(
    (Date.parse(day(new Date(start))) - Date.parse(day(new Date(now)))) /
      86400000,
  );
  return diff <= 0 ? "Hari ini" : diff === 1 ? "Besok" : `${diff} hari lagi`;
}

/** The next tournament, shown large above the list. */
function FeaturedEvent({ event, now }: { event: Tournament; now: number }) {
  const href = `/tournament/${encodeURIComponent(event.slug)}`;
  const live = event.status === "IN_PROGRESS";
  const longDate = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: event.timezone || "Asia/Jakarta",
  }).format(new Date(event.startDate));
  return (
    <article
      className={styles.featured}
      style={
        event.themeColor ? { borderTopColor: event.themeColor } : undefined
      }
      aria-labelledby={`featured-${event.id}`}
    >
      <Link
        href={href}
        className={styles.featuredArt}
        tabIndex={-1}
        aria-hidden="true"
      >
        {event.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/v2/tournaments/${event.id}/header?image=${event.image}&v=${encodeURIComponent(event.imageVersion ?? "")}`}
            alt=""
          />
        ) : (
          <Icon name="trophy" size={56} />
        )}
      </Link>
      <div className={styles.featuredBody}>
        <p className={styles.featuredKicker}>
          <span className={live ? styles.liveBadge : styles.eventBadge}>
            {statuses[event.status] || "Turnamen"}
          </span>
          {!live && (
            <strong>{daysUntil(event.startDate, event.timezone, now)}</strong>
          )}
        </p>
        <h3 id={`featured-${event.id}`}>
          <Link href={href}>{event.name}</Link>
        </h3>
        <ul className={styles.featuredFacts}>
          <li>
            <Icon name="calendar" size={17} />
            {longDate}
          </li>
          <li>
            <Icon name="pin" size={17} />
            {event.location || "Lokasi menyusul"}
          </li>
        </ul>
        {!!event.categories?.length && (
          <ul
            className={styles.featuredCategories}
            aria-label="Nomor pertandingan"
          >
            {event.categories.map((c, i) => (
              <li key={c.id} style={categoryStyle(c.name, i)}>
                <strong>{c.name}</strong>
                <span>
                  {c.pairs}
                  {c.maxEntries ? ` / ${c.maxEntries}` : ""} pasangan
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.featuredActions}>
          <Link href={href} className={styles.featuredPrimary}>
            {live ? "Lihat skor langsung" : "Lihat jadwal & peserta"}
            <Icon name="arrow" size={17} />
          </Link>
          {event.status === "REGISTRATION" && (
            <Link
              href={`${href}#registration`}
              className={styles.featuredSecondary}
            >
              Daftar pasangan
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
