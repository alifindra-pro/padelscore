"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { Icon } from "@/components/ui/Icon";
import { apiFetch } from "@/lib/api-client";
export default function Invite() {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell
      eyebrow="SELAMAT BERGABUNG"
      title="Siap masuk lapangan?"
      description="Aktifkan akun dari undangan organisasi untuk mulai mengelola pertandingan."
    >
      {done ? (
        <div className="space-y-5">
          <p className="account-info" role="status">
            <Icon name="check" />
            Akun berhasil diaktifkan. Selamat bergabung!
          </p>
          <Link href="/login" className="btn-primary w-full">
            Masuk ke akun <Icon name="arrow" size={18} />
          </Link>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setMessage("");
            const f = new FormData(e.currentTarget);
            try {
              await apiFetch("/api/v2/invitations/accept", {
                method: "POST",
                body: JSON.stringify({
                  token: new URLSearchParams(location.search).get("token"),
                  fullName: f.get("name"),
                  username: f.get("username"),
                  password: f.get("password"),
                }),
              });
              setDone(true);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama lengkap
            <input name="name" autoComplete="name" minLength={2} required />
          </label>
          <label className="field">
            Nama pengguna
            <input
              name="username"
              autoComplete="username"
              minLength={3}
              pattern="[a-zA-Z0-9_]+"
              required
            />
          </label>
          <label className="field">
            Kata sandi
            <input
              name="password"
              autoComplete="new-password"
              type="password"
              minLength={10}
              required
            />
          </label>
          <p className="action-help">
            Gunakan minimal 10 karakter untuk kata sandi.
          </p>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Mengaktifkan akun…" : "Aktifkan akun"}
            <Icon name="arrow" size={18} />
          </button>
        </form>
      )}
      {message && (
        <p className="account-error" role="alert">
          {message}
        </p>
      )}
    </AuthShell>
  );
}
