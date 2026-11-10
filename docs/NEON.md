# Neon untuk Padel Score

Proyek `padel score` (`broad-band-54092981`) berada di organisasi
`org-gentle-rice-56746585`, region Singapura (`aws-ap-southeast-1`).
Branch rilis adalah `production` (`br-blue-king-az7ipm4i`).
Seluruh konfigurasi dan kredensial di sini khusus repository `padelscore`.

## Integrasi layanan

- **Postgres:** route Next.js tetap menggunakan Prisma 5.22 dan autentikasi JWT
  aplikasi. `DATABASE_URL` memakai koneksi pooled; `DATABASE_URL_UNPOOLED`
  memakai koneksi direct untuk migrasi. Keduanya harus menunjuk branch,
  database, dan role yang sama. Dua migrasi repository sudah diterapkan ke
  production. Migrasi tidak menyalin data lokal atau membuat akun demo.
- **Object Storage:** foto profil menggunakan bucket privat `assets` melalui
  AWS SDK. `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  dan `AWS_REGION` berasal dari Neon. Validasi gambar dan konversi WebP tetap
  dijalankan server. Setup lokal tanpa variabel Neon tetap mendukung variabel
  `S3_*` sebelumnya.
- **Functions:** `functions/scorefeed.ts` menerbitkan sealed query setelah
  memeriksa `PADEL_FUNCTION_SECRET`. Route `/api/v1/live/[kind]/[id]` memeriksa
  akses pengguna sebelum memanggil `NEON_FUNCTION_SCOREFEED_BASE_URL`.
  `neon.ts` mengirim kredensial realtime ke Function menggunakan alias
  `PADEL_REALTIME_URL` dan `PADEL_REALTIME_SECRET`; `DATABASE_URL` disediakan
  runtime Function. Function contoh `hello` dari inisialisasi tetap tersedia.
- **Realtime:** `useSSE` menghubungkan tampilan skor ke Neon WebSocket dan
  memperpanjang sealed query sebelum kedaluwarsa. SQL hanya mengirim kolom
  skor dan memeriksa status publikasi serta hak pengguna pada setiap hasil.
  Pencabutan publikasi menghapus hasil dari langganan publik yang sudah aktif.
  Transport SSE lama digunakan hanya ketika konfigurasi Neon belum tersedia.

Semua secret hanya berada di server. Jangan memberi awalan `NEXT_PUBLIC_`
pada secret, URL database berkredensial, atau kunci storage.

## Konfigurasi lokal dan deployment backend

CLI global berada di `~/.npm-global/bin/neon`. Jika shell belum mengenali
`neon`, buka Terminal baru atau gunakan `npx neon@latest` sebagai pengganti.
Login menggunakan `neon login` jika sesi akun habis.

File `.env`, `.env.neon-production`, `.env.neon-development`, `.env.before-neon`,
dan `.neon` diabaikan Git. Salinan production menonaktifkan
`TEMPORARY_BUTTON_LOGIN`; fitur tersebut hanya untuk preview lokal.

Jalankan perintah dari root Padel Score. Pastikan remote adalah
`https://github.com/alifindra-pro/padelscore.git` sebelum mengubah konfigurasi.

```bash
neon checkout production --no-env-pull
neon env pull --branch production --file .env --service postgres --service realtime --service object-storage --service functions
npx prisma migrate status
npm run build
npm start
```

`env pull` mempertahankan variabel aplikasi yang sudah ada, termasuk
`JWT_SECRET` dan `PADEL_FUNCTION_SECRET`. Jangan mengganti secret hanya pada
salah satu sisi aplikasi/Function. Untuk perubahan Function atau konfigurasi:

```bash
neon deploy --branch production --env .env
```

Jika CLI melaporkan konflik pengaturan branch, baca perbedaannya dahulu.
Gunakan `--update-existing` hanya untuk menerapkan perubahan yang dimaksud.

`PADEL_APP_ORIGINS` adalah daftar origin yang dipisahkan koma. Verifikasi lokal
menggunakan `http://localhost:3100`, `http://127.0.0.1:3100`, dan
`http://127.0.0.1:3199`. Origin frontend publik
`https://padelscore-swart.vercel.app` sudah terdaftar di Realtime production.
Origin Vercel lama `https://padelscore-padel-score.vercel.app` juga dipertahankan.
Perubahan origin diterapkan melalui `neon realtime enable --allowed-origin`
tanpa mengganti secret atau menerbitkan ulang Function yang tidak berubah.
Frontend Next.js sudah di-host pada Vercel Hobby dengan env production dan
login sementara nonaktif; lihat [konfigurasi Vercel](VERCEL.md).

Hindari `.env.local` dengan koneksi berbeda, karena Next.js memprioritaskannya.
Restart server setelah mengganti env. Server lokal utama menggunakan port 3100.

## Pengujian

