-- Per-tenant SEO / white-label identity (theme JSON + hours + favicon)
-- Run after migrate-kirin-and-bp-anchor.sql
-- Canonical MUST equal each tenant's own domain (never cross-tenant).

-- ── Samurai (tenant #1) ─────────────────────────────────────────────────────
UPDATE tenants SET
  logo_url = COALESCE(logo_url, '/samurai-logo.png'),
  favicon_url = COALESCE(favicon_url, '/favicon.svg'),
  hours = '{
    "weekly": [
      {"day":"Monday","hours":"11AM – 8:30PM"},
      {"day":"Tuesday","hours":"11AM – 8:30PM"},
      {"day":"Wednesday","hours":"11AM – 8:30PM"},
      {"day":"Thursday","hours":"11AM – 8:30PM"},
      {"day":"Friday","hours":"11AM – 8:30PM"},
      {"day":"Saturday","hours":"11AM – 8:30PM"},
      {"day":"Sunday","hours":"11AM – 7:30PM"}
    ]
  }'::jsonb,
  theme = '{
    "primary": "354 82% 50%",
    "secondary": "43 74% 49%",
    "accent": "0 0% 8%",
    "brandName": "Samurai Hibachi & Sushi",
    "brandShort": "Samurai",
    "logoUrl": "/samurai-logo.png",
    "faviconUrl": "/favicon.svg",
    "contactEmail": "samurairesromartins@gmail.com",
    "facebookUrl": "https://www.facebook.com/samuraimartinsville",
    "tagline": "Order directly from Samurai. No hidden marketplace fees. Fresh from our kitchen.",
    "aboutText": "Step into a special occasion every day. At Samurai Hibachi & Sushi, we blend the artistry of traditional Japanese culinary techniques with the warmth of a local neighborhood gathering place.",
    "metaTitle": "Samurai Hibachi & Sushi | Martinsville, IN — Order Online",
    "metaDescription": "Samurai Hibachi & Sushi in Martinsville, Indiana. Order fresh sushi rolls, hibachi, bento boxes, and party trays online for pickup or delivery. Rated 4.9★ on Google.",
    "metaKeywords": "samurai hibachi sushi martinsville indiana, sushi martinsville in, hibachi martinsville, japanese restaurant martinsville, sushi delivery martinsville, order sushi online indiana",
    "ogTitle": "Samurai Hibachi & Sushi | Martinsville, IN",
    "ogDescription": "Fresh sushi, hot hibachi, and party trays in Martinsville, Indiana. Order online for pickup or delivery. Rated 4.9★ on Google with 2,300+ reviews.",
    "ogImage": "/og-image.jpg",
    "ratingValue": "4.9",
    "reviewCount": "2300",
    "cuisine": ["Japanese", "Sushi", "Hibachi"],
    "fontHeading": "Playfair Display",
    "fontBody": "DM Sans"
  }'::jsonb
WHERE id = 'samurai';

-- ── Kirin (tenant #2) — MUST NOT inherit Samurai SEO ────────────────────────
UPDATE tenants SET
  logo_url = '/kirin-logo.png',
  favicon_url = '/kirin-favicon.svg',
  hours = '{
    "weekly": [
      {"day":"Monday","hours":"11AM – 9PM"},
      {"day":"Tuesday","hours":"11AM – 9PM"},
      {"day":"Wednesday","hours":"11AM – 9PM"},
      {"day":"Thursday","hours":"11AM – 9PM"},
      {"day":"Friday","hours":"11AM – 9:30PM"},
      {"day":"Saturday","hours":"11AM – 9:30PM"},
      {"day":"Sunday","hours":"11AM – 9PM"}
    ]
  }'::jsonb,
  theme = '{
    "primary": "0 72% 38%",
    "secondary": "40 30% 88%",
    "accent": "0 0% 5%",
    "brandName": "Kirin Hibachi Express",
    "brandShort": "Kirin",
    "logoUrl": "/kirin-logo.png",
    "faviconUrl": "/kirin-favicon.svg",
    "contactEmail": "kirinhibachiexpress26@gmail.com",
    "facebookUrl": "https://www.facebook.com/profile.php?id=61591591400890",
    "tagline": "Order directly from Kirin Hibachi Express in Henderson, KY. Fresh hibachi and sushi — pickup or delivery.",
    "aboutText": "Kirin Hibachi Express brings sizzling hibachi and fresh sushi to Henderson, Kentucky. Order online for pickup or delivery — no marketplace markups.",
    "metaTitle": "Kirin Hibachi Express | Henderson, KY — Order Online",
    "metaDescription": "Kirin Hibachi Express in Henderson, Kentucky. Order fresh hibachi, sushi, and Japanese favorites online for pickup or delivery at 2278 S Green St.",
    "metaKeywords": "kirin hibachi express henderson ky, hibachi henderson kentucky, sushi henderson ky, japanese restaurant henderson, order hibachi online henderson",
    "ogTitle": "Kirin Hibachi Express | Henderson, KY",
    "ogDescription": "Fresh hibachi and sushi in Henderson, Kentucky. Order online for pickup or delivery from Kirin Hibachi Express.",
    "ogImage": "/kirin-og-image.jpg",
    "cuisine": ["Japanese", "Hibachi", "Sushi"],
    "fontHeading": "Cormorant Garamond",
    "fontBody": "Source Sans 3"
  }'::jsonb
WHERE id = 'kirin';
