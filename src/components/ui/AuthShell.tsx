import type { ReactNode } from "react";
import Link from "next/link";
import { AppBrand } from "./AppBrand";
import { CourtScene } from "./CourtScene";
import { Icon } from "./Icon";

export function AuthShell({
  children,
  eyebrow,
  title,
  description,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="account-shell">
      <header className="app-public-header">
        <div className="page-shell">
          <AppBrand />
          <Link href="/" className="section-link">
            Lihat acara publik <Icon name="arrow" size={16} />
          </Link>
        </div>
      </header>
      <main className="account-grid page-shell">
        <section className="account-story" aria-label="Padel Score by Padel Addictive">
          <p className="page-eyebrow">PADEL SCORE by PADEL ADDICTIVE</p>
          <h2>
            Jadwal,
            <br />
            skor, dan
            <br />
            <span>hasil pertandingan.</span>
          </h2>
          <p>
            Penonton dapat melihat acara tanpa akun.
            <br />
            Pengelola mengatur peserta dan pertandingan dari dashboard.
          </p>
          <CourtScene className="account-court" />
          <div className="account-story-footer">
            <span>TURNAMEN & PERTANDINGAN SOSIAL</span>
            <Icon name="court" size={20} />
          </div>
        </section>
        <section className="account-form">
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="page-heading">{title}</h1>
          <p className="page-intro">{description}</p>
          <div className="account-form-content">{children}</div>
        </section>
      </main>
      <footer className="app-public-footer page-shell">
        <span>PADEL SCORE by PADEL ADDICTIVE</span>
        <span>Jadwal dan hasil pertandingan padel.</span>
      </footer>
    </div>
  );
}
