# Panduan Deploy Samurai Resto ke VPS Hostinger

Panduan ini untuk **VPS Hostinger** (Ubuntu 22.04/24.04) — bukan Shared Hosting, karena project ini butuh Node.js + PostgreSQL.

Arsitektur aplikasi:
- **Frontend** (`artifacts/samurai-resto`) — React + Vite, di-build jadi file statis
- **API Server** (`artifacts/api-server`) — Express, jalan sebagai proses Node.js di port `8080`
- **Database** — PostgreSQL

Nginx akan jadi reverse proxy: melayani file statis frontend + meneruskan request `/api/*` ke API server.

---

## 1. Setup awal VPS

SSH ke VPS:
```bash
ssh root@IP_VPS_KAMU
```

Update sistem & install tools dasar:
```bash
apt update && apt upgrade -y
apt install -y curl git unzip nginx
```

---

## 2. Install Node.js 24 + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node --version   # pastikan v24.x
npm install -g pnpm@latest
pnpm --version
```

---

## 3. Install & setup PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql --now
```

Buat database & user:
```bash
sudo -u postgres psql
```
Di dalam prompt psql:
```sql
CREATE DATABASE samurai_resto;
CREATE USER samurai_user WITH ENCRYPTED PASSWORD 'GANTI_PASSWORD_INI';
GRANT ALL PRIVILEGES ON DATABASE samurai_resto TO samurai_user;
\c samurai_resto
GRANT ALL ON SCHEMA public TO samurai_user;
ALTER SCHEMA public OWNER TO samurai_user;
\q
```

> ⚠️ **Penting untuk PostgreSQL 15 ke atas:** `GRANT ALL PRIVILEGES ON DATABASE` saja **tidak cukup** — sejak PostgreSQL 15, izin `CREATE` di schema `public` tidak lagi otomatis diberikan ke user baru. Tanpa 2 baris `GRANT ALL ON SCHEMA public` / `ALTER SCHEMA public OWNER TO` di atas, `pnpm --filter @workspace/db run push` akan gagal setiap kali ada tabel baru yang perlu dibuat (gagal diam-diam, biasanya cuma muncul "Exit status 1" tanpa pesan error jelas).

Connection string yang akan dipakai:
```
postgresql://samurai_user:GANTI_PASSWORD_INI@localhost:5432/samurai_resto
```

---

## 4. Upload project

Upload `samurai-resto-source.zip` ke server (pakai `scp` dari komputer lokal, atau upload manual lalu `unzip`):
```bash
scp samurai-resto-source.zip root@IP_VPS_KAMU:/var/www/
```

Di server:
```bash
mkdir -p /var/www/samurai-resto
cd /var/www/samurai-resto
unzip /var/www/samurai-resto-source.zip -d .
```

---

## 5. Install dependencies

```bash
cd /var/www/samurai-resto
pnpm install
```

Kalau muncul warning `Ignored build scripts: esbuild`, jalankan:
```bash
pnpm approve-builds
```
Pilih `esbuild` (spasi untuk centang, Enter untuk lanjut), lalu `pnpm install` lagi.

---

## 6. Environment variables

Buat file `.env` di root project:
```bash
nano /var/www/samurai-resto/.env
```
Isi:
```
DATABASE_URL=postgresql://samurai_user:GANTI_PASSWORD_INI@localhost:5432/samurai_resto
NODE_ENV=production
PORT=8080
OWNER_PIN=samurai2024
SESSION_SECRET=ganti-dengan-string-acak-panjang
```

> Ganti `OWNER_PIN` dan `SESSION_SECRET` dengan nilai rahasia kamu sendiri.
>
> **Catatan:** `OWNER_PIN` hanya dipakai sebagai nilai awal (seed) saat tabel `app_settings` di database masih kosong. Setelah PIN pernah diganti sekali (lewat Owner Dashboard → "Ganti PIN Owner" atau langsung di database), nilai di `.env`/`ecosystem.config.cjs` tidak lagi berpengaruh — PIN yang aktif selalu yang tersimpan di database.

API server perlu baca `.env` ini — pastikan variabelnya ter-export saat proses jalan (PM2 mendukung file `.env` otomatis, lihat langkah 8).

---

## 7. Push schema database & build

Push skema tabel (menu, orders, customers, dll) ke database:
```bash
cd /var/www/samurai-resto
export $(cat .env | xargs)
pnpm --filter @workspace/db run push
```

