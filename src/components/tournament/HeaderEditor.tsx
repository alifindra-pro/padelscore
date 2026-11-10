"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { HeaderPreview, type HeaderSettings } from "./TournamentHeader";
export function HeaderEditor({ tournamentId }: { tournamentId: string }) {
  const url = `/api/v2/tournaments/${tournamentId}/header`;
  const [settings, setSettings] = useState<HeaderSettings>();
  const [name, setName] = useState("Turnamen");
  const [title, setTitle] = useState("");
  const [themeColor, setThemeColor] = useState("#005baa");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<HeaderSettings>(url),
      apiFetch<{ name: string }>(`/api/v1/tournaments/${tournamentId}`),
    ])
      .then(([data, tournament]) => {
        if (active) {
          setSettings(data);
          setTitle(data.title);
          setThemeColor(data.themeColor);
          setDescription(data.description);
          setName(tournament.name);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, tournamentId]);
  async function save(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setSettings(await apiFetch<HeaderSettings>(url));
      setNotice("Header turnamen disimpan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel space-y-5"
      aria-label="Pengaturan header turnamen"
    >
      <div>
        <h2 className="panel-title">Header turnamen</h2>
        <p className="text-sm text-secondary mt-2">
          Banner, logo, dan teks hanya berlaku untuk turnamen ini. Judul
          tampilan tidak mengubah nama atau tautan turnamen.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {settings && (
        <>
          <div className="border border-line rounded-xl p-4 space-y-3">
            <p className="text-sm text-secondary">Pratinjau header tersimpan</p>
            <HeaderPreview id={tournamentId} name={name} settings={settings} />
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(() =>
                apiFetch(url, {
                  method: "PATCH",
                  body: JSON.stringify({ title, description, themeColor }),
                }),
              );
            }}
          >
            <label className="field">
              Judul tampilan
              <input
                aria-label="Judul tampilan"
                value={title}
                maxLength={120}
                placeholder={name}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
              />
              <small>Kosongkan untuk memakai nama turnamen.</small>
            </label>
            <label className="field">
              Deskripsi header
              <textarea
                aria-label="Deskripsi header"
                value={description}
                maxLength={500}
                rows={3}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
              />
              <small>{description.length}/500 karakter</small>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="field">
                Warna tema
                <input
                  aria-label="Warna tema"
                  type="color"
                  value={themeColor}
                  disabled={busy}
                  onChange={(e) => setThemeColor(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setThemeColor("#005baa")}
              >
                Gunakan biru bawaan
              </button>
            </div>
            <p className="text-sm text-secondary">
              Warna aksen mengikuti pilihan Anda. Warna judul dan tombol
              disesuaikan agar tetap terbaca.
            </p>
            <button className="btn-primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan header"}
            </button>
          </form>
          <div className="grid md:grid-cols-2 gap-5 border-t border-line pt-5">
            {(["banner", "logo"] as const).map((kind) => (
              <form
                className="space-y-3"
                key={kind}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  const file = data.get("file");
                  if (
                    !(file instanceof File) ||
                    !file.size ||
                    file.size > 4 * 1024 * 1024
                  ) {
                    setError("Pilih gambar maksimal 4 MB");
                    return;
                  }
                  void save(async () => {
                    const res = await fetch(`${url}?image=${kind}`, {
                      method: "POST",
                      body: data,
                    });
                    const result = await res.json();
                    if (!res.ok)
                      throw new Error(
                        result.error?.message ?? "Gambar belum tersimpan",
                      );
                    form.reset();
                  });
                }}
              >
                <label className="field">
                  {kind === "banner" ? "Banner turnamen" : "Logo turnamen"}
                  <input
                    aria-label={
                      kind === "banner" ? "Banner turnamen" : "Logo turnamen"
                    }
                    type="file"
                    name="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    disabled={busy}
                  />
                  <small>
                    JPEG, PNG, WebP · maksimal 4 MB.{" "}
                    {kind === "banner"
                      ? "Disarankan 1600 × 600 px. Gambar ditampilkan utuh."
                      : "Disarankan PNG transparan. Proporsi logo dipertahankan."}
                  </small>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busy}>
                    Unggah {kind}
                  </button>
                  {(kind === "banner"
                    ? settings.hasBanner
                    : settings.hasLogo) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Hapus ${kind} turnamen?`))
                          void save(() =>
                            apiFetch(`${url}?image=${kind}`, {
                              method: "DELETE",
                            }),
                          );
                      }}
                    >
                      Hapus {kind}
                    </button>
                  )}
                </div>
              </form>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
