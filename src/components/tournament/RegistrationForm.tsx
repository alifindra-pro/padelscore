"use client";
import {
  isMainEntry,
  waitingEntries,
  type RegistrationEntry,
} from "@/lib/entry-status";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
type Category = {
  id: string;
  name: string;
  maxEntries?: number | null;
  entries?: RegistrationEntry[];
  stages?: unknown[];
};
export function RegistrationForm({
  categories,
  onRegistered,
}: {
  categories: Category[];
  onRegistered: () => void;
}) {
  const [selected, setSelected] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const category = categories.find((c) => c.id === selected);
  const full =
    !!category?.maxEntries &&
    (category.entries?.filter(isMainEntry).length ?? 0) >= category.maxEntries;
  const queued = waitingEntries(category?.entries ?? []).length;
  return (
    <section className="panel space-y-4" id="registration">
      <h2 className="panel-title">Daftar turnamen</h2>
      <p>
        Daftarkan dua pemain untuk satu slot pasangan. Nama peserta tampil di
        halaman turnamen; nomor kontak hanya untuk panitia.
      </p>
      {(full || queued > 0) && (
        <p role="status" className="text-sm text-secondary">
          Pendaftaran masuk antrean cadangan. Saat slot tersedia, panitia
          mengonfirmasi sesuai urutan daftar. Saat ini {queued} pasangan
          menunggu.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <form
        className="grid sm:grid-cols-2 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          setError("");
          setSuccess("");
          try {
            const result = await apiFetch<{
              name: string;
              status: string;
              queuePosition: number | null;
            }>(`/api/v2/categories/${selected}/register`, {
              method: "POST",
              body: JSON.stringify({
                playerNames: [f.get("one"), f.get("two")],
                contact: f.get("contact"),
                website: f.get("website"),
              }),
            });
            setSuccess(
              result.status === "WAITLISTED"
                ? `${result.name} terdaftar sebagai cadangan nomor ${result.queuePosition}. Tunggu konfirmasi panitia untuk masuk daftar utama.`
                : `${result.name} berhasil terdaftar sebagai peserta utama. Hubungi panitia jika perlu mengubah peserta.`,
            );
            form.reset();
            onRegistered();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field sm:col-span-2">
          Kategori
          <select
            aria-label="Kategori pendaftaran"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.entries?.filter(isMainEntry).length ?? 0}/
                {c.maxEntries ?? "∞"} slot terisi
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nama pemain pertama
          <input
            name="one"
            minLength={2}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className="field">
          Nama pemain kedua
          <input
            name="two"
            minLength={2}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className="field sm:col-span-2">
          Nomor WhatsApp penghubung
          <input
            name="contact"
            type="tel"
            minLength={5}
            maxLength={30}
            required
            disabled={busy}
          />
        </label>
        <div hidden aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button
          className="btn-primary"
          disabled={busy || !category || !!category.stages?.length}
        >
          {full || queued > 0
            ? busy
              ? "Mendaftarkan…"
              : "Daftar sebagai cadangan"
            : busy
              ? "Mendaftarkan…"
              : "Daftarkan pasangan"}
        </button>
      </form>
    </section>
  );
}
