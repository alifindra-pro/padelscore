"use client";
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
const statuses: Record<string, string> = {
  DRAFT: "Draf",
  REGISTRATION: "Pendaftaran",
  PUBLISHED: "Dipublikasikan",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Arsip",
};
export default function Tournaments() {
  const router = useRouter();
  const [events, setEvents] = useState<Tournament[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [scoreChosen, setScoreChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<{ items: Tournament[] }>("/api/v1/tournaments?limit=100")
      .then((x) => {
        setEvents(x.items);
        const params = new URLSearchParams(location.search);
        setCreating(params.get("new") === "1");
        const requestedStatus = params.get("status");
        if (requestedStatus && requestedStatus in statuses)
          setFilter(requestedStatus);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function create(form: HTMLFormElement) {
    const f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const timezone = String(f.get("timezone"));
      const offset =
        timezone === "Asia/Jayapura"
          ? "+09:00"
          : timezone === "Asia/Makassar"
            ? "+08:00"
            : "+07:00";
      const date = String(f.get("date"));
      const end = String(f.get("endDate") || date);
      const event = await apiFetch<Tournament>("/api/v1/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          location: f.get("location"),
          startDate: new Date(`${date}T08:00:00${offset}`).toISOString(),
          endDate: new Date(`${end}T23:59:00${offset}`).toISOString(),
          timezone,
        }),
      });
      router.push(`/admin/tournaments/${event.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = events.filter(
    (t) =>
      (filter === "ALL" || filter === t.status) &&
      `${t.name} ${t.location}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-end">
        <div>
          <p className="page-eyebrow">PLAY. COMPETE. CONNECT.</p>
          <h1 className="page-heading">Turnamen</h1>
          <p className="page-intro">
            Cari turnamen berdasarkan nama, lokasi, atau status.
          </p>
        </div>
        {!creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            Buat turnamen
          </button>
        )}
      </div>
      {error && (
        <p className="panel text-danger" role="alert">
          {error}
        </p>
      )}
      {creating && !scoreChosen ? (
        <section className="panel space-y-5">
          <div>
            <h2 className="panel-title">
              Bagaimana skor pertandingan dihitung?
            </h2>
            <p className="text-secondary mt-2">
              Pilih cara bermain sebelum mengisi nama acara dan peserta.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-line rounded-xl p-5 space-y-4">
              <h3 className="text-lg font-bold">Skor tenis</h3>
              <p className="text-2xl font-bold tabular-nums">
                0 → 15 → 30 → 40
              </p>
              <p className="text-secondary">
                Pasangan tetap. Poin membentuk game, lalu set. Bisa memakai
                sistem gugur atau semua pasangan saling bertemu.
              </p>
              <button
                className="btn-primary"
                onClick={() => setScoreChosen(true)}
              >
                Pilih skor tenis
              </button>
            </div>
            <div className="border border-line rounded-xl p-5 space-y-4">
              <h3 className="text-lg font-bold">
                Skor poin — Americano / Mexicano
              </h3>
              <p className="text-2xl font-bold tabular-nums">0 → 1 → 2 → 3</p>
              <p className="text-secondary">
                Pasangan berganti setiap ronde. Poin dikumpulkan untuk peringkat
                pemain. Contoh: total 32 poin, hasil 18–14.
              </p>
              <Link className="btn-primary" href="/admin/social?new=1">
                Pilih Americano / Mexicano
              </Link>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => setCreating(false)}>
            Kembali ke daftar turnamen
          </button>
        </section>
      ) : creating ? (
        <form
          className="panel space-y-6 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            void create(e.currentTarget);
          }}
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="status-pill mb-2">Skor tenis · 0–15–30–40</span>
              <h2 className="panel-title">Informasi turnamen</h2>
              <p className="text-sm text-secondary mt-2">
                Peserta dan aturan pertandingan bisa ditambahkan setelah ini.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setCreating(false)}
              aria-label="Tutup formulir"
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            Nama turnamen
            <input
              name="name"
              placeholder="Contoh: Jakarta Padel Weekend"
              required
              minLength={3}
              autoFocus
            />
          </label>
          <label className="field">
            Lokasi / venue
            <input
              name="location"
              placeholder="Di mana pertandingan berlangsung?"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="field">
              Tanggal mulai
              <input name="date" type="date" required />
            </label>
            <label className="field">
              Zona waktu
              <select name="timezone">
                <option value="Asia/Jakarta">WIB — Jakarta</option>
                <option value="Asia/Makassar">WITA — Makassar</option>
                <option value="Asia/Jayapura">WIT — Jayapura</option>
              </select>
            </label>
          </div>
          <details>
            <summary className="text-sm font-semibold cursor-pointer">
              Acara berlangsung lebih dari satu hari?
            </summary>
            <label className="field mt-3">
              Tanggal selesai
              <input name="endDate" type="date" />
            </label>
          </details>
          <div className="action-row border-t border-line pt-5">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Membuat acara…" : "Buat turnamen & atur kategori"}
              <Icon name="arrow" size={18} />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setScoreChosen(false)}
            >
              Ganti cara menghitung skor
            </button>
          </div>
        </form>
      ) : (
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
          ) : (
            <section className="panel empty-state">
              <h2 className="font-bold text-ink">
                {events.length
                  ? "Tidak ada acara yang cocok"
                  : "Belum ada turnamen"}
              </h2>
              <p>
                {events.length
                  ? "Coba kata kunci atau status lain."
                  : "Gunakan “Buat turnamen” untuk menambahkan acara."}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
