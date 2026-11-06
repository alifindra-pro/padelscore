"use client";
import { useCallback, useEffect, useState, useId } from "react";
import { apiFetch } from "@/lib/api-client";
type Sponsor = {
  id: string;
  name: string;
  tier: string;
  website: string | null;
};
const tiers: Record<string, string> = {
  MAIN: "Sponsor utama",
  PARTNER: "Partner",
  SUPPORTER: "Pendukung",
};
export function Sponsors({
  tournamentId,
  manage = false,
}: {
  tournamentId: string;
  manage?: boolean;
}) {
  const logoId = useId();
  const [items, setItems] = useState<Sponsor[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/v2/tournaments/${tournamentId}/sponsors`;
  const load = useCallback(async () => {
    setItems(await apiFetch<Sponsor[]>(url));
  }, [url]);
  useEffect(() => {
    let active = true;
    apiFetch<Sponsor[]>(url)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  if (!manage && !items.length)
    return error ? (
      <p role="status" className="text-sm text-secondary">
        Sponsor belum dapat dimuat.
      </p>
    ) : null;
  return (
    <section
      className="sponsor-section panel space-y-5"
      aria-label="Sponsor turnamen"
    >
      <div>
        <p className="page-eyebrow">MENDUKUNG PERTANDINGAN</p>
        <h2 className="text-xl font-bold">Sponsor & partner</h2>
        <p className="text-sm text-secondary mt-2">
          {manage
            ? "Logo hanya tampil pada turnamen ini. Gunakan PNG transparan agar logo tetap rapi."
            : "Terima kasih kepada pihak yang mendukung turnamen ini."}
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {(["MAIN", "PARTNER", "SUPPORTER"] as const).map(
        (tier) =>
          items.some((s) => s.tier === tier) && (
            <div key={tier}>
              <h3 className="text-sm font-bold mb-3">{tiers[tier]}</h3>
              <div
                className={`sponsor-grid ${tier === "MAIN" ? "sponsor-main" : ""}`}
              >
                {items
                  .filter((s) => s.tier === tier)
                  .map((s) => (
                    <div className="sponsor-tile" key={s.id}>
                      {/* Logo uses the access-controlled same-origin endpoint. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${url}/${s.id}`}
                        alt={`Logo ${s.name}`}
                        width={240}
                        height={120}
                        loading="lazy"
                      />
                      {s.website ? (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="section-link"
                        >
                          {s.name} ↗
                        </a>
                      ) : (
                        <strong>{s.name}</strong>
                      )}
                      {manage && (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !confirm(
                                `Hapus sponsor ${s.name} dari turnamen ini?`,
                              )
                            )
                              return;
                            setBusy(true);
                            setError("");
                            try {
                              await apiFetch(`${url}/${s.id}`, {
                                method: "DELETE",
                              });
                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Hapus {s.name}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ),
      )}
      {manage && (
        <form
          className="grid sm:grid-cols-2 gap-4 border-t border-line pt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            const logo = data.get("logo");
            if (
              !(logo instanceof File) ||
              !logo.size ||
              logo.size > 4 * 1024 * 1024
            ) {
              setError("Pilih logo maksimal 4 MB");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const res = await fetch(url, { method: "POST", body: data });
              const body = await res.json();
              if (!res.ok)
                throw new Error(body.error?.message ?? "Logo belum tersimpan");
              form.reset();
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama sponsor
            <input
              name="name"
              minLength={2}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Posisi sponsor
            <select name="tier" disabled={busy}>
              <option value="MAIN">Sponsor utama</option>
              <option value="PARTNER">Partner</option>
              <option value="SUPPORTER">Pendukung</option>
            </select>
          </label>
          <label className="field">
            Website sponsor (opsional)
            <input
              name="website"
              type="url"
              maxLength={500}
              placeholder="https://"
              disabled={busy}
            />
          </label>
          <div className="field">
            <label htmlFor={logoId}>Logo sponsor</label>
            <input
              id={logoId}
              aria-describedby={`${logoId}-help`}
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              disabled={busy}
            />
            <small id={`${logoId}-help`}>
              JPEG, PNG, atau WebP · maksimal 4 MB · proporsi logo
              dipertahankan.
            </small>
          </div>
          <button
            className="btn-primary sm:col-span-2"
            disabled={busy || items.length >= 12}
          >
            {busy ? "Menyimpan…" : "Tambahkan sponsor"}
          </button>
          <p className="text-sm text-secondary sm:col-span-2">
            {items.length}/12 sponsor. Untuk mengganti logo atau nama, hapus
            sponsor lalu unggah kembali.
          </p>
        </form>
      )}
    </section>
  );
}
