import type { Metadata } from "next";
import Link from "next/link";
import { CourtScene } from "@/components/ui/CourtScene";
import { Icon } from "@/components/ui/Icon";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LiveScore } from "@/components/landing/LiveScore";
import { EventExplorer } from "@/components/landing/EventExplorer";
import styles from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: "Padel Score by Padel Addictive | Jadwal, skor, dan hasil pertandingan",
  description:
    "Lihat jadwal, bagan, dan skor turnamen padel serta hasil Americano dan Mexicano tanpa membuat akun.",
};

export default function Home() {
  return (
    <div className={styles.landing}>
      <a href="#main" className={styles.skipLink}>
        Lewati ke konten
      </a>
      <LandingHeader />
      <main id="main">
        <section
          className={`${styles.shell} ${styles.hero}`}
          aria-labelledby="hero-title"
        >
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.liveDot} /> TURNAMEN & PERTANDINGAN SOSIAL
            </p>
            <h1 id="hero-title">
              Jadwal padel,
              <br />
              skor, dan
              <br />
              <span>hasil pertandingan.</span>
            </h1>
            <p className={styles.heroDescription}>
              Pilih acara untuk melihat jadwal, bagan, dan skor yang dicatat
              wasit. Acara yang sudah dipublikasikan dapat dilihat tanpa akun.
            </p>
            <div className={styles.heroActions}>
              <a href="#events" className={styles.primaryButton}>
                Lihat daftar acara <Icon name="arrow" size={18} />
              </a>
              <a href="#demo" className={styles.textButton}>
                <span className={styles.playIcon}>▶</span> Coba demo skor
              </a>
            </div>
            <p className={styles.heroNote}>
              <Icon name="check" size={15} /> Penonton tidak perlu membuat akun.
            </p>
          </div>
          <div className={styles.heroVisual}>
            <span className={styles.visualLabel}>LAPANGAN PADEL</span>
            <CourtScene className={styles.courtScene} />
            <div className={styles.courtLabel}>
              <Icon name="court" size={16} />
              <span>
                TURNAMEN
                <br />
                <strong>& SESI SOSIAL</strong>
              </span>
            </div>
            <LiveScore />
            <span className={styles.visualCaption}>ILUSTRASI LAPANGAN</span>
          </div>
        </section>
        <div className={styles.benefitStrip}>
          <div className={styles.shell}>
            <span>
              <Icon name="live" /> Skor langsung
            </span>
            <i />
            <span>
              <Icon name="trophy" /> Turnamen & bagan
            </span>
            <i />
            <span>
              <Icon name="users" /> Komunitas padel
            </span>
            <i />
            <span>
              <Icon name="court" /> Americano & Mexicano
            </span>
          </div>
        </div>
        <section
          id="events"
          className={`${styles.shell} ${styles.eventsSection}`}
          aria-labelledby="events-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>ACARA PUBLIK</p>
              <h2 id="events-heading">Cari turnamen atau sesi sosial.</h2>
            </div>
            <p>
              Cari berdasarkan nama acara atau lokasi.
              <br />
              Pilih acara untuk melihat detail pertandingan.
            </p>
          </div>
          <EventExplorer />
        </section>
        <section
          id="features"
          className={styles.featuresSection}
          aria-labelledby="features-heading"
        >
          <div className={styles.shell}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>INFORMASI PERTANDINGAN</p>
                <h2 id="features-heading">
                  Ikuti pertandingan.
                  <br />
                  Periksa jadwal dan hasilnya.
                </h2>
              </div>
              <p>
                Penonton melihat jadwal dan skor.
                <br />
                Pengelola menyiapkan acara dan mencatat hasil.
              </p>
            </div>
            <div className={styles.featureGrid}>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>
                  01 / SKOR PERTANDINGAN
                </span>
                <div className={styles.miniScore} aria-hidden="true">
                  <span>GAME. SET.</span>
                  <strong>
                    MATCH<span>!</span>
                  </strong>
                  <div>
                    <span>
                      SET 1 <b>6–4</b>
                    </span>
                    <span>
                      SET 2 <b>5–3</b>
                    </span>
                    <span className={styles.matchPoint}>MATCH POINT</span>
                  </div>
                </div>
                <h3>Lihat skor yang dicatat wasit.</h3>
                <p>
                  Buka halaman pertandingan untuk melihat poin, game, dan set.
                  Pembaruan tampil setelah perangkat wasit tersinkron.
                </p>
                <a href="#demo" className={styles.featureLink}>
                  Coba papan skor <Icon name="arrow" size={17} />
                </a>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>02 / TURNAMEN</span>
                <div className={styles.miniBracket} aria-hidden="true">
                  <div>
                    <span>
                      Tim A <b>6</b>
                    </span>
                    <span>
                      Tim B <b>4</b>
                    </span>
                  </div>
                  <i />
                  <div>
                    <Icon name="trophy" size={25} />
                    <span>CONTOH BAGAN</span>
                  </div>
                </div>
                <h3>Periksa jadwal dan bagan.</h3>
                <p>
                  Pilih turnamen untuk melihat pasangan yang bertanding, jadwal,
                  dan hasil setiap babak.
                </p>
                <a href="#events" className={styles.featureLink}>
                  Temukan turnamen <Icon name="arrow" size={17} />
                </a>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>
                  03 / PERTANDINGAN SOSIAL
                </span>
                <div className={styles.miniCommunity} aria-hidden="true">
                  <span>AD</span>
                  <span>BK</span>
                  <span>CL</span>
                  <span>DM</span>
                  <p>CONTOH ROTASI PASANGAN</p>
                </div>
                <h3>Ikuti ronde Americano dan Mexicano.</h3>
                <p>
                  Lihat susunan pasangan tiap ronde dan klasemen sesi sosial
                  yang dipublikasikan pengelola.
                </p>
                <a href="#events" className={styles.featureLink}>
                  Lihat sesi sosial <Icon name="arrow" size={17} />
                </a>
              </article>
            </div>
          </div>
        </section>
        <section
          id="organizers"
          className={`${styles.shell} ${styles.organizerSection}`}
        >
          <div className={styles.organizerPanel}>
            <div className={styles.organizerCopy}>
              <p className={styles.eyebrow}>UNTUK PENYELENGGARA</p>
              <h2>
                Kelola turnamen
                <br />
                dari dashboard.
              </h2>
              <p>
                Masukkan peserta, susun jadwal, dan tugaskan wasit.
                <br />
                Sahkan hasil sebelum melanjutkan ke babak berikutnya.
              </p>
              <Link href="/login" className={styles.limeButton}>
                Masuk ruang pengelola <Icon name="arrow" size={18} />
              </Link>
              <small>Peserta didaftarkan oleh pengelola.</small>
            </div>
            <div className={styles.organizerArt} aria-hidden="true">
              <div className={styles.outlineCourt} />
              <span>
                ATUR
                <br />
                LAGA<span>.</span>
              </span>
              <Icon name="arrow" size={100} />
            </div>
          </div>
        </section>
        <section
          id="faq"
          className={`${styles.shell} ${styles.faqSection}`}
          aria-labelledby="faq-heading"
        >
          <div>
            <p className={styles.eyebrow}>BANTUAN</p>
            <h2 id="faq-heading">Akun dan pembaruan skor</h2>
            <p>Informasi untuk penonton dan pengelola.</p>
          </div>
          <div className={styles.faqList}>
            <details>
              <summary>
                Perlu akun untuk melihat pertandingan?<span>+</span>
              </summary>
              <p>
                Tidak. Kamu bisa melihat turnamen yang dipublikasikan, jadwal,
                bagan, dan skor pertandingan tanpa membuat akun.
              </p>
            </details>
            <details>
              <summary>
                Bagaimana skor langsung diperbarui?<span>+</span>
              </summary>
              <p>
                Wasit mencatat poin melalui aplikasi scoring. Buka halaman
                pertandingan pada turnamen untuk mengikuti pembaruan skor. Papan
                skor di atas adalah demo interaktif untuk dicoba.
              </p>
            </details>
            <details>
              <summary>
                Bagaimana cara mengelola turnamen?<span>+</span>
              </summary>
              <p>
                Buka halaman masuk untuk mengakses ruang pengelola. Peserta,
                kategori, jadwal, lapangan, dan pertandingan dikelola dari
                dashboard.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.shell}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>
              <Icon name="court" size={23} />
            </span>
            <span className={styles.brandCopy}>
              <strong>PADEL<span> SCORE</span></strong>
              <small>by PADEL ADDICTIVE</small>
            </span>
          </Link>
          <p>Jadwal, skor, dan hasil pertandingan padel.</p>
          <a href="#main">
            Kembali ke atas <span>↗</span>
          </a>
        </div>
        <div className={`${styles.shell} ${styles.footerBottom}`}>
          <span>© Padel Score by Padel Addictive</span>
          <span>TURNAMEN & PERTANDINGAN SOSIAL</span>
        </div>
      </footer>
    </div>
  );
}
