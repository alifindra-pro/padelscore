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
            Kembali ke lapangan <Icon name="arrow" size={16} />
          </Link>
        </div>
      </header>
      <main className="account-grid page-shell">
        <section className="account-story" aria-label="Padel Indonesia">
          <p className="page-eyebrow">YOUR GAME. CONNECTED.</p>
          <h2>
            Setiap poin.
            <br />
            Setiap momen.
            <br />
            <span>Tetap dekat.</span>
          </h2>
          <p>
            Dari servis pertama sampai match point.
            <br />
            Satu tempat untuk seluruh permainanmu.
          </p>
          <CourtScene className="account-court" />
          <div className="account-story-footer">
            <span>MADE FOR THE LOVE OF THE GAME.</span>
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
        <span>PADEL INDONESIA</span>
        <span>Play. Connect. Compete.</span>
      </footer>
    </div>
  );
}