Build API server dan frontend **satu per satu** (jangan pakai `pnpm run build` di root — itu akan ikut mem-build `mockup-sandbox`, package khusus internal Replit yang butuh env var berbeda dan tidak dipakai saat produksi):
```bash
pnpm --filter @workspace/api-server run build
PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build
```

Hasil build:
- API server: `artifacts/api-server/dist/index.mjs`
- Frontend statis: `artifacts/samurai-resto/dist/public/`

---

## 8. Jalankan API server dengan PM2

Install PM2 (menjaga proses Node tetap hidup & auto-restart):
```bash
npm install -g pm2
```

> ⚠️ **Jangan pakai `export $(cat .env | xargs)`** untuk memuat env var kalau ada nilai yang mengandung karakter spesial (`#`, `*`, `!`, spasi, kutip, dll) — misalnya `OWNER_PIN` atau `SESSION_SECRET`. Shell Bash akan salah mengartikan karakter-karakter itu (`#` dianggap komentar, `*` di-expand jadi nama file, `!` memicu history expansion), sehingga nilai yang sampai ke aplikasi jadi rusak/terpotong tanpa ada pesan error apa pun.
>
> Cara yang aman: pakai file konfigurasi PM2 (`ecosystem.config.cjs`) — env var dibaca sebagai string JavaScript murni, tidak melalui parsing shell sama sekali.

Buat file `ecosystem.config.cjs` di root project:
```bash
nano /var/www/samurai-resto/ecosystem.config.cjs
```
Isi (sesuaikan nilai dengan isi `.env` kamu):
```js
module.exports = {
  apps: [
    {
      name: "samurai-api",
      script: "artifacts/api-server/dist/index.mjs",
      node_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
        DATABASE_URL: "postgresql://samurai_user:GANTI_PASSWORD_INI@localhost:5432/samurai_resto",
        OWNER_PIN: "GANTI_DENGAN_PIN_RAHASIA",
        SESSION_SECRET: "ganti-dengan-string-acak-panjang",
        // Opsional — hanya isi kalau mau order otomatis terkirim ke Square POS.
        // Kosongkan/hapus baris-baris ini kalau belum pakai Square.
        SQUARE_ACCESS_TOKEN: "GANTI_DENGAN_ACCESS_TOKEN_SQUARE",
        SQUARE_LOCATION_ID: "GANTI_DENGAN_LOCATION_ID_SQUARE",
        SQUARE_APPLICATION_ID: "GANTI_DENGAN_APPLICATION_ID_SQUARE",
        SQUARE_ENVIRONMENT: "production",
        // Path to Vite storefront build — enables Host-based SEO injection
        STOREFRONT_DIST: "/var/www/samurai-resto/artifacts/samurai-resto/dist/public",
      },
    },
  ],
};
```

> **Multi-tenant SEO:** set `STOREFRONT_DIST` and proxy HTML through Express (see `deploy/nginx-multi-tenant.conf.md`). After deploy, run `psql "$DATABASE_URL" -f scripts/migrate-tenant-seo-identity.sql` so Kirin/Samurai each have their own meta/canonical/theme.

> **Integrasi Square POS:** kalau `SQUARE_ACCESS_TOKEN` dan `SQUARE_LOCATION_ID` diisi, setiap order baru dari website otomatis dikirim ke Square lewat `POST /v2/orders` (lihat `artifacts/api-server/src/integrations/square.ts`). Kalau env var ini kosong, order tetap tersimpan normal di database, cuma tidak dikirim ke Square. `SQUARE_ENVIRONMENT` menentukan endpoint: `production` → `connect.squareup.com`, selain itu default ke sandbox (`connect.squareupsandbox.com`).

Jalankan API server lewat file ini (bukan lewat `export`/`.env`):
```bash
cd /var/www/samurai-resto
pm2 delete samurai-api 2>/dev/null
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # ikuti instruksi yang muncul agar PM2 auto-start saat reboot
```

Kalau nanti ganti env var lain (bukan PIN — PIN diganti lewat Owner Dashboard), edit `ecosystem.config.cjs` lalu jalankan:
```bash
pm2 restart ecosystem.config.cjs --update-env
```

Cek statusnya:
```bash
pm2 status
pm2 logs samurai-api
```

