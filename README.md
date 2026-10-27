# Stokku — Sistem Manajemen Stok, Kasir & Pengadaan Terpadu

Aplikasi web _fullstack_ terintegrasi untuk manajemen inventaris, buku besar stok (_immutable ledger_), kasir (_Point of Sale_), manajemen shift kasir, pengadaan supplier, loyalitas pelanggan, audit trail, dan pemulihan bencana (_disaster recovery_). Dibangun di atas fondasi teknologi **Node.js LTS (`node:sqlite` mode WAL)**, **Hono**, **Zod v4**, **Vite 8**, dan **Tailwind CSS v4** dengan filosofi antarmuka **Material 3 Calm Sapphire Blue**.

---

## 1. Filosofi & Prinsip Arsitektur

- **Single Source of Truth (SSOT):** Seluruh mutasi stok produk, saldo kas laci, poin reward pelanggan, dan peristiwa audit dikelola melalui buku besar _append-only_ atomik. Tidak ada operasi _in-place modification_ yang merusak histori audit.
- **Strict Concurrency Safety (`BEGIN IMMEDIATE`):** Seluruh transaksi kritis (penjualan kasir, penutupan shift, penerimaan faktur pembelian, dan void transaksi) dieksekusi dalam transaksi SQLite `IMMEDIATE` untuk mencegah _race condition_ dan selisih data.
- **Zero-Hallucination & Type-Safe Integration:** Kontrak skema Zod dan antarmuka TypeScript dibagi secara simetris antara backend dan frontend (RPC via `hono/client`).
- **Disaster Recovery WAL-Safe:** Cadangan live database dibuat secara konsisten tanpa _downtime_ atau penguncian kasir menggunakan perintah engine bawaan `VACUUM INTO`.

---

## 2. Modul Fitur Lengkap

### A. Manajemen Shift & Laci Kas (Cash Drawer Reconciliation)

- **Gerbang Shift Wajib:** Kasir diwajibkan membuka shift dengan mencatat modal kas awal sebelum diizinkan memproses penjualan POS.
- **Pencatatan Kas Operasional:** Pencatatan arus kas masuk (_Cash In_) dan kas keluar (_Cash Out_) petty cash dengan rincian alasan dan nama staf.
- **Rekonsiliasi Kas & Laporan Z-Report:** Saat penutupan shift, sistem membandingkan fisik kas akhir dengan kas yang diharapkan (_expected cash_ = modal awal + penjualan tunai + kas masuk - kas keluar), mencatat selisih (_cash discrepancy_), dan mencetak laporan Z-Report.
- **Isolasi RBAC:** Kasir hanya dapat melihat shift miliknya sendiri; Owner memiliki akses ke riwayat komprehensif seluruh shift kasir.

### B. Pengadaan Stok & Faktur Supplier (Purchasing Engine)

- **Direktori Pemasok (Supplier):** Master data rekanan pemasok dengan riwayat kontak, alamat, dan catatan kerja sama.
- **Faktur Pembelian Multi-Item:** Pencatatan pengadaan barang masuk dengan nomor faktur resmi, multi-produk, harga modal beli (_unit cost_), dan status pelunasan (_PAID_ atau _UNPAID / Tempo_).
- **Otomasi HPP Rata-Rata Tertimbang:** Saat barang diterima, sistem memperbarui HPP produk secara otomatis menggunakan rumus _weighted-average cost_:
  $$\text{HPP Baru} = \text{round}\left(\frac{(\text{Stok Lama} \times \text{HPP Lama}) + (\text{Qty Masuk} \times \text{Biaya Masuk})}{\text{Stok Akhir}}\right)$$
- **Pencatatan Stok Atomik:** Menginput mutasi `IN_PURCHASE` langsung ke kartu stok produk secara simultan.

### C. Pelanggan & Poin Loyalitas (Loyalty Rewards & Ledger)

