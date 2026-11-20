"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api-client";
import { categoryStyle } from "@/lib/category-color";

interface Desk {
  opensAt: string | null;
  closesAt: string | null;
  state: "NOT_OPEN" | "OPEN" | "CLOSED";
  qr: { token: string; expiresAt: number } | null;
  serverTime: number;
  entries: {
    id: string;
    name: string;
    players: {
      checkedInAt: string | null;
      checkInMethod: string | null;
      player: { id: string; fullName: string };
    }[];
  }[];
}
interface Tournament {
  name: string;
  slug: string;
  timezone: string;
  categories: { id: string; name: string }[];
}

const offsetOf = (tz: string) =>
  tz === "Asia/Jayapura"
    ? "+09:00"
    : tz === "Asia/Makassar"
      ? "+08:00"
      : "+07:00";
/** ISO time to the value a datetime-local input shows, in the event's timezone. */
function toInput(iso: string | null, tz: string) {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
const fromInput = (value: string, tz: string) =>
  value ? new Date(`${value}:00${offsetOf(tz)}`).toISOString() : null;
const clock = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
const when = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [t, setT] = useState<Tournament>();
  const [selected, setSelected] = useState("");
  const [desk, setDesk] = useState<Desk>();
  const [svg, setSvg] = useState("");
  const [screen, setScreen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "MISSING">("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Tournament>(`/api/v1/tournaments/${id}`)
      .then((data) => {
        setT(data);
        setSelected((s) => s || data.categories[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const refresh = useCallback(async () => {
    if (!selected) return;
    const data = await apiFetch<Desk>(
      `/api/v2/categories/${selected}/check-in`,
    );
    setDesk(data);
  }, [selected]);

  // Statuses and the QR code refresh every few seconds while the page is open.
  useEffect(() => {
    // State is only set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const token = desk?.qr?.token;
  useEffect(() => {
    if (!token || !selected) return;
    const url = `${window.location.origin}/checkin/${selected}?t=${token}`;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [token, selected]);

  useEffect(() => {
    if (!screen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setScreen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [screen]);

  async function save(opensAt: string | null, closesAt: string | null) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/v2/categories/${selected}/check-in`, {
        method: "PATCH",
        body: JSON.stringify({ opensAt, closesAt }),
      });
      await refresh();
      setNotice("Waktu check-in disimpan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mark(entryId: string, playerId: string, present: boolean) {
    setError("");
    try {
      await apiFetch(`/api/v2/categories/${selected}/check-in`, {
        method: "POST",
        body: JSON.stringify({ entryId, playerId, present }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!t) return <p>{error || "Memuat…"}</p>;
  const tz = t.timezone;
  const category = t.categories.find((c) => c.id === selected);
  const catIndex = t.categories.findIndex((c) => c.id === selected);
  const entries = desk?.entries ?? [];
  const players = entries.flatMap((e) => e.players);
  const present = players.filter((p) => p.checkedInAt).length;
  const complete = entries.filter(
    (e) => e.players.length && e.players.every((p) => p.checkedInAt),
  ).length;
  const shown =
    filter === "MISSING"
      ? entries.filter((e) => e.players.some((p) => !p.checkedInAt))
      : entries;
  const ttl = desk?.qr
    ? Math.max(1, Math.round((desk.qr.expiresAt - desk.serverTime) / 1000))
    : 0;
  const stateText =
    desk?.state === "OPEN"
      ? desk.closesAt
        ? `Dibuka, tutup ${when(desk.closesAt, tz)}`
        : "Dibuka, belum ada jam tutup"
      : desk?.state === "CLOSED"
        ? "Sudah ditutup"
        : desk?.opensAt
          ? `Buka ${when(desk.opensAt, tz)}`
          : "Belum diatur";

  return (
    <div
      className="space-y-7 checkin-desk"
      style={categoryStyle(category?.name ?? "", catIndex)}
    >
      <Link className="section-link" href={`/admin/tournaments/${id}`}>
        ← Kelola turnamen
      </Link>
      <header>
        <p className="page-eyebrow">HARI PERTANDINGAN</p>
        <h1 className="page-heading">Check-in peserta</h1>
        <p className="page-intro">
          Tampilkan QR di meja panitia. Tiap pemain memindai dengan kamera HP,
          memilih namanya, lalu tercatat hadir. QR berganti tiap 30 detik, jadi
          foto QR tidak bisa dipakai dari luar venue.
        </p>
      </header>

      {t.categories.length > 1 && (
        <div className="checkin-tabs" role="tablist" aria-label="Kategori">
          {t.categories.map((c, i) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === selected}
              style={categoryStyle(c.name, i)}
              onClick={() => {
                setSelected(c.id);
                setDesk(undefined);
                setSvg("");
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="panel bg-critical/10 text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p
          className="bg-brand-soft p-3 rounded-lg text-brand text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      <div className="checkin-grid">
        <section className="panel space-y-4" aria-labelledby="window-title">
          <div>
            <h2 id="window-title" className="panel-title">
              Waktu check-in {category?.name}
            </h2>
            <p className="text-sm text-secondary mt-1">
              Status: <strong className="text-ink">{stateText}</strong>
            </p>
          </div>
          <form
            key={`${selected}:${desk?.opensAt}:${desk?.closesAt}`}
            className="grid sm:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(
                fromInput(String(f.get("opens")), tz),
                fromInput(String(f.get("closes")), tz),
              );
            }}
          >
            <label className="field">
              Buka ({tz})
              <input
                name="opens"
                type="datetime-local"
                defaultValue={toInput(desk?.opensAt ?? null, tz)}
              />
            </label>
            <label className="field">
              Tutup (boleh kosong)
              <input
                name="closes"
                type="datetime-local"
                defaultValue={toInput(desk?.closesAt ?? null, tz)}
              />
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy || !desk}>
                Simpan waktu
              </button>
              {desk?.state !== "OPEN" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy || !desk}
                  onClick={() => save(new Date().toISOString(), null)}
                >
                  Buka sekarang
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => save(desk.opensAt, new Date().toISOString())}
                >
                  Tutup sekarang
                </button>
              )}
            </div>
          </form>
          <p className="text-xs text-secondary">
            Setelah ditutup, pemain tidak bisa check-in sendiri. Panitia tetap
            bisa menandai hadir dari daftar di bawah.
          </p>
        </section>

        <section className="panel checkin-qr-panel" aria-labelledby="qr-title">
          <h2 id="qr-title" className="panel-title">
            QR check-in
          </h2>
          {desk?.state === "OPEN" && svg ? (
            <>
              <div
                className="checkin-qr"
                role="img"
                aria-label={`QR check-in ${category?.name}`}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <div className="checkin-timer" aria-hidden="true">
                <span key={token} style={{ animationDuration: `${ttl}s` }} />
              </div>
              <button
                className="btn-kinetic w-full"
                onClick={() => {
                  setScreen(true);
                  document.documentElement
                    .requestFullscreen?.()
                    .catch(() => {});
                }}
              >
                Tampilkan layar QR
              </button>
            </>
          ) : (
            <p className="checkin-qr-empty">
              {desk?.state === "CLOSED"
                ? "Check-in sudah ditutup. QR tidak ditampilkan."
                : "QR muncul di sini saat check-in dibuka."}
            </p>
          )}
        </section>
      </div>

      <section className="panel space-y-4" aria-labelledby="list-title">
        <div className="checkin-list-head">
          <div>
            <h2 id="list-title" className="panel-title">
              Kehadiran
            </h2>
            <p className="checkin-count">
              <strong>{present}</strong> / {players.length} pemain hadir ·{" "}
              <strong>{complete}</strong> / {entries.length} pasangan lengkap
            </p>
          </div>
          <div className="checkin-filter" role="group" aria-label="Saring">
            <button
              aria-pressed={filter === "ALL"}
              onClick={() => setFilter("ALL")}
            >
              Semua
            </button>
            <button
              aria-pressed={filter === "MISSING"}
              onClick={() => setFilter("MISSING")}
            >
              Belum lengkap ({entries.length - complete})
            </button>
          </div>
        </div>
        {shown.length ? (
          <ol className="checkin-list">
            {shown.map((e) => {
              const n = e.players.filter((p) => p.checkedInAt).length;
              return (
                <li
                  key={e.id}
                  className={n === e.players.length && n ? "is-complete" : ""}
                >
                  <span className="checkin-pair">
                    {e.name}
                    <small>
                      {n === e.players.length && n
                        ? "Lengkap"
                        : `${n} / ${e.players.length} hadir`}
                    </small>
                  </span>
                  <span className="checkin-players">
                    {e.players.map((p) => (
                      <button
                        key={p.player.id}
                        className={
                          p.checkedInAt ? "checkin-chip is-in" : "checkin-chip"
                        }
                        aria-pressed={!!p.checkedInAt}
                        title={
                          p.checkedInAt
                            ? "Tekan untuk membatalkan check-in"
                            : "Tekan untuk menandai hadir"
                        }
                        onClick={() => mark(e.id, p.player.id, !p.checkedInAt)}
                      >
                        <span>{p.player.fullName}</span>
                        <small>
                          {p.checkedInAt
                            ? `Hadir ${clock(p.checkedInAt, tz)}${p.checkInMethod === "MANUAL" ? " · panitia" : ""}`
                            : "Belum check-in"}
                        </small>
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-secondary">
            {entries.length
              ? "Semua pasangan sudah lengkap."
              : "Belum ada pasangan di kategori ini."}
          </p>
        )}
      </section>

      {screen && (
        <div
          className="checkin-screen"
          role="dialog"
          aria-modal="true"
          aria-label="Layar QR check-in"
        >
          <div className="checkin-screen-body">
            <p className="checkin-screen-kicker">{t.name}</p>
            <h2>Check-in {category?.name}</h2>
            {desk?.state === "OPEN" && svg ? (
              <>
                <div
                  className="checkin-qr"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <div className="checkin-timer" aria-hidden="true">
                  <span key={token} style={{ animationDuration: `${ttl}s` }} />
                </div>
              </>
            ) : (
              <p className="checkin-qr-empty">Check-in sedang tidak dibuka.</p>
            )}
            <ol className="checkin-steps">
              <li>Buka kamera HP, arahkan ke QR</li>
              <li>Pilih nama Anda</li>
              <li>Tunjukkan layar &ldquo;Hadir&rdquo; ke panitia</li>
            </ol>
            <p className="checkin-count">
              <strong>{present}</strong> / {players.length} pemain hadir
            </p>
          </div>
          <button
            className="checkin-screen-close"
            onClick={() => {
              setScreen(false);
              if (document.fullscreenElement)
                document.exitFullscreen().catch(() => {});
            }}
          >
            Tutup layar
          </button>
        </div>
      )}
    </div>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Memuat…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
