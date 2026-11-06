"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
type Dispute = {
  id: string;
  reporterName: string;
  contact: string;
  reason: string;
  status: string;
  response: string | null;
  createdAt: string;
  scoreVersion: number;
  match: {
    id: string;
    matchNumber: number;
    version: number;
    entryA: { name: string } | null;
    entryB: { name: string } | null;
  };
};
export function DisputeReview({ tournamentId }: { tournamentId: string }) {
  const [items, setItems] = useState<Dispute[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("PENDING");
  const url = `/api/v2/tournaments/${tournamentId}/disputes`;
  const load = useCallback(async () => {
    setItems(await apiFetch<Dispute[]>(url));
  }, [url]);
  useEffect(() => {
    let active = true;
    apiFetch<Dispute[]>(url)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url]);
  const visible = items.filter((d) => filter === "ALL" || d.status === filter);
  return (
    <section className="panel space-y-5">
      <div>
        <p className="page-eyebrow">TINJAUAN PANITIA</p>
        <h2 className="text-xl font-bold">Sanggahan peserta</h2>
        <p className="text-sm text-secondary mt-2">
          Keputusan dicatat tanpa mengubah skor otomatis. Jika menerima
          sanggahan, tindak lanjuti koreksi hasil dan dampaknya pada babak
          lanjutan.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={filter === "PENDING" ? "btn-primary" : "btn-secondary"}
          onClick={() => setFilter("PENDING")}
          aria-pressed={filter === "PENDING"}
        >
          Menunggu ({items.filter((d) => d.status === "PENDING").length})
        </button>
        <button
          className={filter === "ALL" ? "btn-primary" : "btn-secondary"}
          onClick={() => setFilter("ALL")}
          aria-pressed={filter === "ALL"}
        >
          Semua sanggahan
        </button>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Muat ulang
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Memuat sanggahan…</p>
      ) : (
        !visible.length && (
          <p className="text-secondary">
            Belum ada sanggahan pada pilihan ini.
          </p>
        )
      )}
      {visible.map((d) => (
        <article key={d.id} className="dispute-review space-y-4">
          <header>
            <span className="status-pill">
              {
                (
                  {
                    PENDING: "Menunggu",
                    ACCEPTED: "Diterima",
                    REJECTED: "Ditolak",
                  } as Record<string, string>
                )[d.status]
              }
            </span>
            <h3 className="font-bold mt-2">
              Laga {d.match.matchNumber} · {d.match.entryA?.name} vs{" "}
              {d.match.entryB?.name}
            </h3>
            <p className="text-xs text-secondary">
              {new Date(d.createdAt).toLocaleString("id-ID")} · versi skor{" "}
              {d.scoreVersion}
            </p>
          </header>
          <p>
            <strong>{d.reporterName}</strong> · {d.contact}
          </p>
          <p className="whitespace-pre-wrap break-words">{d.reason}</p>
          {d.match.version !== d.scoreVersion && (
            <p className="text-sm text-secondary">
              Skor telah berubah sejak pengajuan. Periksa hasil terbaru sebelum
              memutuskan.
            </p>
          )}
          <Link className="section-link" href={`/match/${d.match.id}`}>
            Lihat hasil pertandingan →
          </Link>
          {d.status === "PENDING" ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await apiFetch(url, {
                    method: "PATCH",
                    body: JSON.stringify({
                      disputeId: d.id,
                      status: form.get("status"),
                      response: form.get("response"),
                    }),
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Keputusan
                <select name="status" aria-label="Keputusan" disabled={busy}>
                  <option value="ACCEPTED">Terima sanggahan</option>
                  <option value="REJECTED">Tolak sanggahan</option>
                </select>
              </label>
              <label className="field">
                Tanggapan untuk peserta
                <textarea
                  name="response"
                  minLength={10}
                  maxLength={2000}
                  required
                  rows={3}
                  disabled={busy}
                />
              </label>
              <button className="btn-primary" disabled={busy}>
                Simpan keputusan
              </button>
            </form>
          ) : (
            <div className="dispute-response whitespace-pre-wrap">
              {d.response}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