- **Manajemen Anggota (Member):** Pencatatan nomor telepon WhatsApp/HP unik, nama pelanggan, total belanja historis (_Customer Lifetime Value_), dan frekuensi kunjungan.
- **Akumulasi Poin Belanja:** Setiap kelipatan belanja Rp 10.000 otomatis menghasilkan 1 poin reward.
- **Penukaran Diskon Kasir:** Poin dapat langsung ditukarkan saat checkout di kasir (1 poin bernilai potongan Rp 100).
- **Buku Besar Poin Immutable:** Mutasi poin (`EARNED`, `REDEEMED`, `VOID_REVERSED`, `VOID_RESTORED`, `ADJUSTMENT`) tercatat dalam `customer_point_mutations`. Jika transaksi di-void, poin yang didapat ditarik kembali dan poin yang ditukar otomatis dipulihkan.
- **Hak Akses Penyesuaian:** Penyesuaian manual poin pelanggan dibatasi ketat khusus untuk peran `OWNER` (`customers:adjust_points`).

### D. Kasir (POS) Responsif & Struk Siap Cetak

- **Antarmuka Split-View & Mobile:** Panel katalog dan keranjang belanja terpisah yang adaptif untuk desktop, tablet, dan ponsel kasir.
- **Pencarian Barcode Cepat:** Dukungan penuh pemindai _barcode scanner_ (trigger tombol `Enter`), pencarian nama/SKU, dan filter kategori.
- **Snapshot Finansial Historis:** Harga jual dan HPP tersimpan permanen pada baris transaksi (`sale_items`), menjaga keakuratan laporan laba kotor historis meskipun harga katalog berubah.
- **Pilihan Cetak Struk:** Format struk siap cetak untuk printer termal 58mm, 80mm, serta faktur A4.

### E. Audit Trail Log & Manajer Cadangan Database (Governance & Disaster Recovery)

- **Audit Trail Log Aktivitas:** Pencatatan permanen aksi-aksi sensitif internal:
  - Perubahan role user (`USER_ROLE_CHANGED`) & status akun (`USER_ACTIVATED` / `USER_DEACTIVATED`).
  - Reset kata sandi pengguna (`PASSWORD_RESET`).
  - Pembatalan transaksi penjualan kasir (`SALE_VOIDED`).
  - Penyesuaian manual stok opname atau barang rusak (`STOCK_ADJUSTED`).
  - Penyesuaian manual poin reward pelanggan (`POINTS_ADJUSTED`).
  - Ekspor berkas laporan penjualan CSV (`SALES_EXPORTED`).
  - Pembuatan cadangan database (`BACKUP_CREATED`).
- **Live Database Backup Manager:** Pembuatan snapshot mandiri `.sqlite` secara live langsung dari halaman web Owner tanpa mematikan server.
- **Pencegahan Directory Traversal:** Validasi regex ketat pada nama berkas backup mencegah manipulasi jalur berkas.
- **Runbook Pemulihan Bencana:** Dokumentasi prosedur penggantian database saat terjadi insiden perangkat keras.

### F. Multi-User, Sesi Aman & RBAC Matrix

- **Setup Wizard Pertama Kali:** Halaman inisialisasi awal memandu pendaftaran Owner pertama dan otomatis mengunci endpoint `/api/auth/setup` selamanya.
- **Kriptografi Mutakhir:** Kata sandi di-hash menggunakan `node:crypto` `scrypt` dengan verifikasi `timingSafeEqual`.
- **Proteksi Brute-Force:** _Sliding-window rate limiter_ membatasi percobaan login yang salah.
- **Matriks Hak Akses (RBAC):**
  - `OWNER`: Akses menyeluruh tanpa batas (Audit Trail, Backup DB, Pengaturan User, Laba Kotor, HPP, Void Penjualan, Rekap Shift, Faktur Pembelian).
  - `WAREHOUSE`: Pengelolaan katalog produk/kategori, faktur pembelian stok masuk, dan penyesuaian stok opname.
  - `CASHIER`: Operasional kasir POS, pembukaan/penutupan shift kasir sendiri, dan direktori pelanggan (seluruh angka HPP dan laba kotor disanitasi menjadi `null` langsung dari server).

---

## 3. Matriks Konfigurasi Environment

Konfigurasi aplikasi dikelola melalui berkas `.env` atau _environment variables_ container:

