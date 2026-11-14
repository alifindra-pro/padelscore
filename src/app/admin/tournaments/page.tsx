"use client";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/labels";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { TournamentList } from "@/components/TournamentList";
import { Icon } from "@/components/ui/Icon";
interface Tournament {
  id: string;
  name: string;
  status: string;
  location: string;
  startDate: string;
  timezone: string;
}
const statuses = TOURNAMENT_STATUS_LABELS;
export default function Tournaments() {
  const router = useRouter();
  const [events, setEvents] = useState<Tournament[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [socialEvents, setSocialEvents] = useState<
    {
      id: string;
      name: string;
      format: string;
      published: boolean;
      config: { target: number; rounds: number; location?: string };
      participants: unknown[];
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<typeof socialEvents>("/api/v2/social", {
      params: {
        organizationId: localStorage.getItem("padel-organization") || undefined,
      },
    })
      .then(setSocialEvents)
      .catch(() =>
        setError(
          "Acara Americano/Mexicano belum dapat dimuat. Coba muat ulang halaman.",
        ),
      );
    apiFetch<{ items: Tournament[] }>("/api/v1/tournaments?limit=100")
      .then((x) => {
        setEvents(x.items);
        const params = new URLSearchParams(location.search);
        if (params.get("new") === "1") router.replace("/admin/tournaments/new");
        const requestedStatus = params.get("status");
        if (requestedStatus && requestedStatus in statuses)
          setFilter(requestedStatus);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);
  const visible = events.filter(
    (t) =>
      (filter === "ALL" || filter === t.status) &&
      `${t.name} ${t.location}`.toLowerCase().includes(query.toLowerCase()),
  );
  const socialVisible = socialEvents.filter(
    (event) =>
      (filter === "ALL" ||
        filter === (event.published ? "PUBLISHED" : "DRAFT")) &&
      `${event.name} ${event.config.location || ""} ${event.format}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-end">
        <div>
          <p className="page-eyebrow">ACARA ORGANISASI</p>
          <h1 className="page-heading">Turnamen</h1>
          <p className="page-intro">
            Cari turnamen berdasarkan nama, lokasi, atau status.
          </p>
        </div>
        <Link className="btn-primary" href="/admin/tournaments/new">
          <Icon name="plus" size={18} />
          Buat turnamen baru
        </Link>
      </div>
      {error && (
        <p className="panel text-danger" role="alert">
          {error}
        </p>
      )}
      {
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="relative flex-1">
              <span className="absolute left-3 top-3 text-secondary">
                <Icon name="search" size={20} />
              </span>
              <input
                aria-label="Cari turnamen"
                className="w-full pl-11 pr-4 py-3"
                placeholder="Cari nama turnamen atau lokasi…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter status turnamen"
              className="px-4 py-3 sm:max-w-52"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">Semua status</option>
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="panel empty-state">Memuat turnamen…</div>
          ) : visible.length ? (
            <TournamentList events={visible} />
          ) : socialVisible.length ? null : (
            <section className="panel empty-state">
              <h2 className="font-bold text-ink">
                {events.length
                  ? "Tidak ada acara yang cocok"
                  : "Belum ada turnamen"}
              </h2>
              <p>
                {events.length
                  ? "Coba kata kunci atau status lain."
                  : "Gunakan “Buat turnamen baru” untuk menambahkan acara."}
              </p>
            </section>
          )}
          {socialVisible.length > 0 && (
            <section className="panel space-y-4">
              <div className="setting-section-heading">
                <span className="setting-section-icon">
                  <Icon name="refresh" />
                </span>
                <div>
                  <h2>Americano & Mexicano</h2>
                  <p>Rotasi pasangan dan peringkat tiap pemain.</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {socialVisible.map((event) => (
                  <Link
                    key={event.id}
                    href={`/admin/social?id=${event.id}`}
                    className="social-list-event"
                  >
                    <div>
                      <strong>{event.name}</strong>
                      <p>
                        {event.format === "AMERICANO"
                          ? "Americano"
                          : "Mexicano"}{" "}
                        · {event.participants.length} pemain ·{" "}
                        {event.config.target} poin
                      </p>
                      <span>
                        {event.published ? "Terbit" : "Draf"} ·{" "}
                        {event.config.rounds} ronde
                      </span>
                    </div>
                    <Icon name="arrow" size={18} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      }
    </div>
  );
}
