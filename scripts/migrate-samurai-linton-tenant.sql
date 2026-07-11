-- Tenant #3: Samurai Hibachi — Linton (samurailinton.com)
-- Same Samurai brand as Martinsville, different location — config-only differentiation.
-- Menu stays EMPTY until Square Linton is connected (TENANT_SAMURAI_LINTON_SQUARE_*).
-- Do NOT copy Martinsville menu/photos/Square credentials.
-- Safe to re-run.
--
-- anchor_mode = platform (like Kirin). Needs ORDERLY_BP_API_KEY for Audit Shield
-- when go-live; confirm with Malik if key exists yet.

INSERT INTO tenants (
  id, slug, name, domain,
  logo_url, favicon_url,
  address, city, state, postcode, lat, lng,
  service_area_radius, pickup_phone, pickup_business_name,
  languages, hours, theme, anchor_mode, status, pos_type, data_mode
) VALUES (
  'samurai-linton',
  'samurai-linton',
  'Samurai Hibachi — Linton',
  'samurailinton.com',
  '/samurai-logo.png',
  '/favicon.svg',
  NULL,
  'Linton',
  'IN',
  NULL,
  39.0348,
  -87.1658,
  12,
  NULL,
  'Samurai Hibachi — Linton',
  '["en"]'::jsonb,
  '{
    "weekly": [
      {"day":"Monday","hours":"TBD"},
      {"day":"Tuesday","hours":"TBD"},
      {"day":"Wednesday","hours":"TBD"},
      {"day":"Thursday","hours":"TBD"},
      {"day":"Friday","hours":"TBD"},
      {"day":"Saturday","hours":"TBD"},
      {"day":"Sunday","hours":"TBD"}
    ]
  }'::jsonb,
  $${
    "personality": "samurai-linton-location",
    "brandName": "Samurai Hibachi — Linton",
    "brandShort": "Samurai Linton",
    "tagline": "Now in Linton, IN — the same Samurai fire, ready for pickup.",
    "aboutText": "Samurai Hibachi brings its signature flame-grilled hibachi from Martinsville to Linton, Indiana. Same recipes, same quality, same Samurai spirit — now closer to you.",
    "use_shared_food_photos": false,
    "order_types": ["pickup"],
    "anchor_mode_note": "platform — awaits ORDERLY_BP_API_KEY like Kirin",

    "colors": {
      "primary": "#B91C2C",
      "primary_deep": "#8B1522",
      "accent": "#F5A623",
      "ink": "#F5F0E8",
      "paper": "#121212",
      "paper_2": "#1C1C1C",
      "muted": "#9A9A9A",
      "line": "#333333",
      "dark_section": "#0A0A0A",
      "dark_text": "#F5F0E8"
    },

    "primary": "348 75% 42%",
    "secondary": "38 92% 55%",
    "accent": "0 0% 7%",
    "fontHeading": "Inter",
    "fontBody": "Inter",

    "fonts": {
      "display": "Inter",
      "display_fallback": "Inter, system-ui, sans-serif",
      "body": "Inter",
      "accent": "Inter"
    },

    "layout": {
      "hero_variant": "HeroMinimalCenter",
      "featured_variant": "ListCompact",
      "menu_variant": "menu-list",
      "story_variant": "StoryCentered",
      "cta_variant": "BannerAccent",
      "nav_variant": "NavSolid",
      "footer_variant": "FooterDark",
      "sections": ["hero", "story", "featured", "catering_cta"]
    },

    "copy": {
      "hero_headline": ["Samurai Hibachi — Linton"],
      "hero_subheadline": "The same Samurai fire you love, now serving Linton, Indiana. Fresh hibachi, made to order, ready for pickup.",
      "hero_ctas": [
        {"label": "Order Pickup", "href": "/order", "style": "primary"},
        {"label": "View Menu", "href": "/menu", "style": "outline"}
      ],
      "featured_eyebrow": "Linton Menu",
      "featured_title": "Hibachi Favorites",
      "story_eyebrow": "Now in Linton, IN",
      "story_title": "Same Samurai. New Home in Linton.",
      "story_body": [
        "Samurai Hibachi brings its signature flame-grilled hibachi from Martinsville to Linton, Indiana.",
        "Same recipes, same quality, same Samurai spirit — now closer to you."
      ],
      "stats": [],
      "reviews": [],
      "brochures": [],
      "cta_title": "Pickup in Linton, IN",
      "cta_subtitle": "Order ahead and skip the wait. Delivery coming soon.",
      "cta_buttons": [
        {"label": "Start Pickup Order", "href": "/order"}
      ],
      "menu_page_title": "Linton Menu",
      "menu_page_subtitle": "Menu coming soon — synced from Square Linton when the location POS is connected."
    },

    "assets": {
      "logo": "/samurai-logo.png",
      "favicon": "/favicon.svg",
      "og_image": "/samurai-linton-og.jpg"
    },

    "identity": {
      "name": "Samurai Hibachi — Linton",
      "brand": "samurai",
      "tagline": "Now in Linton, IN",
      "cuisine": "Japanese Hibachi & Sushi",
      "city": "Linton",
      "state": "IN",
      "order_types": ["pickup"],
      "languages": ["en"],
      "notes": "Photos and address TBD from Malik. Menu from Square Linton only — never Martinsville catalog."
    },

    "seo": {
      "title": "Samurai Hibachi — Linton, IN | Order Pickup Online",
      "description": "Samurai Hibachi in Linton, Indiana. Order hibachi pickup online. Same Samurai quality — new Linton location. Opening soon.",
      "canonical": "https://samurailinton.com",
      "og_title": "Samurai Hibachi — Linton, IN",
      "og_description": "The same Samurai fire, now in Linton, Indiana. Order pickup online.",
      "og_image": "https://samurailinton.com/samurai-linton-og.jpg",
      "og_url": "https://samurailinton.com",
      "og_site_name": "Samurai Hibachi — Linton",
      "keywords": "samurai hibachi linton indiana, hibachi linton in, japanese restaurant linton, samurai linton order online"
    },

    "metaTitle": "Samurai Hibachi — Linton, IN | Order Pickup Online",
    "metaDescription": "Samurai Hibachi in Linton, Indiana. Order hibachi pickup online. Same Samurai quality — new Linton location.",
    "ogTitle": "Samurai Hibachi — Linton, IN",
    "ogDescription": "The same Samurai fire, now in Linton, Indiana. Order pickup online.",
    "ogImage": "/samurai-linton-og.jpg",
    "cuisine": ["Japanese", "Hibachi", "Sushi"]
  }$$::jsonb,
  'platform',
  'active',
  'square',
  'pos-full'
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  logo_url = EXCLUDED.logo_url,
  favicon_url = EXCLUDED.favicon_url,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  service_area_radius = EXCLUDED.service_area_radius,
  pickup_business_name = EXCLUDED.pickup_business_name,
  hours = EXCLUDED.hours,
  theme = EXCLUDED.theme,
  anchor_mode = EXCLUDED.anchor_mode,
  status = EXCLUDED.status;

-- Ensure menu stays empty (no Martinsville clone)
DELETE FROM menu_items WHERE tenant_id = 'samurai-linton';
DELETE FROM menu_categories WHERE tenant_id = 'samurai-linton';

SELECT id, slug, domain, city, state, anchor_mode,
       theme->'layout'->>'hero_variant' AS hero,
       theme->'layout'->>'featured_variant' AS featured,
       theme->'layout'->'sections' AS sections,
       theme->>'use_shared_food_photos' AS shared_photos,
       theme->'order_types' AS order_types,
       theme->'seo'->>'canonical' AS canonical
FROM tenants WHERE id = 'samurai-linton';

SELECT tenant_id, count(*) AS menu_items
FROM menu_items WHERE tenant_id IN ('samurai','samurai-linton','kirin')
GROUP BY 1 ORDER BY 1;
