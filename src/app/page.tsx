import type { Metadata } from "next";
import Link from "next/link";
import { CourtScene } from "@/components/ui/CourtScene";
import { Icon } from "@/components/ui/Icon";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LiveScore } from "@/components/landing/LiveScore";
import { EventExplorer } from "@/components/landing/EventExplorer";
import styles from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: "Padel Indonesia — Setiap poin. Setiap momen.",
  description:
    "Ikuti skor padel langsung, temukan turnamen, dan jelajahi pertandingan komunitas. Semua dari satu tempat, tanpa perlu akun penonton.",
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
              <span className={styles.liveDot} /> YOUR GAME. CONNECTED.
            </p>
            <h1 id="hero-title">
              Setiap poin.
              <br />
              Setiap momen.
              <br />
              <span>Tetap dekat.</span>
            </h1>
            <p className={styles.heroDescription}>
              Dari servis pertama sampai match point. Ikuti skor langsung,
              temukan turnamen, dan jadi bagian dari permainan.
            </p>
            <div className={styles.heroActions}>
              <a href="#events" className={styles.primaryButton}>
                Jelajahi pertandingan <Icon name="arrow" size={18} />
              </a>
              <a href="#demo" className={styles.textButton}>
                <span className={styles.playIcon}>▶</span> Coba live scoring
              </a>
            </div>
            <p className={styles.heroNote}>
              <Icon name="check" size={15} /> Tanpa akun. Langsung ikut
              keseruannya.
            </p>
          </div>
          <div className={styles.heroVisual}>
            <span className={styles.visualLabel}>THE COURT IS CALLING.</span>
            <CourtScene className={styles.courtScene} />
            <div className={styles.courtLabel}>
              <Icon name="court" size={16} />
              <span>
                DI LAPANGAN.
                <br />
                <strong>DALAM GENGGAMAN.</strong>
              </span>
            </div>
            <LiveScore />
            <span className={styles.visualCaption}>
              PADEL, POINT BY POINT. <span>01 — 03</span>
            </span>
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
              <Icon name="court" /> Satu tempat. Semua permainan.
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
              <p className={styles.eyebrow}>TEMUKAN PERMAINANMU</p>
              <h2 id="events-heading">Dari lapangan, untuk kamu.</h2>
            </div>
            <p>
              Turnamen kompetitif atau pertandingan santai.
              <br />
              Keseruan berikutnya dimulai di sini.
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
                <p className={styles.eyebrow}>LESS HASSLE. MORE PADEL.</p>
                <h2 id="features-heading">
                  Fokus pada permainan.
                  <br />
                  Sisanya, ada di sini.
                </h2>
              </div>
              <p>
                Untuk penonton yang tak mau ketinggalan.
                <br />
                Untuk penyelenggara yang ingin serba tertata.
              </p>
            </div>
            <div className={styles.featureGrid}>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>01 / LIVE SCORING</span>
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
                <h3>Jangan lewatkan satu poin pun.</h3>
                <p>
                  Poin, game, dan set dalam tampilan yang jelas. Ikuti jalannya
                  pertandingan dari mana saja.
                </p>
                <a href="#demo" className={styles.featureLink}>
                  Coba papan skor <Icon name="arrow" size={17} />
                </a>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>
                  02 / TOURNAMENT HUB
                </span>
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
                    <span>THE NEXT CHAMPION</span>
                  </div>
                </div>
                <h3>Perjalanan menuju juara.</h3>
                <p>
                  Jadwal pertandingan, bagan turnamen, dan hasil akhir. Semua
                  rapi dalam satu tempat.
                </p>
                <a href="#events" className={styles.featureLink}>
                  Temukan turnamen <Icon name="arrow" size={17} />
                </a>
              </article>
              <article className={styles.feature}>
                <span className={styles.featureNumber}>03 / SOCIAL PADEL</span>
                <div className={styles.miniCommunity} aria-hidden="true">
                  <span>AD</span>
                  <span>BK</span>
                  <span>CL</span>
                  <span>YOU</span>
                  <p>GOOD GAMES. GREAT COMPANY.</p>
                </div>
                <h3>Pasangan baru. Cerita baru.</h3>
                <p>
                  Jelajahi sesi sosial, rotasi pasangan, dan leaderboard. Karena
                  padel lebih seru bersama.
                </p>
                <a href="#events" className={styles.featureLink}>
                  Jelajahi acara sosial <Icon name="arrow" size={17} />
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
                Turnamen hebat.
                <br />
                Dimulai dari sini.
              </h2>
              <p>
                Kelola peserta, atur lapangan, dan jalankan live scoring.
                <br />
                Satu ruang untuk seluruh turnamenmu.
              </p>
              <Link href="/login" className={styles.limeButton}>
                Masuk ruang pengelola <Icon name="arrow" size={18} />
              </Link>
              <small>Akses pengelola dan wasit melalui undangan.</small>
            </div>
            <div className={styles.organizerArt} aria-hidden="true">
              <div className={styles.outlineCourt} />
              <span>
                LET’S
                <br />
                PLAY<span>.</span>
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
            <p className={styles.eyebrow}>SEBELUM MASUK LAPANGAN</p>
            <h2 id="faq-heading">Masih penasaran?</h2>
            <p>Beberapa hal yang perlu kamu tahu.</p>
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
                Masuk ke ruang pengelola dengan akun yang telah diundang oleh
                organisasi. Peserta, kategori, jadwal, lapangan, dan
                pertandingan dikelola dari dashboard.
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
            PADEL<span>INDONESIA</span>
          </Link>
          <p>Setiap lapangan. Setiap poin. Setiap pertandingan.</p>
          <a href="#main">
            Kembali ke atas <span>↗</span>
          </a>
        </div>
        <div className={`${styles.shell} ${styles.footerBottom}`}>
          <span>© Padel Indonesia</span>
          <span>MADE FOR THE LOVE OF THE GAME.</span>
        </div>
      </footer>
    </div>
  );
}
