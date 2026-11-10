"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
type Category = {
  id: string;
  name: string;
  maxEntries?: number | null;
  entries?: unknown[];
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
    (category.entries?.length ?? 0) >= category.maxEntries;
  return (
    <section className="panel space-y-4" id="registration">
      <h2 className="panel-title">Daftar turnamen</h2>
      <p>
        Daftarkan dua pemain untuk satu slot pasangan. Nama peserta tampil di
        halaman turnamen; nomor kontak hanya untuk panitia.
      </p>
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
            const result = await apiFetch<{ name: string }>(
              `/api/v2/categories/${selected}/register`,
              {
                method: "POST",
                body: JSON.stringify({
                  playerNames: [f.get("one"), f.get("two")],
                  contact: f.get("contact"),
                  website: f.get("website"),
                }),
              },
            );
            setSuccess(
              `${result.name} berhasil terdaftar. Hubungi panitia jika perlu mengubah peserta.`,
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
                {c.name} · {c.entries?.length ?? 0}/{c.maxEntries ?? "∞"} slot
                terisi
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
            disabled={busy || full}
          />
        </label>
        <label className="field">
          Nama pemain kedua
          <input
            name="two"
            minLength={2}
            maxLength={100}
            required
            disabled={busy || full}
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
            disabled={busy || full}
          />
        </label>
        <div hidden aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button
          className="btn-primary"
          disabled={busy || full || !category || !!category.stages?.length}
        >
          {full
            ? "Slot sudah penuh"
            : busy
              ? "Mendaftarkan…"
              : "Daftarkan pasangan"}
        </button>
      </form>
    </section>
  );
}
