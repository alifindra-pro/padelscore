"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AuthShell } from "@/components/ui/AuthShell";
import { Icon } from "@/components/ui/Icon";

export default function LoginForm({ quickLogin }: { quickLogin: boolean }) {
  const router = useRouter();
  const { login, loginWithButton } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = quickLogin
        ? await loginWithButton()
        : await login(email, password);
      if (user.role === "SUPER_ADMIN" || user.role === "ORGANIZER") {
        router.push("/admin");
      } else if (user.role === "REFEREE") {
        router.push("/referee");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Tidak dapat masuk. Silakan coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="RUANG PENGELOLA & WASIT"
      title="Selamat datang kembali."
      description="Masuk dan siapkan hari pertandingan yang hebat."
    >
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-critical/10 border border-critical/30 text-danger text-sm"
        >
          {error}
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {!quickLogin && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-2"
              >
                Alamat email
              </label>
              <input
                type="email"
                id="login-email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@organisasi.com"
                className="w-full px-4 py-3 rounded-xl bg-surface-tint border border-line text-ink placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-2"
              >
                Kata sandi
              </label>
              <input
                type={showPassword ? "text" : "password"}
                id="login-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-surface-tint border border-line text-ink placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
              <button
                type="button"
                className="section-link"
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword
                  ? "Sembunyikan kata sandi"
                  : "Tampilkan kata sandi"}
              </button>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading
            ? "Membuka ruang pengelola…"
            : quickLogin
              ? "Masuk ke ruang pengelola"
              : "Masuk"}
        </button>

        <div className="text-center text-sm text-secondary">
          Penonton tidak perlu akun.
          <br />
          <Link href="/" className="section-link">
            Lihat jadwal & hasil pertandingan <Icon name="arrow" size={16} />
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
