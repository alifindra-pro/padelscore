import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { Icon } from "@/components/ui/Icon";
export default function RegistrationClosed() {
  return (
    <AuthShell
      eyebrow="TERBUKA UNTUK SEMUA PENONTON"
      title="Langsung ikut keseruannya."
      description="Nikmati jadwal, bagan, dan skor pertandingan tanpa membuat akun."
    >
      <div className="space-y-6">
        <div className="account-info">
          <Icon name="users" size={24} />
          <p>
            Peserta didaftarkan oleh penyelenggara. Akun pengelola dan wasit
            tersedia melalui undangan organisasi.
          </p>
        </div>
        <Link href="/#events" className="btn-primary w-full">
          Jelajahi pertandingan <Icon name="arrow" size={18} />
        </Link>
        <Link href="/login" className="section-link">
          Sudah punya akun pengelola? Masuk <Icon name="arrow" size={16} />
        </Link>
      </div>
    </AuthShell>
  );
}
