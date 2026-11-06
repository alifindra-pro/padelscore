# Vercel untuk demo Padel Score

Checkout ini terhubung ke proyek `padelscore` pada workspace `padel-score`
(Padel Score), paket Hobby. Pengguna menetapkan penggunaan demo pribadi
nonkomersial. URL production yang tercatat di Vercel adalah
`https://padelscore-swart.vercel.app`.

## Konfigurasi repository

- `vercel.json`: framework Next.js, region `sin1` (Singapura), build
  `npm run vercel-build`, dan durasi maksimum API 60 detik.
- `package.json`: Node.js `24.x`, sesuai versi lokal yang diuji. Script
  `vercel-build` menjalankan `prisma generate` sebelum `next build` agar cache
  dependency Vercel tidak menggunakan Prisma Client lama.
- Build tidak menjalankan migrasi atau seed. Dua migrasi Neon production sudah
  diterapkan dalam pekerjaan backend sebelumnya.
- `.vercelignore` mengecualikan env, kredensial/konteks lokal, dependency,
  artefak build, aplikasi mobile, dokumen, dan tes dari unggahan CLI.
- `isTemporaryLoginEnabled()` menolak login sementara pada production dan
  Vercel, termasuk ketika `TEMPORARY_BUTTON_LOGIN=true`. API dan halaman login
  menggunakan pemeriksaan yang sama.

