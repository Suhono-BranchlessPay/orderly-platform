# Brief Teknis untuk Verry — Refactor ke Arsitektur Multi-Tenant Orderly

**Tujuan:** Ubah samurairesto.com (yang sekarang single-restoran) menjadi **platform multi-tenant** (satu codebase, banyak restoran — seperti Shopify). Samurai jadi **tenant pertama**. Setelah pola solid, Verry lanjut menambahkan Kirin, Samurai Linton, CrustnRoll, Franky's — dan nanti Shogun (24 unit).

**Prinsip:** JANGAN clone-per-restoran. Satu codebase, tiap restoran = konfigurasi (tenant), bukan salinan kode. Menambah restoran = tambah data tenant + kredensial, TANPA menulis/menyalin kode baru.

**Keputusan Malik:** hentikan ekspansi restoran baru sampai fondasi multi-tenant ini solid. Verry pimpin arsitektur; Replit boleh jadi alat bantu tapi arsitektur inti dipegang Verry.

---

## 1. Yang sudah ada (aset — jangan buang, jadikan basis)

samurairesto.com sudah punya alur teruji (reuse, jangan bangun ulang):
- VPS Hostinger (PM2 `samurai-api`, PostgreSQL, port 8080), repo Commercial-website
- Order → Square (Source "Orderly Order Hub"), auto-fire kitchen
- Pembayaran CARD sungguhan (Square Web Payments SDK)
- DoorDash Drive (quote → charge → Dasher → tracking → auto-refund saat gagal)
- Anchoring BP Audit Shield (⚠️ verifikasi apakah benar-benar aktif — belum terkonfirmasi)

Refactor = generalisasi alur ini dari "Samurai" menjadi "tenant aktif", digerakkan config.

---

## 2. Deteksi Tenant

- Tiap tenant punya **domain** sendiri (samurairesto.com, kirinhibachi.com, dst.) atau subdomain/slug.
- Middleware resolusi tenant: dari `Host` header request → cari tenant → muat konfigurasinya →
  simpan di context request (mis. `req.tenant`). Semua handler pakai `req.tenant`.
- Fallback jelas kalau domain tidak dikenali (404/landing).

---

## 3. Model Data (tambahkan tenant_id ke mana-mana)

Tabel baru:
```
tenants(
  id, slug, name, domain,
  logo_url, favicon_url, theme JSONB,        -- warna, font, gaya hero (tampilan beda tiap resto)
  address, city, state, postcode, lat, lng,
  hours JSONB, service_area_radius,
  pos_type,                                   -- "square"
  data_mode,                                  -- "pos-full" | "online-only"
  languages JSONB,                            -- ["en","id",...]
  service_fee JSONB,                          -- {type, amount, waiveUnderSubtotal, absorbsProcessing}
  processing_fee_paid_by,                     -- "restaurant"(default)|"platform"|"customer"
  status, created_at
)
```
Kredensial: **jangan simpan plaintext di DB.** Simpan di secret manager / env, per tenant
(mis. prefix `TENANT_{slug}_SQUARE_ACCESS_TOKEN`). DB hanya menyimpan referensi/alias jika perlu.

Tabel existing → **tambahkan `tenant_id`** + index, dan WAJIB filter by tenant_id di semua query:
- menu_items(tenant_id, category, name, price, sku, photo_url, available)
- orders(tenant_id, source, type, status, subtotal, fees, total, square_order_id, doordash_id, anchor_id, ...)
- customers(tenant_id, first_name, last_name, phone, email, ...)   -- per-tenant, jangan dicampur
- addresses(customer_id, street, unit, city, state, postcode, lat, lng, is_default)
- leads(tenant_id nullable — leads Orderly platform vs leads per resto, putuskan)

**Row-level isolation:** setiap query difilter `WHERE tenant_id = req.tenant.id`. Idealnya tegakkan
di layer akses data (repository) supaya tidak bisa lupa. Tenant A tak boleh pernah baca data tenant B.

