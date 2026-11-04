"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

const roleLabels: Record<string, string> = {
  OWNER: "Admin utama",
  ADMIN: "Admin",
  STAFF: "Staf",
  REFEREE: "Wasit",
};

export interface StaffMember {
  role: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    username: string;
    isActive: boolean;
  };
}

export function StaffAccounts({
  organizationId,
  members,
  canManage,
  onCreated,
}: {
  organizationId: string;
  members: StaffMember[];
  canManage: boolean;
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    fullName: string;
    username: string;
    role: string;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <section className="panel space-y-5" aria-labelledby="team-accounts-title">
      <div>
        <h2 id="team-accounts-title" className="text-xl font-bold">
          Akun tim
        </h2>
        <p className="text-secondary">
          Admin membuat akun wasit dan staf. Setiap orang masuk dengan akunnya
          sendiri.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Daftar akun tim">
        {members.map(({ role, user }) => (
          <li
            key={user.id}
            className="rounded-lg border border-line p-4 min-w-0 space-y-1"
          >
            <p className="font-semibold break-words">{user.fullName}</p>
            <p className="text-sm">
              {roleLabels[role] || role} ·{" "}
              {user.isActive ? "Aktif" : "Nonaktif"}
            </p>
            <p className="text-sm text-secondary break-all">
              Nama pengguna: {user.username}
            </p>
            <p className="text-sm text-secondary break-all">{user.email}</p>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="grid gap-4 md:grid-cols-2"
          aria-label="Buat akun tim"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            setError("");
            setCreated(null);
            try {
              const result = await apiFetch<{
                fullName: string;
                username: string;
                role: string;
              }>("/api/v2/staff/accounts", {
                method: "POST",
                body: JSON.stringify({
                  organizationId,
                  fullName: data.get("fullName"),
                  email: data.get("email"),
                  username: data.get("username"),
                  password: data.get("password"),
                  role: data.get("role"),
                }),
              });
              form.reset();
              setShowPassword(false);
              setCreated(result);
              await onCreated().catch(() =>
                setError(
                  "Akun sudah dibuat. Muat ulang halaman untuk memperbarui daftar.",
                ),
              );
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="font-semibold md:col-span-2">Buat akun</h3>
          <label className="field">
            Nama lengkap
            <input
              name="fullName"
              minLength={2}
              maxLength={100}
              autoComplete="off"
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              maxLength={254}
              autoComplete="off"
              autoCapitalize="none"
              required
              disabled={busy}
            />
          </label>
          <div className="space-y-2">
            <label className="field">
              Nama pengguna
              <input
                name="username"
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="staff-username-help"
                required
                disabled={busy}
              />
            </label>
            <p id="staff-username-help" className="action-help">
              3 sampai 30 huruf, angka, atau garis bawah. Dipakai untuk login.
            </p>
          </div>
          <div className="field">
            <label htmlFor="staff-account-role">Peran</label>
            <select id="staff-account-role" name="role" disabled={busy}>
              <option value="REFEREE">Wasit</option>
              <option value="STAFF">Staf</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="field">
              Kata sandi akun baru
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                aria-describedby="staff-password-help"
                required
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className="section-link"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            </button>
            <p id="staff-password-help" className="action-help">
              Minimal 10 karakter. Akun langsung aktif. Bagikan nama pengguna
              dan kata sandi secara pribadi kepada pemilik akun.
            </p>
          </div>
          {error && (
            <p role="alert" className="account-error md:col-span-2">
              {error}
            </p>
          )}
          <button
            className="btn-primary md:col-span-2"
            disabled={busy || !organizationId}
          >
            {busy ? "Membuat akun…" : "Buat akun"}
          </button>
        </form>
      ) : (
        <p className="action-help">Hanya admin yang dapat membuat akun tim.</p>
      )}
      {created && (
        <p role="status" className="account-info">
          Akun {roleLabels[created.role].toLowerCase()} untuk {created.fullName}{" "}
          berhasil dibuat. Nama pengguna: {created.username}. Akun sudah bisa
          login.
        </p>
      )}
    </section>
  );
}
