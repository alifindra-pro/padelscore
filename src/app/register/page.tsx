import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { Icon } from "@/components/ui/Icon";
export default function RegistrationClosed() {
  return (
    <AuthShell
      eyebrow="TERBUKA UNTUK SEMUA PENONTON"
      title="Lihat pertandingan tanpa akun."
      description="Buka acara publik untuk melihat jadwal, bagan, dan skor pertandingan."
    >
      <div className="space-y-6">
        <div className="account-info">
          <Icon name="users" size={24} />
          <p>
            Peserta didaftarkan oleh penyelenggara. Akun pengelola dan wasit
            dibuat oleh admin organisasi. Hubungi admin untuk mendapatkan akun.
          </p>
        </div>
        <Link href="/#events" className="btn-primary w-full">
          Lihat daftar acara <Icon name="arrow" size={18} />
        </Link>
        <Link href="/login" className="section-link">
          Sudah punya akun pengelola? Masuk <Icon name="arrow" size={16} />
        </Link>
      </div>
    </AuthShell>
  );
}
