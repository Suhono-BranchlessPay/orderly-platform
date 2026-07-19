# Blok D — Social trial finish + traffic + attribution

## D1 — Selesaikan trial Samurai (ops + console)

### Kode (sudah)
- Graph send gated: `POST /api/dashboard/social/inbox/:id/send`
- Console sekarang menampilkan baris `approved` + tombol **Send to Meta**
- Approve ≠ send (tetap dua klik manusia)

### Smoke Graph send (Malik — terkendali)

1. Pastikan ada baris inbox `approved` (Draft → Approve) untuk komentar/DM uji.
2. VPS `ecosystem.config.cjs`:

```js
SOCIAL_SEND_ENABLED: "1",
SOCIAL_KILL_SWITCH_SAMURAI: "0",
// META_PAGE_ACCESS_TOKEN already set
```

3. `pm2 restart ecosystem.config.cjs --update-env`
4. Console → Social inbox → **Send to Meta** → verifikasi balasan di Page/IG.
5. **Segera** set `SOCIAL_SEND_ENABLED: "0"` + restart lagi.

### Meta Publish app (ops)

Development → **Live/Publish** supaya komentar Page publik masuk webhook.
Sampai publish: hanya tester/admin yang memicu webhook.

Aturan keras tetap: complaint / allergy_health / spam → tidak pernah `/send`.

---

## D2 — Meta App Review (ops Malik)

Ajukan sekarang untuk Page **klien** (bukan milik sendiri):

1. developers.facebook.com → App → App Review
2. Permissions: pages_messaging, pages_manage_engagement, instagram_manage_comments (sesuai produk terbaru Meta)
3. Privacy policy + use case: multi-tenant human-in-the-loop replies
4. Track ETA — jangan jadi bottleneck 2027

Checklist lama: `docs/C7_Meta_API_Registration_Checklist.md`

---

## D3 — Sosmed = traffic driver (bukan Shop)

Restoran = link ke situs order + UTM. **Bukan** FB/IG/TikTok Shop katalog.

| Kanal | Link contoh Samurai |
|-------|---------------------|
| Facebook Page CTA / button | `https://samurairesto.com/menu?utm_source=facebook&utm_medium=page_cta&utm_campaign=samurai` |
| **Link-in-bio (TikTok + Instagram)** | `https://samurairesto.com/bio?src=tiktok-bio` · `https://samurairesto.com/bio?src=ig-bio` |
| Instagram link in bio (legacy UTM) | `https://samurairesto.com/menu?utm_source=instagram&utm_medium=bio&utm_campaign=samurai` |
| TikTok bio / video (legacy UTM) | `https://samurairesto.com/menu?utm_source=tiktok&utm_medium=bio&utm_campaign=samurai` |
| Alternatif via QR redirect | `https://samurairesto.com/r/samurai?src=facebook` (scan log + `src` di landing) |

**Src convention (Content Engine):**
- Bio permanen (tanpa tanggal): `tiktok-bio`, `ig-bio`, `fb-bio`
- Kampanye kalender: `tiktok-{item}-{YYYYMMDD}`, `ig-{item}-{YYYYMMDD}`, `fb-{item}-{YYYYMMDD}`

Setelah atribusi storefront (Blok C1/D4): order dari link itu → `orders.channel` = `facebook` / `instagram` / `tiktok`.

### TikTok comments / social inbox — platform limit (verified Jul 2026)

Official TikTok for Developers **Content Posting API** is publish-only. The Direct Post schema exposes `disable_comment` at create time — there is **no** endpoint to list, reply to, or moderate organic comments ([Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)). Comment read access under the **Research API** is academic / vetted only — not a restaurant ops inbox.

**Do not build a Meta-style TikTok social inbox** — platform limitation, not an Orderly gap. FB/IG inbox for comment reply; TikTok = traffic via `/bio` + tracked `/s/` links.

---

## D4 — Atribusi UTM (kode)

| Surface | Status |
|---------|--------|
| Web storefront | ✅ first-touch `utm_*` / `src` → checkout `channel` + `source_detail` |
| Mobile app | ✅ deep link listener (`expo-linking`) + AsyncStorage → checkout |
| Server | ✅ `ORDER_CHANNELS` includes `google`, `facebook`, `instagram`, `tiktok`, `qr`, … |

Deep link contoh (app scheme / universal — sesuaikan `app.json` scheme):

```text
orderly://menu?utm_source=instagram&utm_medium=bio
https://samurairesto.com/menu?utm_source=facebook&utm_medium=page_cta
```

Tanpa atribusi, kanal iklan/sosmed tidak bisa diukur di Live orders.

---

## HOLD

- Auto-send kategori aman → hanya setelah berminggu-minggu trial stabil
- FB/IG/TikTok Shop katalog → grocery nanti
- Meta CAPI ads Pixel → tunggu portfolio Samurai review Meta
