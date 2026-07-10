# THEME PACK — Kirin Hibachi Express (Tenant #2)

**Untuk:** Verry (masukkan ke `tenants.theme` + config tenant Kirin)
**Tujuan:** Memberi Kirin identitas visual yang JELAS BEDA dari Samurai, dari config — bukan kode baru.
**Ini juga TEMPLATE format** untuk Theme Pack tenant berikutnya (Claude buatkan tiap tenant, Verry colok).

---

## 1. PERSONALITY / MOOD (arah desain)

- **Kirin = "Vintage Hibachi Grill-House"** — hangat, artisan, rustic, autentik, kokoh.
  Dari logo: badge melingkar, spatula & garpu grill menyilang, tekstur kayu/cork, "EST 2026".
- **KONTRAS dengan Samurai** (yang modern/tajam/energetic merah-menyala + samurai helm).
- Kesan yang dituju: seperti steakhouse/grill lokal yang terpercaya & hangat, bukan sushi bar modern.

---

## 2. PALET WARNA (dari logo Kirin)

```json
"theme": {
  "colors": {
    "primary":      "#8B2318",   // merah marun tua (maroon/brick) — dari lingkaran logo
    "primary_deep": "#5E1710",   // marun lebih gelap (hover/aksen)
    "accent":       "#C8A24B",   // emas/tan hangat — dari teks & tekstur cork
    "accent_soft":  "#E8D9B5",   // krem/cream — background lembut
    "ink":          "#1A1512",   // hitam kecoklatan (charcoal) — bukan hitam murni
    "paper":        "#F5EEE0",   // cream/tan terang — background utama (hangat, bukan putih)
    "paper_2":      "#EBE0CC",   // cream sedikit lebih tua — section alternatif
    "muted":        "#6B5D4F",   // coklat abu (warm gray) — teks sekunder
    "line":         "#D9CBB2",   // garis/border hangat
    "dark_section": "#1A1512",   // section gelap (charcoal, warm)
    "dark_text":    "#F5EEE0"    // teks di section gelap
  }
}
```

**Kunci pembeda dari Samurai:** Samurai pakai putih bersih + merah menyala + hitam murni.
Kirin pakai **cream/tan hangat + marun tua + charcoal + aksen emas** — nuansa vintage/warm,
bukan modern/clean. Ini yang membuat "rasa"-nya beda meski komponen sama.

---

## 3. TIPOGRAFI (beda karakter dari Samurai)

```json
"fonts": {
  "display": "Oswald",           // serif/condensed kokoh, cocok vintage grill (alternatif: 'Anton', 'Bebas Neue')
  "display_fallback": "'Oswald', 'Arial Narrow', sans-serif",
  "body": "'Libre Franklin'",    // sans hangat & terbaca (alternatif: 'Source Sans 3')
  "accent": "'Oswald'"           // untuk label/harga
}
```
- Samurai: sans bold modern. Kirin: **display condensed berkarakter vintage** (Oswald/Anton) +
  body yang hangat. Font-nya harus terasa "grill-house klasik", bukan "modern app".
- (Kalau mau lebih vintage lagi: 'Anton' untuk display sangat cocok dengan gaya logo.)

---

## 4. VARIAN LAYOUT (pilihan per tenant — Verry bangun beberapa, tenant pilih)

```json
"layout": {
  "hero_variant": "image-bold",     // hero dengan foto grill besar + logo badge di tengah/kiri
  "menu_variant": "card-warm",      // menu gaya kartu hangat dengan foto (cocok grill/hibachi)
  "nav_variant": "solid-dark",      // nav solid charcoal dengan logo badge
  "section_style": "textured"       // boleh pakai tekstur halus (subtle grain) sesuai gaya cork/kayu
}
```
**Catatan untuk Verry:** kalau varian ini belum ada, ini jadi kebutuhan membangun 2-3 varian
hero/menu/nav yang bisa dipilih per tenant. Kirin pilih yang "warm/bold/textured";
Samurai pakai yang "modern/sharp/clean". Kombinasi varian + warna + font + logo = identitas unik.

---

## 5. ASET (Malik/Kirin sediakan — referensi di config)

```json
"assets": {
  "logo": "kirin-logo.png",              // SUDAH ADA (logo badge yang dikirim) — PNG/SVG transparan
  "favicon": "kirin-favicon.png",        // dari logo (badge disederhanakan)
  "og_image": "kirin-og.jpg",            // gambar share sosial (logo + foto grill + nama)
  "hero_image": "kirin-hero.jpg"         // foto hibachi/grill Kirin (perlu foto asli, jangan foto Samurai)
}
```
- Logo sudah ada. Yang masih perlu: favicon (turunan logo), og-image, dan foto hero/grill Kirin.
- JANGAN pakai foto Samurai. Kalau belum ada foto Kirin, pakai foto grill/hibachi netral dulu.

---

## 6. KONTEN / IDENTITAS (dari data Verry — sudah benar)

