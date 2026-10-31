# 🎾 Padel Tournament OS

> Status implementasi terbaru dan batas verifikasi: [docs/INDONESIA_V2.md](docs/INDONESIA_V2.md). Klaim selesai dalam bagian lama tidak mencakup seluruh rencana Indonesia v2.

> Platform Manajemen Turnamen Padel Terpadu: Penjadwalan Otomatis, Live Scoring Real-Time (SSE), Bagan & Upacara Undian 3D (*Live Draw Ceremony*), Konsol Wasit Mobile, dan Statistik Karir Atlet.

---

## 🌟 Fitur Utama

1. **Upacara Pengundian Resmi (*Live Draw Ceremony*)**:
   - Animasi bola padel 3D yang berputar dengan efek suspensi acak (*ball shuffle*).
   - Mode undian interaktif: langkah-demi-langkah (*manual draw*) atau putaran otomatis (*auto-draw*).
   - Efek konfeti perayaan dan pembuatan bagan sistem gugur atomik.
2. **Sistem Scoring Padel Murni (*Pure Scoring Engine*)**:
   - Mendukung format standar FIP / Premier Padel: 0-15-30-40, Advantage / Deuce, Golden Point (*Punto de Oro*), Tiebreak (7 poin, selisih 2), dan Super Tiebreak 10 poin.
   - Rotasi server permainan dan rotasi tiebreak otomatis.
   - Riwayat event audit log, replay state deterministik, dan undo score instan.
3. **Konsol Wasit Khusus Mobile (*Mobile Referee Console*)**:
   - Desain layar sentuh dengan tombol masukan poin ekstra besar.
   - Deteksi koneksi internet dengan peringatan offline.
   - *Optimistic Concurrency Control* via nomor versi (`version`) dan *Idempotency Keys* untuk mencegah request ganda.
4. **Live Score Real-Time (*Server-Sent Events / SSE*)**:
   - Pembaruan skor langsung instan tanpa refresh halaman.
   - Rekonsiliasi state otomatis saat browser penonton kembali terhubung.
   - Papan skor siaran langsung (*broadcast scoreboard*) yang dapat dibagikan per pertandingan.
5. **Mesin Turnamen & Penjadwalan Lapangan Otomatis**:
   - Generator bagan Single Elimination dengan penempatan unggulan (*seeded pairs*) dan BYE advancement.
   - Format Round Robin (algoritma Berger) dan Group Stage + Knockout.
   - Format rotasi ganda berpasangan dinamis (**Americano & Mexicano**).
   - Alokasi multi-lapangan otomatis yang menghitung durasi match dan waktu istirahat minimal atlet.
6. **Statistik Karir Atlet & Riwayat Pertandingan**:
   - Pelacakan Win Rate %, total match dimainkan/menang/kalah, selisih set, selisih game, dan gelar juara.
   - Rekam jejak pertandingan turnamen lengkap dengan skor per set.
   - Peringkat atlet (*Leaderboard*).
7. **Autentikasi & RBAC (Role-Based Access Control)**:
   - Keamanan hashing password menggunakan bcrypt (12 salt rounds).
   - Session aman via JWT HttpOnly cookie.
   - Hak akses berjenjang: `SUPER_ADMIN`, `ORGANIZER`, `REFEREE`, dan `VIEWER`.

---

## 🛠 Teknologi

* **Frontend**: Next.js 16 (App Router + Turbopack), React 19, TypeScript, Tailwind CSS.
* **Backend**: Next.js Route Handlers, Zod schema validation, Service Layer terstruktur.
* **Database & ORM**: PostgreSQL 16, Prisma ORM 5.22.
* **Real-time**: Server-Sent Events (SSE) dengan In-Memory Event Bus (`MatchEventBus`).
* **Pengujian**: Vitest (50 Unit & Integration Tests, 100% Passing).

---

## 🚀 Panduan Memulai Cepat

### 1. Prasyarat
* Node.js v20+ atau v24+
* PostgreSQL 16 aktif di `localhost:5432`

### 2. Instalasi & Setup Database
```bash
# Clone dan masuk ke direktori
cd padel-tournament-os

# Salin variabel lingkungan
cp .env.example .env

# Jalankan migrasi Prisma ke PostgreSQL
npx prisma migrate deploy

# Isi data awal (seed showcase turnamen, pemain pro, dan pertandingan live)
npm run db:seed
```

### 3. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka browser pada **[http://localhost:3100](http://localhost:3100)**.

Repository proyek ini: https://github.com/alifindra-pro/padelscore.git. Jalankan perintah dari folder proyek ini dan gunakan konfigurasi serta database khusus proyek ini. `npm start` juga memakai port `3100` secara default; server produksi dapat mengaturnya melalui variabel lingkungan `PORT`.

Untuk aplikasi mobile di HP fisik, atur `EXPO_PUBLIC_API_URL` ke alamat jaringan server Padel Score, misalnya `http://192.168.1.10:3100`. `localhost` pada HP merujuk ke HP tersebut.

---

## 🔑 Akun & Kredensial Pengujian (Hasil Seed)

| Peran | Email | Kata Sandi | Deskripsi Akses |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@padelos.com` | `PadelAdmin2026!` | Kontrol penuh seluruh turnamen, akun, dan lapangan. |
| **Organizer** | `organizer@padelos.com` | `Organizer2026!` | Mengelola turnamen, bagan, undian, dan jadwal. |
| **Wasit 1 (Chair Umpire)** | `wasit1@padelos.com` | `WasitPadel2026!` | Ditugaskan memimpin live match di Center Court GBK. |
| **Wasit 2 (Line Umpire)** | `wasit2@padelos.com` | `WasitPadel2026!` | Akun wasit cadangan untuk pengujian. |
| **Penonton (Viewer)** | `viewer@padelos.com` | `ViewerPadel2026!` | Akun umum untuk memantau turnamen. |

---

## 🔗 Tautan Akses Cepat Showcase

* **Portal Publik Penonton**: [http://localhost:3100/tournament/jakarta-premier-2026](http://localhost:3100/tournament/jakarta-premier-2026)
* **Papan Skor Siaran Langsung**: [http://localhost:3100/match/b5f41589-2767-47ac-80b1-d8588ebc5ab0](http://localhost:3100/match/b5f41589-2767-47ac-80b1-d8588ebc5ab0)
* **Konsol Wasit Mobile**: [http://localhost:3100/referee](http://localhost:3100/referee)
* **Dashboard Admin Turnamen**: [http://localhost:3100/admin](http://localhost:3100/admin)
* **Direktori & Statistik Atlet**: [http://localhost:3100/admin/players](http://localhost:3100/admin/players)

---

## 🧪 Pengujian & Build

```bash
# Menjalankan seluruh 50 unit dan integration tests
npm run test

# Menjalankan kompilasi build produksi Next.js
npm run build
```

---

## 📄 Lisensi
MIT License.