---

## 4. Konfigurasi vs Kode (aturan emas)

Semua yang beda antar-restoran = **config di DB/secret**, bukan hard-code:
- Identitas & tampilan → `tenants.theme` + logo (Samurai dan Kirin harus terlihat BEDA, kode sama)
- Menu → menu_items per tenant
- Alamat/jam/area → kolom tenant
- Kredensial (Square/DoorDash/BP/Stripe) → secret per tenant
- Service fee, data_mode, bahasa → kolom tenant

Komponen UI storefront = satu set, di-tema oleh config tenant (CSS variables dari theme JSON).

---

## 5. Adapter (POS / Payment / Data) — pola yang sudah disepakati

- **Payment rail:** untuk resto milik sendiri boleh Square Web Payments; standar platform =
  Stripe Connect nanti (per tenant `payment_rail`). Siapkan interface, implement Square dulu.
- **POS/Routing adapter:** interface umum (createOrderToPOS, fireKitchen). Implement SquareAdapter
  (baca kredensial tenant). Siap tambah Toast/Clover nanti.
- **Data/anchor adapter:** getOrders/getStats per tenant; anchor ke BP per transaksi terbayar.
- **data_mode** per tenant: "pos-full" (Square penuh) vs "online-only" (mis. Shogun/MenuSifu nanti).

---

## 6. Fungsi inti (generalisasi dari Samurai, per tenant)

Semua digerakkan `req.tenant` + kredensial tenant:
- Ordering Pickup/Delivery, PREPAID CARD. Urutan WAJIB: **bayar sukses → buat order →
  (delivery: DoorDash) → anchor BP.** Jangan fire sebelum charge CARD sukses.
- Square: Source "Orderly Order Hub", auto-fire kitchen, Type "Pickup"/"Delivery" (bukan "In store").
- CARD sungguhan (bukan EXTERNAL).
- DoorDash: ongkir dibayar customer; gagal → auto-refund + alert.
- BP Audit Shield: anchor transaksi terbayar; jangan anchor yang gagal. **Verifikasi aktif.**
- Customer DB: nama depan/belakang, alamat terstruktur + Google Places (dibatasi area tenant),
  validasi radius delivery. Per-tenant. Pengenalan pelanggan kembali via device (bukan lookup nomor).

---

## 7. Dashboard Orderly (internal)

- Auth server-side + role-based: Master (semua tenant, read-only) / Manager (tenant sendiri saja).
- Pembatasan di BACKEND (row-level) — Manager tak boleh menerima data tenant lain.
- Dashboard tarik data via backend Orderly (backend yang panggil Square/API, bukan frontend).

---

## 8. Keamanan (wajib)

- Kredensial per tenant di secret/env. TIDAK di kode, TIDAK di frontend, TIDAK plaintext di DB, TIDAK di-commit.
- Frontend tak pernah pegang kredensial API eksternal.
- Isolasi data antar tenant (row-level).
- Jangan tampilkan data pribadi pemilik/alamat rumah. Alamat publik = alamat restoran.
- (Ingat insiden lalu: rotasi DEPLOYER_PRIVATE_KEY, secrets di ecosystem.config — jangan commit secret.)

---

## 9. Urutan Kerja (saran)

1. **Fondasi multi-tenant:** tabel tenants, middleware deteksi tenant, tambah tenant_id + row-level filter.
2. **Samurai → tenant #1:** migrasikan data & config Samurai ke struktur tenant. Pastikan semua alur
   (order/CARD/kitchen/DoorDash/anchor) jalan lewat `req.tenant`. Verifikasi tidak ada regresi.
3. **Theming:** pindahkan tampilan Samurai ke theme config. Uji: ganti theme → tampilan berubah.
4. **Kirin → tenant #2:** tambah config + kredensial Kirin + theme BEDA + menu/logo Kirin.
   Uji end-to-end (order → Square Kirin → kitchen → anchor). Konfirmasi data Kirin terisolasi dari Samurai.
