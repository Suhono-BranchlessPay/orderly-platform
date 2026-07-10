-- Apply ThemePack_Kirin.md → tenants row for Kirin
-- Menu stays EMPTY until Square Kirin is connected.
-- Safe to re-run.

UPDATE tenants SET
  name = 'Kirin Hibachi Express',
  domain = 'kirinhibachiexpress.com',
  logo_url = '/kirin-logo.png',
  favicon_url = '/kirin-favicon.svg',
  address = '2278 S Green St',
  city = 'Henderson',
  state = 'KY',
  postcode = '42420',
  lat = 37.78751,
  lng = -87.40068,
  service_area_radius = 12,
  pickup_phone = '+12708233405',
  pickup_business_name = 'Kirin Hibachi Express',
  languages = '["en"]'::jsonb,
  hours = '{
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
  theme = '{
    "personality": "vintage-hibachi-grill-house",
    "brandName": "Kirin Hibachi Express",
    "brandShort": "Kirin",
    "tagline": "Hibachi, made fresh & fast.",
    "aboutText": "Kirin Hibachi Express brings sizzling hibachi and fresh Japanese grill favorites to Henderson, Kentucky. Est. 2026.",
    "contactEmail": "kirinhibachiexpress26@gmail.com",
    "facebookUrl": "https://www.facebook.com/profile.php?id=61591591400890",
    "logoUrl": "/kirin-logo.png",
    "faviconUrl": "/kirin-favicon.svg",

    "colors": {
      "primary": "#8B2318",
      "primary_deep": "#5E1710",
      "accent": "#C8A24B",
      "accent_soft": "#E8D9B5",
      "ink": "#1A1512",
      "paper": "#F5EEE0",
      "paper_2": "#EBE0CC",
      "muted": "#6B5D4F",
      "line": "#D9CBB2",
      "dark_section": "#1A1512",
      "dark_text": "#F5EEE0"
    },

    "fonts": {
      "display": "Oswald",
      "display_fallback": "Oswald, Arial Narrow, sans-serif",
      "body": "Libre Franklin",
      "accent": "Oswald"
    },

    "layout": {
      "hero_variant": "image-bold",
      "menu_variant": "card-warm",
      "nav_variant": "solid-dark",
      "section_style": "textured"
    },

    "assets": {
      "logo": "/kirin-logo.png",
      "favicon": "/kirin-favicon.svg",
      "og_image": "/kirin-og.jpg",
      "hero_image": "/kirin-hero.jpg"
    },

    "identity": {
      "name": "Kirin Hibachi Express",
      "tagline": "Hibachi, made fresh & fast.",
      "cuisine": "Japanese Hibachi & Grill",
      "est": "2026",
      "address": "2278 S Green St, Henderson, KY 42420",
      "phone": "+1 270-823-3405",
      "email": "kirinhibachiexpress26@gmail.com",
      "delivery_radius_miles": 12,
      "order_types": ["pickup"],
      "languages": ["en"]
    },

    "seo": {
      "title": "Kirin Hibachi Express | Henderson, KY — Order Online",
      "description": "Kirin Hibachi Express in Henderson, Kentucky. Fresh, fast hibachi — order online for pickup. Est. 2026.",
      "canonical": "https://kirinhibachiexpress.com",
      "og_title": "Kirin Hibachi Express | Henderson, KY",
      "og_description": "Fresh, fast hibachi in Henderson, Kentucky. Order online for pickup.",
      "og_image": "https://kirinhibachiexpress.com/kirin-og.jpg",
      "og_url": "https://kirinhibachiexpress.com",
      "og_site_name": "Kirin Hibachi Express",
      "keywords": "kirin hibachi express henderson ky, hibachi henderson kentucky, japanese food henderson, order hibachi online henderson"
    },

    "primary": "#8B2318",
    "secondary": "#C8A24B",
    "accent": "#1A1512",
    "fontHeading": "Oswald",
    "fontBody": "Libre Franklin",
    "metaTitle": "Kirin Hibachi Express | Henderson, KY — Order Online",
    "metaDescription": "Kirin Hibachi Express in Henderson, Kentucky. Fresh, fast hibachi — order online for pickup. Est. 2026.",
    "metaKeywords": "kirin hibachi express henderson ky, hibachi henderson kentucky, japanese food henderson, order hibachi online henderson",
    "ogTitle": "Kirin Hibachi Express | Henderson, KY",
    "ogDescription": "Fresh, fast hibachi in Henderson, Kentucky. Order online for pickup.",
    "ogImage": "/kirin-og.jpg",
    "cuisine": ["Japanese", "Hibachi", "Grill"]
  }'::jsonb,
  status = 'active'
WHERE id = 'kirin';

-- Ensure menu stays empty (no Samurai clone)
DELETE FROM menu_items WHERE tenant_id = 'kirin';
DELETE FROM menu_categories WHERE tenant_id = 'kirin';

SELECT id,
       theme->'seo'->>'title' AS seo_title,
       theme->'seo'->>'canonical' AS canonical,
       theme->'colors'->>'primary' AS primary_color,
       theme->'fonts'->>'display' AS display_font,
       theme->'layout'->>'hero_variant' AS hero
FROM tenants WHERE id = 'kirin';
