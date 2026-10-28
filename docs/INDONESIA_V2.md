# Padel Indonesia — status penerapan

Dokumen ini memperbarui klaim penyelesaian dalam audit/rencana lama. Keberadaan kode bukan bukti bahwa seluruh kriteria rilis sudah lulus.

## Alur pengelola dan desain

Antarmuka Court Kinetic berbahasa Indonesia menggunakan font lokal, warna biru/navy, permukaan putih, dan lime untuk keadaan aktif. Ruang turnamen memiliki empat langkah: **Siapkan acara → Tambah peserta → Atur pertandingan → Jalankan & hasil**. Pengaturan aturan per fase/babak ada di halaman lanjutan. Pemain dimasukkan admin tanpa akun; tautan acara publik tidak memerlukan login. Foto hanya untuk pengelola.

Navigasi samping desktop menjadi menu pada ponsel. Formulir, kartu, dan tombol menyesuaikan lebar; bagan memiliki area gulir sendiri. Uji browser menggunakan Chrome lokal pada lebar 390, 768, dan 1440 piksel. Skrip `tests/browser/tournament-flow.cjs` membuat data uji dan membersihkannya, menguji pembuatan acara, kategori, lapangan, pasangan, drawing, jadwal, serta empat langkah pada ketiga ukuran.

## Komponen yang tersedia

- Migrasi tambahan organisasi, pengelola, venue bersama, profil pemain tanpa akun, metadata federasi, sesi mobile, aksi skor, dan acara sosial. Backfill tidak menghapus pertandingan lama; mesin v1 tetap menangani pertandingan lama yang sudah aktif.
- Adapter akses API v1 dan API v2 dengan pembatasan organisasi, penugasan wasit, serta proyeksi data publik.
- Paket `packages/core`: skor integer, Advantage/Golden/Star Point, tujuh preset, timed match lokal, replay/undo, urutan servis; drawing, klasemen, Americano/Mexicano, validasi jadwal dan persyaratan kategori.
- Konsol web v2 dengan IndexedDB, antrean persisten, versi perangkat, penerimaan idempoten, konflik, serta finalisasi dan pengesahan terpisah.
- Aplikasi Expo dengan penonton tanpa akun, login wasit, SecureStore, SQLite, antrean offline dan polling snapshot. Typecheck dan ekspor bundle Android/iOS berhasil.
- Penyimpanan foto memakai sharp dan S3; Redis meneruskan event SSE antarpeladen bila dikonfigurasi.

## Menjalankan

Gunakan PostgreSQL yang telah dikonfigurasi melalui `DATABASE_URL`. Set `JWT_SECRET` acak yang kuat. Jalankan `npm ci`, `npx prisma migrate deploy`, `npx prisma generate`, lalu `npm run dev`. Jangan menjalankan seed pada basis data produksi tanpa meninjau isinya.

Untuk Redis/MinIO lokal, isi variabel berikut pada `.env` (jangan commit kredensial):

```dotenv
REDIS_URL=redis://127.0.0.1:6379
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=padel
S3_ACCESS_KEY=<nama-akses-lokal>
S3_SECRET_KEY=<rahasia-lokal-yang-kuat>
```

Jalankan `docker compose --env-file .env -f compose.dev.yml up -d`. Bucket bersifat privat; foto diambil melalui endpoint profil yang memeriksa sesi. Docker belum tersedia pada mesin pengujian ini, sehingga integrasi MinIO/Redis belum diuji langsung.

Mobile: `cd apps/mobile && npm ci`, set `EXPO_PUBLIC_API_URL` ke URL server yang dapat dijangkau perangkat, lalu `npx expo start`. Bundle pengujian: `npx expo export --platform all`. Profil EAS ada di `eas.json`; akun, signing, identitas aplikasi final, dan emulator/perangkat diperlukan untuk build serta uji native. Ekspor JavaScript bukan APK/IPA dan bukan publikasi toko aplikasi.

## Verifikasi dan batas penerimaan

Build Next.js, pemeriksaan TypeScript, 98 tes unit/integrasi, ekspor Expo, dan uji alur browser sudah dijalankan. Uji browser juga memutus jaringan, menyimpan aksi mulai pertandingan dan poin pada perangkat, kemudian memverifikasi sinkronisasi kembali ke server tanpa duplikasi. Uji browser memerlukan akun super admin lokal dan `JWT_SECRET`, bukan kata sandi yang disimpan dalam skrip. `CHROME_PATH` dapat menunjuk executable Chrome setempat.

Masih memerlukan pekerjaan/verifikasi sebelum menyatakan seluruh rencana selesai:

- Pengujian perangkat Android/iOS, aplikasi ditutup/dibuka saat offline, dan cache browser setelah reboot; simulator Android/Xcode tidak tersedia pada mesin ini.
- Pengujian langsung penyimpanan foto, penghapusan objek lama, distribusi Redis lintas proses, serta provisioning lingkungan rilis.
- Alur admin penyelesaian dampak koreksi hasil yang telah disahkan dan babak lanjutan: propagasi saat ini ditolak jika target sudah dimulai; belum ada UI rekonsiliasi lengkap.
- Penjadwalan otomatis kini mencari waktu/lapangan alternatif ketika reservasi eksternal berbenturan, termasuk identitas lapangan venue bersama, jeda pemain sebelum/sesudah reservasi, dan ketergantungan babak. Perhitungan dilakukan dalam transaksi setelah penguncian sumber daya. Pada 13 Oktober 2026, delapan tes mesin penjadwalan (lima skenario baru), TypeScript, dan lint file yang diubah lulus. Uji integrasi database sesi ini belum dapat diverifikasi karena PostgreSQL `localhost:5432` tidak terjangkau; hasil seluruh suite: 70 lulus, 2 gagal, 31 dilewati akibat koneksi database.
- Seluruh kombinasi double elimination/bye/reset final, kebijakan wildcard/qualifier/lucky loser, dan kelolosan grup tidak seimbang perlu pengujian penerimaan tambahan.
- Feature flags bertahap, dashboard observabilitas, serta audit keamanan produksi belum menjadi batas rilis yang diverifikasi.
- Per 18 Oktober 2026 lint seluruh repositori bersih (0 error, 0 warning) tanpa menonaktifkan aturan secara global; pengecualian hanya untuk `require()` di file CommonJS dan satu `<img>` avatar privat, masing-masing dengan alasan tertulis.

Pembayaran, booking komersial, akun member, foto pemain, integrasi resmi PBPI, dan publikasi App Store/Google Play tidak termasuk rilis ini. Metadata federasi adalah pencatatan admin, bukan pengesahan otomatis.
