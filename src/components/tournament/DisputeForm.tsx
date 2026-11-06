"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
const statusLabels: Record<string, string> = {
  PENDING: "Menunggu tinjauan admin",
  ACCEPTED: "Sanggahan diterima",
  REJECTED: "Sanggahan ditolak",
};
export function DisputeForm({
  tournamentId,
  matchId,
}: {
  tournamentId: string;
  matchId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState("");
  const [result, setResult] = useState<{
    status: string;
    response?: string | null;
  }>();
  return (
    <section className="panel space-y-4" aria-labelledby="dispute-title">
      <h2 id="dispute-title" className="text-xl font-bold">
        Sanggah hasil pertandingan
      </h2>
      <p className="text-sm text-secondary">
        Ada hasil yang perlu diperiksa? Peserta dapat mengirim alasan kepada
        admin. Skor dan bagan tetap berlaku sampai panitia menyelesaikan
        peninjauan. Nama dan kontak Anda tidak ditampilkan kepada penonton.
      </p>
      <details>
        <summary className="section-link cursor-pointer py-3">
          Ajukan sanggahan
        </summary>
        <form
          className="space-y-4 mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            setMessage("");
            try {
              const response = await apiFetch<{
                id: string;
                receipt: string;
                status: string;
              }>(`/api/v2/tournaments/${tournamentId}/disputes`, {
                method: "POST",
                body: JSON.stringify({
                  matchId,
                  reporterName: data.get("reporterName"),
                  contact: data.get("contact"),
                  reason: data.get("reason"),
                  website: data.get("website"),
                }),
              });
              setReceipt(`${response.id}.${response.receipt}`);
              setResult({ status: response.status });
              setMessage(
                "Sanggahan terkirim. Simpan kode pelacakan di bawah untuk memeriksa keputusan admin.",
              );
              form.reset();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama peserta pengaju
            <input
              name="reporterName"
              minLength={2}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Email atau nomor WhatsApp
            <input
              name="contact"
              minLength={5}
              maxLength={150}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Alasan sanggahan
            <textarea
              name="reason"
              minLength={20}
              maxLength={2000}
              rows={4}
              placeholder="Jelaskan skor yang tercatat, bagian yang keliru, dan kejadian yang perlu ditinjau."
              required
              disabled={busy}
            />
          </label>
          <div hidden aria-hidden="true">
            <input name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Mengirim…" : "Kirim sanggahan"}
          </button>
        </form>
      </details>
      <p role="status">{message}</p>
      <form
        className="space-y-3 border-t border-line pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const [id, token] = receipt.trim().split(".");
          if (!id || !token) {
            setMessage("Masukkan kode pelacakan lengkap");
            return;
          }
          setBusy(true);
          setMessage("");
          setResult(undefined);
          try {
            setResult(
              await apiFetch(`/api/v2/disputes/${encodeURIComponent(id)}`, {
                headers: { "x-dispute-receipt": token },
              }),
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Kode pelacakan sanggahan
          <input
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <p className="text-xs text-secondary">
          Simpan kode ini secara pribadi. Kode diperlukan untuk melihat
          tanggapan admin; tidak ada email otomatis.
        </p>
        <button className="btn-secondary" disabled={busy}>
          Periksa status sanggahan
        </button>
      </form>
      {result && (
        <div className="dispute-response" role="status">
          <strong>{statusLabels[result.status] ?? result.status}</strong>
          {result.response && (
            <p className="whitespace-pre-wrap mt-2">{result.response}</p>
          )}
        </div>
      )}
    </section>
  );
}
