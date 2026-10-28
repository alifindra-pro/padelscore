"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
export default function Profile() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch<{ fullName: string; avatarUrl: string | null }>("/api/v2/profile")
      .then((p) => {
        setName(p.fullName);
        setAvatar(p.avatarUrl);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v2/profile/avatar", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);
      setAvatar(`/api/v2/profile/avatar?t=${Date.now()}`);
      setMessage("Foto akun diperbarui");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-xl space-y-6">
      <div className="app-page-heading">
        <p className="page-eyebrow">YOUR GAME. YOUR IDENTITY.</p>
        <h1 className="page-heading">Profil saya</h1>
      </div>
      <p className="text-secondary">
        Kelola nama dan foto akun pengelola Anda.
      </p>
      <form
        className="panel space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await apiFetch("/api/v2/profile", {
              method: "PATCH",
              body: JSON.stringify({ fullName: name }),
            });
            setMessage("Profil disimpan");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {avatar ? (
          // Private avatar behind the session cookie; the image optimizer cannot fetch it
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt="Foto profil admin"
            width={96}
            height={96}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-brand-soft flex items-center justify-center text-3xl font-bold">
            {name.charAt(0)}
          </div>
        )}
        <label className="field">
          Foto JPEG, PNG, atau WebP (maksimal 5 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        {avatar && (
          <button
            className="btn-secondary"
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                await apiFetch("/api/v2/profile/avatar", { method: "DELETE" });
                setAvatar(null);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Hapus foto
          </button>
        )}
        <label className="field">
          Nama lengkap
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn-primary" disabled={busy}>
          Simpan profil
        </button>
        <p role="status">{message}</p>
      </form>
    </div>
  );
}