```bash
npm run build
npx vitest run src/engines packages/core/tests tests/unit
# Terminal pertama, setelah build:
NODE_ENV=production node --env-file=.env.neon-production node_modules/next/dist/bin/next start --port 3199 --hostname 127.0.0.1
# Terminal kedua:
node --env-file=.env.neon-production tests/browser/neon-services.cjs
```

Skrip memerlukan Google Chrome pada path macOS yang tercantum di skrip.
Pengujian membuat akun, organisasi, turnamen, dan foto sementara, lalu
membersihkannya. Tes memakai layanan cloud asli, bukan mock: login database,
unggah/unduh/hapus foto, otorisasi Function, skor 15 dan 30 di browser,
perpanjangan langganan, dan pencabutan publikasi. Browser tidak diperbolehkan
menggunakan SSE lama dalam tes tersebut.

`tests/browser/quick-tournament.cjs` juga memeriksa alur membuat turnamen,
scoring, pengesahan, TV/PDF, serta ukuran layar 390, 768, dan 1920 piksel.
Verifikasi browser otomatis ini tidak menggantikan pengujian Safari pada iPad
fisik.

## Lingkungan pengembangan sebelumnya

Pembaruan 6 November 2026 menambahkan migrasi ketiga,
`20261106020000_tournament_sponsors_disputes`, untuk sponsor per turnamen dan
sanggahan hasil. Migrasi diuji pada branch development sebelum diterapkan ke
production. Logo memakai bucket aset yang sudah ada, dengan prefix sponsor
per turnamen; tidak ada layanan atau paket berbayar baru.

Branch `dev-neon-setup` (`br-round-cell-azzw7ax2`) memiliki masa berlaku sampai
**7 November 2026 pukul 19.00 WIB**. Salinan env-nya tersedia lokal di
`.env.neon-development`. Untuk kembali, pilih branch tersebut dan pulihkan
salinan env, kemudian restart server. Jangan menimpa env production tanpa
memeriksa target. `.env.before-neon` menyimpan konfigurasi PostgreSQL lokal
sebelumnya; bila memulihkannya, isi juga `DATABASE_URL_UNPOOLED`.

## Hasil verifikasi 2 November 2026

- Deployment production berhasil untuk Postgres, Object Storage, Functions,
  dan Realtime. Kedua migrasi database berhasil diterapkan.
- Build Next.js 16.4.3 berhasil; TypeScript lulus dan 33 halaman dihasilkan.
- 78 uji logika pada enam berkas lulus.
- `neon-services.cjs` pada production keluar dengan kode 0:
  `ALL FOUR NEON SERVICES PASS END TO END` dan
  `Verification fixtures cleaned up`.
- Pengujian alur turnamen hingga TV/PDF lulus pada branch development.
- Build akhir menyajikan halaman login dengan HTTP 200; endpoint login
  sementara mengembalikan HTTP 404.
- Pemeriksaan setelah pengujian: tidak ada akun uji atau turnamen tersisa di
  production. Tidak ada seed demo yang dijalankan.
- Lint berkas integrasi dan `git diff --check` lulus.

Deployment awal sempat berhenti karena perbedaan `allowedOrigins`; pengaturan
tersebut diperiksa lalu diterapkan dengan `--update-existing`. Function awal
juga memerlukan kredensial realtime eksplisit; alias server di `neon.ts`
memperbaikinya. Kedua masalah tersebut selesai sebelum tes production lulus.
Frontend Vercel diterbitkan pada 3 November 2026 di
`https://padelscore-swart.vercel.app`. Domain tersebut sudah tercantum pada
`PADEL_APP_ORIGINS` lokal dan allowed origins Realtime production. Paket Neon
tetap Free. Organisasi Padel Score dan akun pemiliknya sudah aktif. Admin
membuat akun wasit/staf dari menu **Akun & organisasi**; alurnya dijelaskan di
[panduan Vercel](VERCEL.md#akun-admin-dan-tim).

## Foto per pemain — 7 November 2026

Lima migrasi telah diterapkan pada development dan production. Dua migrasi
terakhir mempertahankan urutan eksperimen development: `saved_pairs` sementara
dibuat lalu dihapus saat kebutuhan dikoreksi menjadi foto per orang.
Skema akhir menambahkan kolom nullable `players.photoKey` tanpa mengubah data
pemain atau pertandingan yang sudah ada. Foto menggunakan bucket `assets`
yang sudah tersedia, dengan key `avatars/players-{id}/...`; tidak ada layanan
penyimpanan baru. Foto draf memerlukan akses organisasi.

## Branch pengujian pendaftaran — 8 November 2026

Branch sebelumnya telah kedaluwarsa. Pengujian baru memakai `dev-registration`
(`br-floral-smoke-azk1z9u7`), turunan production, dengan masa berlaku sampai
10 November 2026 pukul 19.00 WIB. `.env.neon-development` menyimpan URL baru.
Tidak ada perubahan paket atau migrasi skema untuk alur slot/pendaftaran.