5. **Sisanya:** Samurai Linton, CrustnRoll, Franky's sebagai tenant (tambah config saja).
6. **Shogun (nanti):** kemungkinan data_mode "online-only" (POS mereka MenuSifu, bukan Square) —
   pilot 1-2 unit dulu.

---

## 10. Definition of Done (fondasi)

- [ ] Satu codebase melayani banyak tenant; tenant terdeteksi dari domain/host.
- [ ] Tambah restoran = tambah config tenant + secret, TANPA menyalin/menulis kode.
- [ ] Samurai jalan sebagai tenant #1 tanpa regresi (order/CARD/kitchen/DoorDash/anchor OK).
- [ ] Kirin jalan sebagai tenant #2, tampilan BEDA dari Samurai, data terisolasi.
- [ ] Kredensial per tenant di secret; tidak ada di frontend/kode/DB-plaintext.
- [ ] Dashboard role-based (Master/Manager) via backend; Manager hanya tenantnya.
- [ ] BP Audit Shield anchor benar-benar aktif & terverifikasi.
- [ ] Stripe Connect: kerangka per-tenant siap (test mode; belum live).

---

## 11. GitHub & Repo Strategy

**Keputusan:** SATU repo untuk seluruh platform (bukan per restoran). Manfaatkan repo yang sudah ada.

- **Rename repo:** `Commercial-website` → **`orderly-platform`**
  (`github.com/Suhono-BranchlessPay/orderly-platform`).
  Repo ini sudah berisi alur teruji (order/CARD/kitchen/DoorDash/anchor) = aset Orderly.
  Refactor jadi multi-tenant, bukan bangun ulang.
- **Setelah rename**, update remote di semua tempat:
  - Server VPS: `git remote set-url origin https://github.com/Suhono-BranchlessPay/orderly-platform.git`
  - Lokal Verry & CI/deploy scripts: update URL yang sama.
  - GitHub auto-redirect link lama, tapi tetap rapikan agar tidak membingungkan.
- **Satu repo, banyak tenant.** Tenant = DATA di database + kredensial di secrets.
  Repo HANYA berisi kode platform. Menambah restoran TIDAK menyentuh repo (cuma tambah
  data tenant + secrets). Ini bukti multi-tenant benar: tambah restoran ≠ commit kode.
- **JANGAN** buat repo per restoran (bertentangan dengan multi-tenant).
- (Opsional, nanti kalau kompleks) pisah per KOMPONEN, bukan per restoran:
  `orderly-platform` (storefront+backend), `orderly-dashboard`, `orderly-landing`.
  Jangan over-engineer sekarang — satu repo dulu.

### Keamanan repo (penting — ada uang & kredensial banyak restoran)
- **Private repo** (pastikan tidak public).
- **Branch protection** di `main`: wajib PR + review sebelum merge, tidak boleh force-push.
  (Ingat insiden lalu: vendor Android push branch destruktif — branch protection mencegah ini.)
- **Secret scanning + push protection** aktif (GitHub deteksi API key tak sengaja ter-commit).
  (Ingat insiden: secrets ter-expose di ecosystem.config — jangan pernah commit secret.)
- `.gitignore` mencakup semua file env/secret (ecosystem.config dengan secret, .env, dll.).
- **Akses terbatas** — hanya orang yang perlu. Audit siapa punya akses.
- Rotasi kredensial yang pernah ter-expose (mis. DEPLOYER_PRIVATE_KEY) bila belum.

---

## Catatan untuk Malik (bukan tugas Verry)

- Ini refactor nyata → butuh waktu. Wajar. Tapi keputusan menyetop di ~5 restoran membuatnya
  jauh lebih murah daripada nanti di 28.
- Stripe Connect live menunggu entitas legal Orderly + CPA/pengacara.
- Setelah fondasi solid, minta Verry demokan: tambah 1 tenant baru dari nol untuk membuktikan
  "tambah restoran = tambah config, bukan kode."
