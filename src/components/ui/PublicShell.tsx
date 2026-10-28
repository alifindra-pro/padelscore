import type { ReactNode } from "react";
import Link from "next/link";
import { AppBrand } from "./AppBrand";
import { Icon } from "./Icon";

export function PublicShell({
  children,
  referee = false,
}: {
  children: ReactNode;
  referee?: boolean;
}) {
  return (
    <div className={`public-shell ${referee ? "referee-workspace" : ""}`}>
      <a className="app-skip-link" href="#page-content">
        Lewati ke konten
      </a>
      <header className="app-public-header">
        <div className="page-shell">
          <AppBrand />
          <nav aria-label="Navigasi portal">
            <Link href={referee ? "/referee" : "/#events"}>
              {referee ? "Penugasan wasit" : "Semua pertandingan"}
            </Link>
            <Link href={referee ? "/" : "/login"} className="btn-secondary">
              {referee ? "Portal publik" : "Masuk"}
              <Icon name="arrow" size={16} />
            </Link>
          </nav>
        </div>
      </header>
      <div id="page-content" className="public-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="app-public-footer page-shell">
        <span>PADEL INDONESIA</span>
        <span>Setiap lapangan. Setiap poin. Setiap pertandingan.</span>
      </footer>
    </div>
  );
}
