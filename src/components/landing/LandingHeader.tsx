"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./landing.module.css";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className={styles.header}>
      <div className={`${styles.shell} ${styles.headerInner}`}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Padel Indonesia, beranda"
        >
          <span className={styles.brandMark}>
            <Icon name="court" size={23} />
          </span>
          PADEL<span>INDONESIA</span>
        </Link>
        <nav
          id="landing-navigation"
          className={`${styles.navigation} ${open ? styles.navigationOpen : ""}`}
          aria-label="Navigasi utama"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              document.getElementById("navigation-toggle")?.focus();
            }
          }}
        >
          <a href="#events" onClick={() => setOpen(false)}>
            Pertandingan
          </a>
          <a href="#features" onClick={() => setOpen(false)}>
            Fitur
          </a>
          <a href="#organizers" onClick={() => setOpen(false)}>
            Untuk penyelenggara
          </a>
          <a href="#faq" onClick={() => setOpen(false)}>
            FAQ
          </a>
        </nav>
        <Link href="/login" className={styles.loginButton}>
          Masuk <Icon name="arrow" size={16} />
        </Link>
        <button
          id="navigation-toggle"
          className={styles.menuButton}
          aria-label={open ? "Tutup navigasi" : "Buka navigasi"}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
    </header>
  );
}