```json
"identity": {
  "name": "Kirin Hibachi Express",
  "tagline": "Hibachi, made fresh & fast.",   // saran; sesuaikan
  "cuisine": "Japanese Hibachi & Grill",
  "est": "2026",
  "address": "2278 S Green St, Henderson, KY 42420",
  "phone": "+1 270-823-3405",
  "email": "kirinhibachiexpress26@gmail.com",
  "delivery_radius_miles": 12,
  "order_types": ["pickup"],                   // + "delivery" jika Kirin mau DoorDash
  "languages": ["en"]                          // + "id" dst. sesuai kebutuhan
}
```

---

## 7. SEO / META PER-TENANT (WAJIB — ini yang kemarin rusak)

```json
"seo": {
  "title": "Kirin Hibachi Express | Henderson, KY — Order Online",
  "description": "Kirin Hibachi Express in Henderson, Kentucky. Fresh, fast hibachi — order online for pickup. Est. 2026.",
  "canonical": "https://kirinhibachiexpress.com",     // WAJIB domain sendiri, JANGAN samurairesto.com
  "og_title": "Kirin Hibachi Express | Henderson, KY",
  "og_description": "Fresh, fast hibachi in Henderson, Kentucky. Order online for pickup.",
  "og_image": "https://kirinhibachiexpress.com/kirin-og.jpg",
  "og_url": "https://kirinhibachiexpress.com",
  "og_site_name": "Kirin Hibachi Express",
  "keywords": "kirin hibachi express henderson ky, hibachi henderson kentucky, japanese food henderson, order hibachi online henderson"
}
```
**PENTING:** meta ini di-render SERVER-SIDE per host (bukan React client-side). canonical Kirin
HARUS kirinhibachiexpress.com. Ini memperbaiki bug kemarin (Kirin canonical ke Samurai).

---

## 8. MENU (kosong dulu — benar)

- Menu Kirin = kosong sampai Square catalog Kirin tersambung (keputusan Verry sudah benar).
- Sumber kebenaran menu = Square catalog Kirin (SKU & harga dari katalog mereka).
- JANGAN salin menu Samurai. Tunggu menu asli Kirin.

---

## CARA PAKAI (untuk Verry)

1. Masukkan blok config di atas ke `tenants` (Kirin): `theme` (warna/font/layout), `seo`, `identity`, `assets`.
   - SQL siap pakai: `scripts/apply-kirin-themepack.sql`
2. Pastikan komponen React membaca theme dari config (CSS variables dari `theme.colors`,
   font dari `theme.fonts`, pilih layout dari `theme.layout`).
3. Render meta SEO server-side per host dari `seo`.
4. Upload aset Kirin (logo ada; favicon/og/hero menyusul dari Malik).
5. Menu menyusul dari Square Kirin.
6. Hasil: Kirin tampil BEDA dari Samurai (warm vintage vs modern sharp), meta = Kirin, satu codebase.

### VPS (setelah push / copy SQL)

```bash
cd /var/www/samurai-resto
DBURL=$(node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.DATABASE_URL||'')")
psql "$DBURL" -f scripts/apply-kirin-themepack.sql
# atau dari clone:
# psql "$DBURL" -f /path/to/apply-kirin-themepack.sql
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/api/config/checkout | head -c 500
```

---

## STATUS IMPLEMENTASI (Orderly — Jul 2026)

| Bagian Theme Pack | Status |
|-------------------|--------|
| 1 Personality / mood | ✅ Tercatat di theme (`personality`) |
| 2 Palet warna | ✅ SQL + frontend `applyTheme` (hex→CSS) |
| 3 Tipografi Oswald + Libre Franklin | ✅ Config + font load |
| 4 Layout variants | 🟡 Token di config (`data-*`); UI variant penuh menyusul |
| 5 Aset logo/favicon/og/hero | 🟡 Favicon placeholder; logo/og/hero tunggu file dari Malik/Kirin |
| 6 Identity (alamat, phone, pickup) | ✅ DB tenant + theme.identity |
| 7 SEO / meta server-side | 🟡 Logic siap; deploy `STOREFRONT_DIST` + nginx di VPS belum penuh |
| 8 Menu kosong sampai Square | ✅ Menu Kirin = 0 item |

**Tunggu diskusi Kirin:** jam buka final, aset visual, Square credentials, konfirmasi pickup-only vs +delivery.

---

## TEMPLATE UNTUK TENANT BERIKUTNYA

Format Theme Pack ini = cetakan. Untuk tiap tenant baru, Malik kirim ke Claude:
- Nama, jenis masakan, logo, foto (kalau ada), alamat/kontak
- "Rasa" yang diinginkan (mewah/kasual/modern/vintage/dll.)
Claude hasilkan Theme Pack (warna+font+layout+seo+identity) siap colok. Verry masukkan ke config.
Satu mesin, banyak wajah — tanpa kode baru per tenant.
