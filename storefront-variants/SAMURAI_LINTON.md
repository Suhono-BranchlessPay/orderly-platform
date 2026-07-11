# Samurai Linton — Tenant #3 (Config-Only Differentiation Pack)

**Hasil tes: TIDAK perlu varian baru.** Varian yang sudah ada cukup untuk membedakan Samurai Linton dari Samurai Martinsville. Linton = **config saja** (`src/data/samurai-linton.ts`). Satu mesin, banyak wajah — terbukti.

## Konteks

Samurai Linton adalah brand **Samurai yang sama** dengan Samurai Martinsville (tenant #1), tapi lokasi berbeda (Linton, Indiana). Tujuannya: mirip Samurai (brand konsisten) tapi pelanggan langsung tahu ini lokasi Linton.

## Pembeda Linton vs Martinsville

| Aspek | Samurai Martinsville | Samurai Linton |
|---|---|---|
| Hero variant | Full-image bold (`hero-fullimage-bold` di sistem Verry ≈ `HeroFullImage`) | **`HeroMinimalCenter`** — tipografi besar di latar solid, tanpa foto (belum ada foto Linton) |
| Primary | Merah Samurai `354 82% 50%` | **Crimson lebih dalam `348 75% 42%`** — masih keluarga merah Samurai |
| Accent | Hitam/putih | **Emas `38 92% 55%`** — nuansa khas Linton (dipakai di CTA banner) |
| Copy | Martinsville | Menyebut **Linton** eksplisit: tagline "Now in Linton, IN", headline "Samurai Hibachi — Linton" |
| Urutan section | hero → menu_download → featured → reviews → story | **hero → story → featured → cta** |
| Featured | Grid dengan foto | **`ListCompact`** — tanpa foto (foto Linton belum ada; JANGAN pakai foto Martinsville) |
| Foto | Foto Martinsville | **Placeholder netral** `[PHOTO/DATA NEEDED]` — diisi Verry/Malik |
| Background | Hitam Samurai `0 0% 7%` | Sama (brand konsisten) |

## Bentuk Config

Config lengkap: `src/data/samurai-linton.ts` (tipe `TenantConfig` di `src/types/config.ts`).

Tambahan baru di tipe: field opsional `meta` untuk data operasional tenant:

```ts
meta?: {
  brand?: string;                    // "samurai" — sama dengan Martinsville
  location?: { city; state; address?; phone?; hours? };
  orderTypes?: ("pickup" | "delivery")[];  // Linton: ["pickup"] (delivery nonaktif sampai Stripe live)
  notes?: string;
}
```

Semua teks/warna/menu dibaca dari config lewat `PageRenderer` + `ThemeProvider` — tidak ada hardcode.

## Data yang masih placeholder (diisi Verry/Malik)

- Alamat, jam buka, telepon Linton
- Menu & harga Linton (3 item placeholder `[Menu item TBD]`)
- Foto lokasi Linton (hero sengaja pakai `HeroMinimalCenter` yang tidak butuh foto)
- Konfirmasi nama final ke Malik (sementara: "Samurai Hibachi — Linton")

## Cara lihat demo

Jalankan app ini, pilih **"Samurai Hibachi — Linton"** di demo switcher.

## Integrasi ke sistem Verry

Mapping ke `storefrontConfig.ts` milik Verry: `hero_variant: "hero-minimal-center"`, section order `["hero","story","featured","location_cta"]`, warna via `tenants.theme` (primary `348 75% 42%`, accent emas `38 92% 55%`), `order_types: ["pickup"]`.
