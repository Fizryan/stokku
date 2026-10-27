# Stokku — Sistem Manajemen Stok & Kasir (POS)

Aplikasi web fullstack manajemen inventaris, kartu stok (_immutable ledger_), dan kasir (_Point of Sale_) berbasis **Hono**, **SQLite (`node:sqlite` mode WAL)**, **Zod v4**, **Vite 8**, dan **Tailwind CSS v4** dengan filosofi desain **Material 3 Calm Sapphire Blue**.

---

## Fitur Utama

1. **Single Source of Truth (SSOT) Kartu Stok**
   - Setiap perubahan stok (`INITIAL`, `IN_PURCHASE`, `OUT_SALE`, `ADJUSTMENT_OPNAME`, `OUT_DAMAGED`, `VOID_REVERSAL`) wajib melewati satu layanan transaksi atomik (`BEGIN IMMEDIATE`) dan tercatat permanen di `stock_movements`.
   - Kalkulasi ulang HPP rata-rata tertimbang (_weighted-average cost_) otomatis saat stok masuk pembelian.
2. **Kasir (POS) Responsif & Struk Siap Cetak**
   - Tampilan _split-view_ di desktop dan _floating cart + bottom sheet_ di perangkat mobile/tablet.
   - Dukungan _barcode scanner_ (`Enter`), validasi stok _real-time_, kembalian otomatis, dan cetak struk termal 58mm/80mm maupun A4.
   - _Historical snapshot_ pada `sale_items` (`cost_price_at_sale`, `sell_price_at_sale`) menjaga akurasi laba kotor historis meskipun harga produk berubah di kemudian hari.
3. **Multi-User, Sesi Aman & RBAC**
   - **First-Run Setup Wizard**: Saat database masih kosong, halaman pembuka otomatis memandu pembuatan akun `OWNER` pertama dan mengunci endpoint `/api/auth/setup` selamanya setelahnya.
   - Password di-hash menggunakan `node:crypto` `scrypt` + perbandingan `timingSafeEqual`; token sesi disimpan sebagai hash `SHA-256` di SQLite dengan cookie `HttpOnly` + `SameSite=Lax` serta _sliding-window rate limiter_ pada login.
   - **Tiga Peran Akses**:
     - `OWNER`: Akses penuh (analitik laba kotor & HPP, katalog, stok, kasir, void penjualan dengan pengembalian stok otomatis, ekspor laporan CSV, manajemen user).
     - `WAREHOUSE`: Pengelolaan katalog produk/kategori serta pencatatan mutasi & opname stok.
     - `CASHIER`: Operasional kasir POS & riwayat transaksi sendiri (data HPP & laba kotor disanitasi `null` langsung dari server).

---

## Prasyarat

- **Node.js** `>= 22.5.0` (direkomendasikan **Node.js 24 LTS**)
- **pnpm** `>= 9`

---

## Menjalankan Secara Lokal (Development)

```bash
# 1. Instal dependensi
pnpm install

# 2. Jalankan API server (port 3000) & Vite HMR dev server (port 5173)
pnpm run dev
```

Buka `http://localhost:5173` di browser. Pada kunjungan pertama, selesaikan **Setup Akun Owner Pertama**.

---

## Pengujian, Linting & Build Produksi

```bash
# Menjalankan Biome linter, formatter & import-organizer check (zero-warning gate)
pnpm run check

# Merapikan format & perbaikan otomatis yang aman menggunakan Biome
pnpm run check:fix

# Menjalankan seluruh suite automated integration tests (in-memory SQLite)
pnpm test

# Menjalankan Biome check + static typecheck (4 tsconfig) + build produksi
pnpm run build

# Menjalankan server produksi tunggal (melayani API + SPA dari dist/)
pnpm start
```

---

## Menjalankan dengan Docker

```bash
# Build image & jalankan container beserta named volume SQLite
docker compose up -d --build

# Cek status kesehatan container
docker compose ps
```

Aplikasi dapat diakses melalui `http://localhost:3000`. Seluruh data SQLite beserta jurnal WAL disimpan secara persisten di dalam Docker volume `stokku_sqlite_data` (`/data/stokku.sqlite`).

### Backup Database SQLite (WAL-Safe)

Saat container berjalan dalam mode WAL, salin database secara konsisten menggunakan perintah `VACUUM INTO`:

```bash
docker exec stokku-app node --no-warnings -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/data/stokku.sqlite'); db.exec(\"VACUUM INTO '/data/backup-stokku.sqlite'\"); db.close();"
docker cp stokku-app:/data/backup-stokku.sqlite ./backup-stokku.sqlite
```
