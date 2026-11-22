"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { categoryStyle } from "@/lib/category-color";

interface Desk {
  courts: {
    id: string;
    name: string;
    referee: { name: string; linkId: string; token: string } | null;
  }[];
  matches: {
    id: string;
    matchNumber: number | null;
    status: string;
    scheduledAt: string | null;
    courtId: string | null;
    startUnlockedAt: string | null;
    startCodeFails: number;
    locked: boolean;
    code: string;
    entryA: { name: string } | null;
    entryB: { name: string } | null;
    stage: { name: string; category: { name: string } };
  }[];
}

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [desk, setDesk] = useState<Desk>();
  const [tz, setTz] = useState("Asia/Jakarta");
  const [court, setCourt] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const refresh = useCallback(async () => {
    setDesk(await apiFetch<Desk>(`/api/v2/tournaments/${id}/referees`));
  }, [id]);
  useEffect(() => {
    // Values are set only after the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    apiFetch<{ timezone: string }>(`/api/v1/tournaments/${id}`)
      .then((t) => setTz(t.timezone))
      .catch(() => {});
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  async function post(body: object, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/v2/tournaments/${id}/referees`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
      setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} disalin`);
    } catch {
      setError("Tidak bisa menyalin otomatis. Salin manual dari layar.");
    }
  }

  if (!desk) return <p>{error || "Memuat…"}</p>;
  const missing = desk.courts.filter((c) => !c.referee);
  const courtName = (cid: string | null) =>
    desk.courts.find((c) => c.id === cid)?.name ?? "Belum ada lapangan";
  const shown = desk.matches.filter(
    (m) => court === "ALL" || m.courtId === court,
  );
  const time = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("id-ID", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="space-y-7 referee-desk">
      <Link className="section-link" href={`/admin/tournaments/${id}`}>
        ← Kelola turnamen
      </Link>
      <header>
        <p className="page-eyebrow">HARI PERTANDINGAN</p>
        <h1 className="page-heading">Wasit & kode laga</h1>
        <p className="page-intro">
          Tiap lapangan punya satu akun wasit. Wasit membuka link lapangannya
          dan memasukkan token. Sebelum laga dimulai, wasit meminta kode 4 angka
          laga itu ke meja panitia.
        </p>
      </header>
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

      <section className="space-y-4" aria-labelledby="courts-title">
        <div className="referee-head">
          <h2 id="courts-title" className="panel-title">
            Akun wasit lapangan
          </h2>
          {missing.length > 0 && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                for (const c of missing)
                  await post(
                    { action: "court", courtId: c.id },
                    "Akun wasit dibuat",
                  );
              }}
            >
              Buat akun untuk {missing.length} lapangan
            </button>
          )}
        </div>
        {desk.courts.length ? (
          <ul className="referee-courts">
            {desk.courts.map((c) => {
              const url = c.referee
                ? `${origin}/wasit/${c.referee.linkId}`
                : "";
              return (
                <li key={c.id} className="panel">
                  <h3>{c.referee?.name ?? `Wasit ${c.name}`}</h3>
                  {c.referee ? (
                    <>
                      <p className="referee-label">Token</p>
                      <p className="referee-token">{c.referee.token}</p>
                      <p className="referee-label">Link</p>
                      <p className="referee-link">{url}</p>
                      <div className="referee-actions">
                        <button
                          className="btn-kinetic"
                          onClick={() =>
                            copy(
                              `${c.referee!.name}\nLink: ${url}\nToken: ${c.referee!.token}`,
                              "Link dan token",
                            )
                          }
                        >
                          Salin untuk WhatsApp
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() =>
                            post(
                              { action: "rotate", courtId: c.id },
                              `Token ${c.name} diganti. HP yang memakai token lama keluar otomatis.`,
                            )
                          }
                        >
                          Ganti token
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        post(
                          { action: "court", courtId: c.id },
                          "Akun wasit dibuat",
                        )
                      }
                    >
                      Buat akun wasit
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel text-sm text-secondary">
            Belum ada lapangan. Tambahkan lapangan di langkah Siapkan acara.
          </p>
        )}
      </section>

      <section className="panel space-y-4" aria-labelledby="codes-title">
        <div>
          <h2 id="codes-title" className="panel-title">
            Kode mulai laga
          </h2>
          <p className="text-sm text-secondary mt-1">
            Bacakan kode ke wasit saat laga siap dimulai. Jika wasit salah 5
            kali atau HP-nya bermasalah, tekan Izinkan mulai.
          </p>
        </div>
        <div className="checkin-tabs" role="tablist" aria-label="Lapangan">
          {[{ id: "ALL", name: "Semua lapangan" }, ...desk.courts].map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={court === c.id}
              style={{ "--cat": "var(--color-ink)" } as React.CSSProperties}
              onClick={() => setCourt(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ol className="code-rows">
            {shown.map((m) => {
              const open = !!m.startUnlockedAt;
              return (
                <li
                  key={m.id}
                  className={open ? "is-open" : m.locked ? "is-locked" : ""}
                  style={categoryStyle(m.stage.category.name)}
                >
                  <span className="code-when">
                    {time(m.scheduledAt)}
                    <small>{courtName(m.courtId)}</small>
                  </span>
                  <span className="code-match">
                    <small>
                      {m.stage.category.name} · Laga {m.matchNumber ?? "—"}
                    </small>
                    {m.entryA?.name} <em>vs</em> {m.entryB?.name}
                  </span>
                  <span className="code-value" aria-label={`Kode ${m.code}`}>
                    {m.code}
                  </span>
                  <span className="code-state">
                    {open ? (
                      m.status === "SCHEDULED" ? (
                        <>
                          Sudah dibuka
                          <button
                            className="btn-secondary text-xs"
                            disabled={busy}
                            onClick={() =>
                              post(
                                { action: "relock", matchId: m.id },
                                "Izin mulai dibatalkan. Wasit perlu kode lagi.",
                              )
                            }
                          >
                            Batalkan
                          </button>
                        </>
                      ) : (
                        "Berjalan"
                      )
                    ) : m.locked ? (
                      <>
                        Terkunci
                        <button
                          className="btn-secondary text-xs"
                          disabled={busy}
                          onClick={() =>
                            post(
                              { action: "unlock", matchId: m.id },
                              "Laga dibuka",
                            )
                          }
                        >
                          Izinkan mulai
                        </button>
                      </>
                    ) : (
                      <>
                        Menunggu kode
                        <button
                          className="btn-secondary text-xs"
                          disabled={busy}
                          onClick={() =>
                            post(
                              { action: "unlock", matchId: m.id },
                              "Laga dibuka",
                            )
                          }
                        >
                          Izinkan mulai
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-secondary">
            Belum ada laga terjadwal dengan kedua pasangan lengkap.
          </p>
        )}
      </section>
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