File `.env` dari langkah 6 tetap dipakai untuk perintah `pnpm --filter @workspace/db run push` (langkah 7) — cukup pastikan `DATABASE_URL` di `.env` tidak mengandung karakter spesial yang bermasalah, atau jalankan `set -a; source .env; set +a` (bukan `export $(cat .env | xargs)`) kalau terpaksa perlu memuatnya ke shell.

---

## 9. Isi data menu awal (jika perlu)

Jika database masih kosong (belum ada data menu), import data awal sesuai cara yang dipakai project ini (cek folder `scripts/` di source code untuk seed script, atau masukkan data manual lewat SQL/owner dashboard).

---

## 10. Konfigurasi Nginx (reverse proxy)

Buat file konfigurasi:
```bash
nano /etc/nginx/sites-available/samurai-resto
```

Isi:
```nginx
server {
    listen 80;
    server_name domainkamu.com www.domainkamu.com;
    client_max_body_size 10M;

    # Frontend — assets from disk; HTML via Express for per-tenant SEO
    # See deploy/nginx-multi-tenant.conf.md for the full multi-domain setup.
    root /var/www/samurai-resto/artifacts/samurai-resto/dist/public;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|map|txt)$ {
        try_files $uri =404;
        expires 7d;
    }

    location / {
        # Prefer Express SPA injection when STOREFRONT_DIST is set on the API.
        # Fallback try_files keeps the site up if the proxy is misconfigured.
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # If Express is down, uncomment the next line instead of proxy_pass:
        # try_files $uri /index.html;
    }

    # API — diteruskan ke Express di port 8080
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan:
```bash
ln -s /etc/nginx/sites-available/samurai-resto /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## 11. Pasang SSL gratis (HTTPS) dengan Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d domainkamu.com -d www.domainkamu.com
```

Ikuti instruksi di layar (isi email, setuju TOS). Certbot otomatis update konfigurasi Nginx untuk HTTPS + auto-renewal.

---

## 12. Verifikasi

- Buka `https://domainkamu.com` → harus muncul website
- Buka `https://domainkamu.com/api/healthz` → harus return status OK
- Buka `https://domainkamu.com/api/version` → cek `buildTime`, pastikan waktunya sesuai dengan kapan kamu terakhir build/upload (kalau `buildTime` masih waktu lama, berarti VPS belum jalan pakai kode terbaru — build ulang & restart PM2)
- Test order online, cek `/owner` dashboard (PIN sesuai `OWNER_PIN` di `.env` — hanya berlaku sebagai PIN awal sebelum pernah diganti lewat dashboard)

---

## Update aplikasi di kemudian hari

**Satu-satunya jalur deploy produksi Samurai** — lihat juga [`docs/DEPLOY_SAMURAI.md`](docs/DEPLOY_SAMURAI.md):

```bash
cd /var/www/samurai-resto
bash scripts/deploy-samurai-main.sh
```

Script itu selalu: pull `origin/main` → build API → restore aset storefront dari `dist` → `pm2 restart samurai-api`. Jangan pakai `tmp-deploy-*.sh`, jangan `git pull` + build manual, dan jangan memanggil restore aset sebagai langkah terpisah.

Nginx tidak perlu direstart kecuali konfigurasi Nginx berubah.

> Catatan: foto menu yang diupload lewat Owner Dashboard ada di `artifacts/api-server/uploads/menu/` (bukan `attached_assets/`). Folder uploads **tidak** disentuh oleh `deploy-samurai-main.sh`.

---

## Troubleshooting cepat

| Masalah | Solusi |
|---|---|
| `pnpm install` gagal karena esbuild | `pnpm approve-builds` → pilih esbuild |
| API server tidak connect ke DB | Cek `DATABASE_URL` di `.env`, pastikan PostgreSQL jalan (`systemctl status postgresql`) |
| 502 Bad Gateway di Nginx | API server belum jalan — cek `pm2 status` dan `pm2 logs samurai-api` |
| Order/menu tidak muncul | Pastikan `pnpm --filter @workspace/db run push` sudah dijalankan dan data menu sudah ada di DB |
| Owner dashboard tidak bisa login | Cek `OWNER_PIN` di `.env` (hanya berlaku kalau PIN belum pernah diganti lewat dashboard). Kalau PIN sudah pernah diganti tapi lupa, PIN aktif tersimpan di tabel `app_settings` (key `owner_pin`) di database — reset lewat query SQL langsung ke DB kalau perlu |