| Variabel            | Tipe                                    | Default                | Deskripsi                                                             |
| ------------------- | --------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `NODE_ENV`          | `development` \| `test` \| `production` | `development`          | Mode eksekusi runtime server                                          |
| `HOST`              | string                                  | `0.0.0.0`              | Host binding HTTP server                                              |
| `PORT`              | integer                                 | `3000`                 | Port listen HTTP server                                               |
| `DATABASE_PATH`     | string                                  | `./data/stokku.sqlite` | Lokasi berkas basis data SQLite (otomatis mode WAL)                   |
| `BACKUP_DIR`        | string                                  | `./data/backups`       | Lokasi direktori penyimpanan berkas snapshot `.sqlite`                |
| `SESSION_TTL_HOURS` | integer (1 - 720)                       | `24`                   | Masa berlaku sesi login dalam jam                                     |
| `COOKIE_SECURE`     | `auto` \| `true` \| `false`             | `auto`                 | Atribut Secure pada cookie sesi (`auto` aman untuk LAN/reverse proxy) |
| `CORS_ORIGINS`      | string (koma terpisah)                  | _(kosong)_             | Daftar Origin tambahan yang diizinkan untuk proteksi CSRF             |

---

## 4. Panduan Menjalankan Aplikasi

### Prasyarat

- **Node.js** `>= 22.5.0` (Direkomendasikan **Node.js 24 LTS**)
- **pnpm** `>= 9`

### Menjalankan Mode Development

```bash
# 1. Instalasi dependensi
pnpm install

# 2. Jalankan API backend (port 3000) dan Vite dev server (port 5173)
pnpm run dev
```

Buka browser pada alamat `http://localhost:5173`. Pada kunjungan perdana, selesaikan formulir **Setup Owner Pertama**.

### Uji Kualitas, Linting & Build Produksi

```bash
# Pemeriksaan format, linter & pengurutan impor Biome (zero warning gate)
pnpm run check

# Perbaikan otomatis format kode menggunakan Biome
pnpm run check:fix

# Menjalankan seluruh test suite otomatis (9 tests across 8 suites)
pnpm test

# Verifikasi penuh (Biome + 4 TSConfig Typecheck + Client Vite + Server TSC)
pnpm run build

# Menjalankan server tunggal produksi
pnpm start
```

---

## 5. Deployment Menggunakan Docker

Stokku menyediakan konfigurasi multi-stage `Dockerfile` minimalis berbasis `node:24-bookworm-slim` non-root (`USER node`):

### Menjalankan dengan Docker Compose

```bash
# Build image dan jalankan container di latar belakang
docker compose up -d --build

# Periksa status kontainer dan healthcheck
docker compose ps
```

Aplikasi aktif pada port `http://localhost:3000`. Database dan berkas cadangan disimpan secara persisten di Docker volume `stokku_sqlite_data` pada path container `/data`.

### Prosedur Pemulihan Bencana (Disaster Recovery)

Jika terjadi insiden kehilangan data atau kerusakan server:

1. Hentikan container aplikasi:

   ```bash
   docker compose down
   ```

2. Unduh berkas snapshot cadangan dari menu **Sistem & Keamanan** di web atau dari direktori cadangan (`data/backups/stokku-backup-*.sqlite`).
3. Ganti berkas database utama dengan berkas cadangan:

   ```bash
   cp data/backups/stokku-backup-2026-10-28T...sqlite data/stokku.sqlite
   ```

4. Pastikan berkas jurnal sementara (`stokku.sqlite-wal` dan `stokku.sqlite-shm`) dihapus jika ada.
5. Nyalakan kembali container:

   ```bash
   docker compose up -d
   ```

Database akan langsung aktif pada titik waktu snapshot yang dipilih.

---

## 6. Lisensi & Integritas Kode

Dikembangkan dengan standar rekayasa perangkat lunak ketat: Single Responsibility Principle (SRP), Don't Repeat Yourself (DRY), Single Source of Truth (SSOT), dan jaminan kelulusan verifikasi 100% pada _automated integration testing_.
