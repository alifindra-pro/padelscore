"use client";

import Link from "next/link";
import { Icon } from "./Icon";

const features = [
  {
    title: "Turnamen",
    group: "Pertandingan",
    icon: "trophy",
    art: "bracket",
    tone: "blue",
    href: "/admin/tournaments",
    description:
      "Atur kategori, daftarkan pasangan, lalu susun bagan dan jadwal pertandingan.",
    tags: ["Kategori", "Bagan", "Hasil"],
    action: "Kelola turnamen",
  },
  {
    title: "Americano / Mexicano",
    group: "Pertandingan",
    icon: "court",
    art: "rotation",
    tone: "lime",
    href: "/admin/social",
    description:
      "Buat sesi komunitas dengan rotasi pasangan dan klasemen setiap ronde.",
    tags: ["Rotasi", "Ronde", "Klasemen"],
    action: "Buka sesi sosial",
  },
  {
    title: "Konsol wasit",
    group: "Pertandingan",
    icon: "live",
    art: "score",
    tone: "lime",
    href: "/referee",
    description:
      "Buka pertandingan yang ditugaskan dan catat setiap poin, termasuk saat offline.",
    tags: ["Penugasan", "Skor", "Offline"],
    action: "Buka konsol wasit",
  },
  {
    title: "Pemain",
    group: "Pengelolaan",
    icon: "users",
    art: "players",
    tone: "blue",
    href: "/admin/players",
    description:
      "Simpan data peserta, cari pemain, dan lihat statistik komunitas Anda.",
    tags: ["Direktori", "Statistik", "Peringkat"],
    action: "Lihat pemain",
  },
  {
    title: "Organisasi & venue",
    group: "Pengelolaan",
    icon: "settings",
    art: "venue",
    tone: "blue",
    href: "/admin/organization",
    description:
      "Siapkan tim pengelola, undang staf, dan atur venue beserta lapangannya.",
    tags: ["Staf", "Venue", "Lapangan"],
    action: "Atur organisasi",
  },
  {
    title: "Profil saya",
    group: "Pengelolaan",
    icon: "user",
    art: "profile",
    tone: "blue",
    href: "/admin/profile",
    description: "Lengkapi identitas pengelola dan perbarui foto profil Anda.",
    tags: ["Identitas", "Foto admin"],
    action: "Perbarui profil",
  },
  {
    title: "Portal publik",
    group: "Komunitas",
    icon: "grid",
    art: "portal",
    tone: "lime",
    href: "/",
    description:
      "Lihat acara, jadwal, dan hasil yang sudah dipublikasikan untuk para penonton.",
    tags: ["Acara publik", "Hasil", "Tanpa login"],
    action: "Lihat portal publik",
  },
];

/** Decorative diagrams describe a feature, never pretend to be live match data. */
function FeatureArt({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 240 100"
      fill="none"
      aria-hidden="true"
      className="feature-art"
    >
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "bracket" ? (
          <>
            <path d="M55 22h35v20h30m-65 36h35V58h30m0-16v16m0-8h50" />
            <rect x="25" y="14" width="30" height="16" rx="5" />
            <rect x="25" y="70" width="30" height="16" rx="5" />
            <rect x="170" y="33" width="40" height="34" rx="8" />
            <path d="m182 50 6 6 12-14" />
          </>
        ) : kind === "rotation" ? (
          <>
            <path d="M90 20c45-25 90 25 55 58m10-18-10 18 22-3M75 80c-45-25-10-80 20-60m-20 1 20-1-8-17" />
            <circle cx="110" cy="42" r="9" />
            <circle cx="132" cy="57" r="9" />
            <circle cx="45" cy="48" r="6" />
            <circle cx="190" cy="48" r="6" />
          </>
        ) : kind === "schedule" ? (
          <>
            <rect x="52" y="18" width="136" height="68" rx="8" />
            <path d="M52 38h136M80 12v14m80-14v14" />
            <rect x="66" y="49" width="31" height="10" rx="3" />
            <rect x="105" y="49" width="31" height="10" rx="3" />
            <rect x="144" y="67" width="31" height="10" rx="3" />
            <path d="M66 72h62" />
          </>
        ) : kind === "score" ? (
          <>
            <rect x="45" y="19" width="150" height="63" rx="9" />
            <path d="M120 30v39M60 50h10l7-12 10 24 8-12h10M139 42h39m-39 16h26" />
            <circle cx="183" cy="19" r="7" className="feature-art-accent" />
          </>
        ) : kind === "players" ? (
          <>
            {[68, 120, 172].map((x, i) => (
              <g key={x} opacity={i === 1 ? 1 : 0.55}>
                <circle cx={x} cy={i === 1 ? 30 : 40} r="12" />
                <path d={`M${x - 20} 80v-12a20 20 0 0 1 40 0v12z`} />
              </g>
            ))}
          </>
        ) : kind === "venue" ? (
          <>
            <rect x="52" y="18" width="136" height="68" rx="5" />
            <path d="M120 18v68M52 52h136M81 18v34m78 0v34" />
            <circle cx="188" cy="21" r="15" className="feature-art-accent" />
            <path d="m182 21 4 4 8-9" />
          </>
        ) : kind === "profile" ? (
          <>
            <rect x="57" y="13" width="126" height="75" rx="10" />
            <circle cx="85" cy="39" r="11" />
            <path d="M70 70v-5a15 15 0 0 1 30 0v5m19-36h44m-44 16h29m-29 16h37" />
          </>
        ) : (
          <>
            <rect x="48" y="16" width="144" height="70" rx="7" />
            <path d="M48 33h144M59 25h2m7 0h2m7 0h2" />
            <rect x="60" y="45" width="34" height="27" rx="4" />
            <rect x="103" y="45" width="34" height="27" rx="4" />
            <path d="M148 49h30m-30 11h23m-23 11h16" />
          </>
        )}
      </g>
    </svg>
  );
}

export function DashboardFeatures() {
  return (
    <section aria-labelledby="features-title" className="feature-hub">
      <div className="dashboard-section-heading">
        <div>
          <h2 id="features-title">Semua menu</h2>
        </div>
      </div>
      <div className="feature-grid">
        {features.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className={`feature-card tone-${item.tone}`}
          >
            <div className={`feature-cover feature-cover-${item.art}`}>
              <span className="feature-group">{item.group}</span>
              <FeatureArt kind={item.art} />
            </div>
            <div className="feature-body">
              <div className="feature-title">
                <span className="shortcut-icon">
                  <Icon name={item.icon} />
                </span>
                <h3>{item.title}</h3>
              </div>
              <p>{item.description}</p>
              <div className="feature-tags">
                {item.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <span className="feature-action">
                {item.action}
                <Icon name="arrow" size={18} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
