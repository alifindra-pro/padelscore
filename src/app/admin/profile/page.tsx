"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { MAX_AVATAR_BYTES, AVATAR_SIZE_MESSAGE } from "@/lib/upload-limits";
export default function Profile() {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  useEffect(() => {
    apiFetch<{ fullName: string; avatarUrl: string | null }>("/api/v2/profile")
      .then((p) => {
        setName(p.fullName);
        setAvatar(p.avatarUrl);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function upload(file: File) {
    if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
      setMessage(AVATAR_SIZE_MESSAGE);
      return;
    }
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
        <p className="page-eyebrow">AKUN PENGELOLA</p>
        <h1 className="page-heading">Profil saya</h1>
      </div>
      <p className="text-secondary">
        Kelola nama, foto, dan kata sandi akun pengelola Anda.
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
          Foto JPEG, PNG, atau WebP (maksimal 4 MB)
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
      <form
        className="panel space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          const newPassword = String(fields.get("newPassword"));
          if (newPassword !== fields.get("confirmation")) {
            setPasswordMessage("Konfirmasi kata sandi belum sama");
            return;
          }
          setPasswordBusy(true);
          setPasswordMessage("");
          try {
            await apiFetch("/api/v2/profile/password", {
              method: "POST",
              body: JSON.stringify({
                currentPassword: fields.get("currentPassword"),
                newPassword,
              }),
            });
            form.reset();
            setPasswordMessage(
              "Kata sandi berhasil diubah. Gunakan kata sandi baru saat login berikutnya.",
            );
          } catch (error) {
            setPasswordMessage((error as Error).message);
          } finally {
            setPasswordBusy(false);
          }
        }}
      >
        <h2 className="text-xl font-bold">Ubah kata sandi</h2>
        <p className="text-secondary">
          Masukkan kata sandi saat ini, lalu pilih kata sandi baru minimal 10
          karakter.
        </p>
        <label className="field">
          Kata sandi saat ini
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            disabled={passwordBusy}
          />
        </label>
        <label className="field">
          Kata sandi baru
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={72}
            disabled={passwordBusy}
          />
        </label>
        <label className="field">
          Ulangi kata sandi baru
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={72}
            disabled={passwordBusy}
          />
        </label>
        <button className="btn-primary" disabled={passwordBusy}>
          {passwordBusy ? "Menyimpan…" : "Simpan kata sandi"}
        </button>
        <p role="status">{passwordMessage}</p>
      </form>
    </div>
  );
}
