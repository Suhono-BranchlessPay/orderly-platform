-- Identity Pack: Samurai Hibachi & Sushi
-- Different structure from Kirin (hero/nav/footer/sections/copy).
-- Bundled food photos remain Samurai-only via use_shared_food_photos + frontend defaults.
-- Safe to re-run.

UPDATE tenants SET
  theme = COALESCE(theme, '{}'::jsonb) || $$
{
  "personality": "neighborhood-sushi-hibachi",
  "brandName": "Samurai Hibachi & Sushi",
  "brandShort": "Samurai",
  "use_shared_food_photos": true,
  "layout": {
    "hero_variant": "hero-fullimage-bold",
    "menu_variant": "menu-grid",
    "nav_variant": "nav-minimal-light",
    "footer_variant": "footer-classic",
    "featured_variant": "featured-grid",
    "section_style": "clean",
    "sections": ["hero", "menu_download", "featured", "reviews", "story"]
  },
  "copy": {
    "hero_headline": ["Fresh Sushi.", "Hot Hibachi.", "Delivered Fast."],
    "hero_subheadline": "Order directly from Samurai. No hidden marketplace fees. Fresh from our kitchen.",
    "hero_ctas": [
      {"label": "Order Pickup", "href": "/order", "style": "primary"},
      {"label": "Order Delivery", "href": "/order", "style": "primary"},
      {"label": "View Menu", "href": "/menu", "style": "outline"}
    ],
    "featured_eyebrow": "Chef's Selection",
    "featured_title": "Featured Dishes",
    "story_eyebrow": "Our Story",
    "story_title": "The Neighborhood Japanese Experience",
    "story_body": [
      "Step into a special occasion every day. At Samurai Hibachi & Sushi, we blend the artistry of traditional Japanese culinary techniques with the warmth of a local neighborhood gathering place.",
      "Whether you're celebrating a family milestone around our sizzling hibachi grills or enjoying an intimate date night with our signature sushi rolls, you'll find deep rich flavors and a welcoming atmosphere."
    ],
    "story_image_label": "Beef Bento Box",
    "story_image_caption": "Steak · Rice · Veggies · Spring Roll · Sushi",
    "stats": [
      {"value": "79+", "label": "Menu Items"},
      {"value": "100%", "label": "Fresh Daily"},
      {"value": "Local", "label": "Martinsville, IN"}
    ],
    "menu_page_title": "Our Menu",
    "menu_page_subtitle": "From our sizzling hibachi grills to our masterfully crafted sushi rolls."
  }
}
$$::jsonb
WHERE id = 'samurai';

UPDATE tenants SET
  theme = theme || jsonb_build_object(
    'tagline', COALESCE(theme->>'tagline', 'Order directly from Samurai. No hidden marketplace fees. Fresh from our kitchen.'),
    'aboutText', COALESCE(theme->>'aboutText', 'Step into a special occasion every day. At Samurai Hibachi & Sushi, we blend the artistry of traditional Japanese culinary techniques with the warmth of a local neighborhood gathering place.'),
    'metaTitle', COALESCE(theme->>'metaTitle', 'Samurai Hibachi & Sushi | Martinsville, IN — Order Online'),
    'fontHeading', COALESCE(theme->>'fontHeading', 'Playfair Display'),
    'fontBody', COALESCE(theme->>'fontBody', 'DM Sans')
  )
WHERE id = 'samurai';

SELECT id,
       theme->'layout'->>'hero_variant' AS hero,
       theme->'layout'->>'menu_variant' AS menu,
       theme->'layout'->>'nav_variant' AS nav,
       theme->'layout'->>'footer_variant' AS footer,
       theme->'layout'->'sections' AS sections,
       theme->'copy'->'hero_headline' AS headline
FROM tenants WHERE id = 'samurai';