Referensi: [Prisma pada Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel),
[versi Node.js Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Variabel yang disiapkan untuk environment Production

Nilai berasal dari `.env.neon-production` khusus Padel. Kredensial tidak boleh
ditulis ke `vercel.json`, repository, argumen shell, atau output terminal.
Gunakan stdin CLI dan tipe Secret untuk nilai sensitif.

| Nama di Vercel | Sumber | Penyimpanan |
| --- | --- | --- |
| `DATABASE_URL` | Koneksi pooled Neon production | Secret |
| `DATABASE_URL_UNPOOLED` | Koneksi direct Neon production | Secret |
| `JWT_SECRET` | Secret sesi Padel production | Secret |
| `JWT_EXPIRES_IN` | Pengaturan sesi yang ada | Config |
| `NEON_BRANCH` | `production` | Config |
| `NEON_FUNCTION_SCOREFEED_BASE_URL` | URL Function scorefeed production | Config |
| `PADEL_FUNCTION_SECRET` | Secret bersama aplikasi dan Function | Secret |
| `S3_ENDPOINT` | `AWS_ENDPOINT_URL_S3` dari Neon | Config |
| `S3_REGION` | `AWS_REGION` dari Neon | Config |
| `S3_BUCKET` | `assets` | Config |
| `S3_ACCESS_KEY` | `AWS_ACCESS_KEY_ID` dari Neon | Secret |
| `S3_SECRET_KEY` | `AWS_SECRET_ACCESS_KEY` dari Neon | Secret |
| `TEMPORARY_BUTTON_LOGIN` | `false` | Config |
| `NEXT_PUBLIC_APP_URL` | URL HTTPS frontend | Config |

Nama `S3_*` menggunakan adapter storage yang sudah didukung aplikasi. Secret
Realtime tetap dikelola oleh Neon Function; frontend memperoleh sealed query
melalui route aplikasi. Jangan menyalin `NODE_ENV`, token CLI/OIDC, atau
`TEMPORARY_LOGIN_EMAIL` ke konfigurasi hosting.

Preview perlu branch Neon serta konfigurasi service tersendiri. Jangan
menyalin kredensial production ke environment Preview secara otomatis.

## Status deployment 6 November 2026

Login Vercel dan link proyek berhasil. Build produksi, TypeScript, 11 tes
proteksi login, lint berkas yang diubah, dan `git diff --check` lulus.
Pada server lokal yang meniru runtime Vercel, halaman login mengembalikan 200
dan endpoint login sementara mengembalikan 404 meskipun flag diaktifkan.
Pengujian `neon-services.cjs` juga lulus pada build produksi lokal menggunakan
pemetaan `S3_*` yang direncanakan untuk Vercel: login database, upload/download/
delete foto, otorisasi Function, skor realtime di browser, renewal, dan pencabutan
publikasi. Semua fixture dibersihkan. Setelah batas foto diperbarui, build akhir
dan lint lulus; pemeriksaan ukuran menolak file kosong dan lebih dari 4 MB,
sedangkan file tepat 4 MB diteruskan ke validasi isi gambar.

Setelah pengguna menyetujui transfer kredensial dan publikasi, seluruh 14
variabel pada tabel tersimpan di environment Production. Deployment
`dpl_2zmXxdwGmwAPeQuiS4JgwUik9bPJ` berstatus `READY` dan domain publik di atas
dapat diakses tanpa login Vercel. Halaman login mengembalikan HTTP 200 dan
login sementara HTTP 404. URL deployment khusus tetap memakai proteksi Vercel.

`NEXT_PUBLIC_APP_URL` dan origin Realtime Neon sudah menggunakan domain publik.
Origin lokal yang diperlukan tetap dipertahankan. Domain
`padelscore-padel-score.vercel.app` memerlukan autentikasi Vercel; gunakan domain
publik `padelscore-swart.vercel.app` untuk demo.

Pengujian browser pada domain publik berhasil untuk alur membuat turnamen,
penugasan wasit, skor live, pemulihan koneksi, finalisasi, pengesahan, layar TV,
unduhan PDF, ukuran layar berbeda, dan pencabutan publikasi. Fixture tes
dibersihkan setelah pengujian. `neon-services.cjs` juga lulus melalui domain
Vercel: login Postgres, upload/download/delete foto pada Object Storage,
otorisasi Function, skor realtime di browser, pembaruan sealed query, dan
pencabutan akses publik. Hasil akhir: `ALL FOUR NEON SERVICES PASS END TO END`.

Alur aktivasi undangan diuji dengan fixture terpisah: membuat akun ORGANIZER
dengan keanggotaan OWNER, menolak penggunaan ulang, dan berhasil login melalui
cookie Secure. Undangan OWNER awal untuk pengelola sudah disiapkan pada
organisasi Padel Score. Pengguna menetapkan nama pengguna dan kata sandinya
sendiri melalui tautan sekali pakai yang berlaku tujuh hari. Tautan disimpan
hanya di berkas lokal `.env.bootstrap-invitation` yang diabaikan Git dan
unggahan Vercel; jangan menyalinnya ke dokumentasi atau repository.

Login web menerima nama pengguna atau email penerima undangan. Nama pengguna
memperhatikan huruf besar/kecil; email dinormalisasi ke huruf kecil. Nama lengkap
tetap menjadi nama tampilan. Payload API lama `{ email, password }` tetap
didukung. `login-identity.cjs` lulus pada build lokal dan domain Vercel untuk
aktivasi, kedua pilihan login, penolakan kata sandi salah, kompatibilitas API,
dan penolakan penggunaan ulang undangan. Seluruh fixture tes dibersihkan;
21 tes unit autentikasi, build/TypeScript, dan lint juga lulus.

## Akun admin dan tim

Akun pemilik organisasi Padel Score sudah aktif dan tampil sebagai **Admin
utama** pada menu **Akun & organisasi**. Gunakan kredensial akun tersebut untuk
membuat akun tim; tidak perlu aktivasi ulang atau akun admin duplikat.

Pada bagian **Buat akun**, admin mengisi nama lengkap, email, nama pengguna,
kata sandi minimal 10 karakter, dan peran Wasit, Staf, atau Admin. Akun langsung
aktif; admin membagikan kredensial kepada pemilik akun secara pribadi. Aplikasi
tidak mengirim email dan tidak menampilkan kembali kata sandi setelah tersimpan.
Wasit masuk ke ruang wasit; staf dan admin masuk ke dashboard pengelola.

Endpoint `POST /api/v2/staff/accounts` memeriksa hak OWNER/ADMIN pada organisasi
tujuan, menyimpan hash kata sandi, dan membuat akun beserta keanggotaan secara
atomik. Konflik email/nama pengguna menghasilkan 409 tanpa mengubah akun lama.
Formulir tidak tersedia untuk staf. API juga menolak staf, wasit, akses anonim,
organisasi lain, dan permintaan peran SUPER_ADMIN/OWNER. Pendaftaran umum tetap
tertutup. Alur undangan lama tetap tersedia untuk kompatibilitas.

Build, TypeScript, lint, 38 tes unit autentikasi/hak akses, dan uji browser lokal
serta domain production Vercel menggunakan
`tests/browser/staff-accounts.cjs` lulus. Uji browser mencakup pembuatan ketiga
peran, login, tampilan pada lebar 390/768/1440, konflik identitas, dan pembatasan
akses. Fixture tes dibersihkan.

Paket tetap Vercel Hobby dan Neon Free. Tidak ada upgrade paket, add-on
berbayar, atau pembelian domain. Demo tetap mengikuti kuota dan ketentuan
penggunaan pribadi/nonkomersial paket tersebut.

Vercel membatasi payload Function 4,5 MB. Batas foto aplikasi ditetapkan 4 MB
di browser dan server, sehingga masih tersedia ruang untuk header multipart.
Lihat [batas Vercel Functions](https://vercel.com/docs/functions/limitations).

## UI dan pengaturan turnamen — 4 November 2026

Formulir pembuatan turnamen kini memiliki tiga langkah, kartu pilihan dengan
penjelasan singkat, serta ringkasan sebelum menyimpan. Pengaturan sistem
pertandingan, jumlah set, dan deuce memakai kartu yang sama di halaman kelola
turnamen dan pengaturan lanjutan.

Americano dan Mexicano tersedia langsung pada formulir tersebut. Pengelola
dapat menentukan total poin per pertandingan (preset 16/24/32 atau angka
1–200), jumlah ronde (1–100), peringkat berdasarkan total atau rata-rata poin,
dan pola pasangan Mexicano. Contoh pembagian poin menjelaskan bahwa skor
pasangan diberikan kepada setiap pemainnya. Peserta diisi sebagai individu.

Acara sosial dibuat sebagai draf dengan ronde pertama, lokasi, waktu, dan zona
waktu; acara juga tampil pada daftar Turnamen. Pembuatan atomik dan idempoten
mencegah duplikasi saat permintaan diulang. Total skor kedua pasangan harus
sesuai pengaturan. Tidak diperlukan migrasi skema database.

Build/TypeScript, lint, dan 42 tes core/integrasi lulus. Uji browser pengaturan
turnamen lulus di lokal dan domain production, mencakup navigasi keyboard,
validasi peserta, Americano 24 poin, peringkat, ronde berikutnya, penyimpanan
Golden Point, dan tampilan 390/768/1440 piksel. Alur turnamen standar hingga
skor, pengesahan, layar TV, dan PDF juga lulus pada deployment terbaru.
Fixture dibersihkan setelah tes.
Tidak ada perubahan paket layanan atau penambahan layanan berbayar.

## Branding dan akun admin khusus — 4 November 2026

Branding publik, login, dashboard, metadata halaman, dan PDF hasil memakai
**Padel Score by Padel Addictive**. Logo menampilkan nama produk di baris utama
dan atribusi Padel Addictive di bawahnya.

Akun admin khusus yang diminta pengguna dibuat pada organisasi Padel Score
dengan peran ADMIN. Identitas login khusus tersebut diterima oleh kolom
nama pengguna/email yang sudah ada; tidak digunakan sebagai alamat pengiriman
email. Kata sandi awal disimpan sebagai hash bcrypt dan tidak disertakan dalam
kode, dokumentasi, atau unggahan deployment. Akun pemilik sebelumnya dipertahankan.

Menu **Profil saya → Ubah kata sandi** meminta kata sandi saat ini dan konfirmasi
kata sandi baru (minimal 10 karakter). Endpoint hanya mengubah akun sesi aktif,
memvalidasi batas 72 byte bcrypt, dan menolak perubahan bersamaan yang memakai
hash lama. Kata sandi lama tidak bisa dipakai untuk login setelah perubahan;
sesi web yang sudah aktif tetap berlaku sesuai masa berlaku token sebelumnya.

Build/TypeScript, lint, dan 17 tes unit login/perubahan kata sandi lulus.
Uji browser lokal dan production Vercel memeriksa branding pada ponsel/desktop, penolakan akses anonim,
kata sandi lama salah, konfirmasi berbeda, penyimpanan hash, serta login dengan
kata sandi baru. Akun fixture dibersihkan. Login akun khusus dan akses ke
organisasi Padel Score juga diverifikasi tanpa mengganti kata sandinya.

## Sistem gugur dengan poin langsung — 6 November 2026

Pilihan **Cara hitung skor** terpisah dari sistem pertandingan. Sistem gugur
dengan pasangan tetap dapat memakai game/set atau poin langsung. Total poin
gabungan dapat diatur 1–200, dengan tombol 16/24/32 poin. Semua poin dimainkan;
contoh total 24 menghasilkan 15–9. Pada 12–12, satu poin tambahan menghasilkan
pemenang 13–12. Servis berganti setiap empat poin dan sisi lapangan setiap
delapan poin. Ini aturan komunitas yang ditampilkan pada pengaturan acara.

Pengaturan tersedia pada pembuatan turnamen, menu atur pertandingan, dan
pengaturan lanjutan kategori/babak. Mesin skor mendukung replay, undo, fault,
koreksi, dan finalisasi. Skor numerik disimpan tanpa game/set fiktif, lalu
ditampilkan pada konsol wasit, bagan, detail laga, TV, dan PDF. Pengesahan admin
tetap diperlukan sebelum pemenang masuk ke babak berikutnya. Tidak ada migrasi
database atau layanan berbayar tambahan.

Sebanyak 49 tes core dan delapan tes integrasi lulus, termasuk seri/poin penentu,
batas konfigurasi, servis, undo, serta kemajuan bagan setelah pengesahan.
Uji browser lokal dan production mencakup pembuatan turnamen gugur 24 poin, hasil 12–13,
sinkronisasi, TV, PDF, dan tampilan ponsel/desktop. PDF diperiksa memuat skor
poin, bukan skor set. Alur pengaturan Americano dan game/set juga tetap lulus.
Penyimpanan poin langsung 32 lalu 24 poin pada pengaturan lanjutan dan halaman
kelola turnamen juga lulus. Seluruh fixture uji dibersihkan setelah pemeriksaan.

## Sponsor, sanggahan, dan bracket — 6 November 2026

Admin membuka **Kelola turnamen → Sponsor & sanggahan peserta** untuk mengunggah
logo sponsor dan meninjau sanggahan. Setiap turnamen memiliki daftar sendiri,
maksimal 12 sponsor. JPEG/PNG/WebP maksimal 4 MB diproses menjadi WebP tanpa
mengubah proporsi logo. Sponsor draf hanya terlihat bagi pengguna berizin.

Peserta membuka **Sanggah hasil**, memilih laga selesai, lalu mengisi nama,
kontak, dan alasan. Identitas pengaju bersifat pernyataan peserta dan perlu
diperiksa panitia. Kontak serta alasan tidak ditampilkan dalam daftar publik.
Kode pelacakan rahasia diberikan sekali; peserta menyimpannya untuk melihat
keputusan dan tanggapan admin. Pengajuan dibatasi lima per alamat jaringan per
jam dan satu sanggahan tertunda per kontak/laga. Tidak ada pengiriman email.
Keputusan menerima/menolak tidak otomatis mengubah skor atau kemajuan bracket.

Halaman publik memisahkan knockout dan klasemen grup. Bagan menampilkan ronde,
garis penghubung, pemenang, dan tautan detail laga; grup menampilkan klasemen,
progres pengesahan, serta jadwal yang dapat dibuka. Tampilan diuji pada lebar
390 dan 1440 piksel. Implementasi dibuat sendiri berdasarkan pengamatan halaman
publik; tidak memakai REA atau aset situs referensi.

Build/TypeScript, lint, tiga tes integrasi API, serta alur browser lokal dan
production lulus. Tes mencakup isolasi sponsor, hak akses admin, privasi draf,
validasi gambar, duplikasi/batas pengajuan, tinjauan, pelacakan rahasia, dan skor
tetap utuh. Seluruh fixture browser dibersihkan setelah pengujian.
Migrasi tambahan telah diuji di development dan diterapkan ke production.
Deployment: `dpl_6v286j86GSzh7sbrQe5gRTsCQ7Eu`.
Vercel Hobby dan Neon Free tetap digunakan tanpa layanan berbayar tambahan.
