-- Identity Pack: Kirin Hibachi Express
-- Layout variants + copy + sections (structurally different from Samurai).
-- Menu stays EMPTY until Square Kirin is connected.
-- Safe to re-run.

UPDATE tenants SET
  name = 'Kirin Hibachi Express',
  domain = 'kirinhibachiexpress.com',
  logo_url = '/kirin-logo-v2.png',
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
  -- hours: use migrate-kirin-hours.sql (do not reset to TBD here)
  theme = '{
    "personality": "vintage-hibachi-grill-house",
    "brandName": "Kirin Hibachi Express",
    "brandShort": "Kirin",
    "tagline": "Hibachi, made fresh & fast.",
    "aboutText": "Kirin Hibachi Express brings sizzling hibachi and fresh Japanese grill favorites to Henderson, Kentucky. Est. 2026.",
    "contactEmail": "kirinhibachiexpress26@gmail.com",
    "facebookUrl": "https://www.facebook.com/profile.php?id=61591591400890",
    "logoUrl": "/kirin-logo-v2.png",
    "faviconUrl": "/kirin-favicon.svg",
    "use_shared_food_photos": false,

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
      "hero_variant": "hero-split",
      "menu_variant": "menu-list",
      "nav_variant": "nav-solid-dark",
      "footer_variant": "footer-compact",
      "featured_variant": "featured-wide",
      "section_style": "textured",
      "sections": [
        "hero",
        "featured",
        "story",
        "catering_cta",
        "menu_download",
        "location_cta"
      ]
    },

    "copy": {
      "hero_headline": ["Sizzling Hibachi.", "Made Fresh & Fast."],
      "hero_subheadline": "Neighborhood grill in Henderson, KY — order pickup online. No marketplace markups.",
      "hero_ctas": [
        {"label": "Order Pickup", "href": "/order", "style": "primary"},
        {"label": "View Menu", "href": "/menu", "style": "outline"}
      ],
      "featured_eyebrow": "From the Grill",
      "featured_title": "Hibachi Favorites",
      "story_eyebrow": "Est. 2026",
      "story_title": "Henderson’s Neighborhood Grill",
      "story_body": [
        "Kirin Hibachi Express brings sizzling hibachi and Japanese grill favorites to Henderson, Kentucky — prepared fresh, served fast.",
        "Order online for pickup. Catering trays available for office lunch and weekend gatherings."
      ],
      "story_image_label": null,
      "story_image_caption": null,
      "stats": [],
      "reviews": [],
      "brochures": [],
      "menu_page_title": "Grill Menu",
      "menu_page_subtitle": "Fresh hibachi and Japanese grill favorites — prepared to order."
    },

    "assets": {
      "logo": "/kirin-logo-v2.png",
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

DELETE FROM menu_items WHERE tenant_id = 'kirin';
DELETE FROM menu_categories WHERE tenant_id = 'kirin';

SELECT id,
       theme->'layout'->>'hero_variant' AS hero,
       theme->'layout'->>'menu_variant' AS menu,
       theme->'layout'->>'nav_variant' AS nav,
       theme->'layout'->>'footer_variant' AS footer,
       theme->'layout'->'sections' AS sections,
       theme->'copy'->'hero_headline' AS headline,
       theme->>'use_shared_food_photos' AS shared_photos
FROM tenants WHERE id = 'kirin';
