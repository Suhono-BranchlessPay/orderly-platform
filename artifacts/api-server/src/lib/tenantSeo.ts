import type { TenantContext } from "./tenant";

export type TenantSeo = {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  siteName: string;
  favicon: string;
  brandName: string;
  tagline: string;
  phone: string | null;
  email: string | null;
  facebookUrl: string | null;
  cuisine: string[];
  ratingValue: string | null;
  reviewCount: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
  };
  lat: number;
  lng: number;
};

function themeStr(
  theme: Record<string, unknown>,
  key: string,
): string | null {
  const v = theme[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function themeStrArray(
  theme: Record<string, unknown>,
  key: string,
): string[] | null {
  const v = theme[key];
  if (!Array.isArray(v)) return null;
  const out = v.filter(
    (x): x is string => typeof x === "string" && Boolean(x.trim()),
  );
  return out.length ? out : null;
}

function themeObj(
  theme: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = theme[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function absoluteUrl(domain: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `https://${domain}${path}`;
}

/** Build public SEO/identity payload from tenant row + theme JSON (Theme Pack). */
export function buildTenantSeo(tenant: TenantContext): TenantSeo {
  const theme = tenant.theme ?? {};
  const identity = themeObj(theme, "identity");
  const seo = themeObj(theme, "seo");
  const assets = themeObj(theme, "assets");

  const brandName =
    (identity && themeStr(identity, "name")) ||
    themeStr(theme, "brandName") ||
    tenant.name ||
    "Restaurant";
  const cityState = [tenant.city, tenant.state].filter(Boolean).join(", ");
  const defaultTitle = cityState
    ? `${brandName} | ${cityState} — Order Online`
    : `${brandName} — Order Online`;
  const defaultDescription = cityState
    ? `Order online from ${brandName} in ${cityState}. Fresh pickup and delivery — no marketplace fees.`
    : `Order online from ${brandName}. Fresh pickup and delivery.`;

  const title =
    (seo && themeStr(seo, "title")) ||
    themeStr(theme, "metaTitle") ||
    defaultTitle;
  const description =
    (seo && themeStr(seo, "description")) ||
    themeStr(theme, "metaDescription") ||
    defaultDescription;
  const keywords =
    (seo && themeStr(seo, "keywords")) ||
    themeStr(theme, "metaKeywords") ||
    [brandName, tenant.city, tenant.state, "order online", "hibachi"]
      .filter(Boolean)
      .join(", ");
  const ogTitle =
    (seo && themeStr(seo, "og_title")) ||
    themeStr(theme, "ogTitle") ||
    title;
  const ogDescription =
    (seo && themeStr(seo, "og_description")) ||
    themeStr(theme, "ogDescription") ||
    description;
  const ogImagePath =
    (seo && themeStr(seo, "og_image")) ||
    (assets && themeStr(assets, "og_image")) ||
    themeStr(theme, "ogImage") ||
    tenant.logoUrl ||
    "/og-image.jpg";
  const favicon =
    tenant.faviconUrl ||
    (assets && themeStr(assets, "favicon")) ||
    themeStr(theme, "faviconUrl") ||
    "/favicon.svg";

  // Canonical MUST be this tenant's domain — never another restaurant's.
  const canonicalFromSeo = seo && themeStr(seo, "canonical");
  const canonical = canonicalFromSeo
    ? canonicalFromSeo.replace(/\/?$/, "/")
    : `https://${tenant.domain}/`;
  const ogUrl =
    (seo && themeStr(seo, "og_url")) ||
    canonical.replace(/\/?$/, "/");
  const siteName =
    (seo && themeStr(seo, "og_site_name")) || brandName;
  const ogImage = absoluteUrl(
    tenant.domain,
    ogImagePath.replace(/^https?:\/\/[^/]+/i, "") || ogImagePath,
  );
  // If og_image was already absolute for this domain, keep it
  const ogImageFinal = /^https?:\/\//i.test(ogImagePath)
    ? ogImagePath
    : ogImage;

  const cuisineFromIdentity =
    identity && typeof identity.cuisine === "string"
      ? [identity.cuisine]
      : null;

  return {
    title,
    description,
    keywords,
    canonical,
    ogTitle,
    ogDescription,
    ogImage: ogImageFinal,
    ogUrl: ogUrl.endsWith("/") ? ogUrl : `${ogUrl}/`,
    siteName,
    favicon: favicon.startsWith("http")
      ? favicon
      : absoluteUrl(tenant.domain, favicon),
    brandName,
    tagline:
      (identity && themeStr(identity, "tagline")) ||
      themeStr(theme, "tagline") ||
      "Order online for pickup or delivery.",
    phone: tenant.pickupPhone,
    email:
      (identity && themeStr(identity, "email")) ||
      themeStr(theme, "contactEmail"),
    facebookUrl: themeStr(theme, "facebookUrl"),
    cuisine:
      themeStrArray(theme, "cuisine") ||
      cuisineFromIdentity ||
      ["Japanese", "Hibachi"],
    ratingValue: themeStr(theme, "ratingValue"),
    reviewCount: themeStr(theme, "reviewCount"),
    address: {
      street: tenant.address,
      city: tenant.city,
      state: tenant.state,
      postcode: tenant.postcode,
    },
    lat: tenant.lat,
    lng: tenant.lng,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJson(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** HTML fragment for <head> — title, meta, OG, Twitter, favicon, JSON-LD. */
export function renderTenantHeadHtml(seo: TenantSeo): string {
  const sameAs = seo.facebookUrl
    ? `,\n      "sameAs": ["${escapeJson(seo.facebookUrl)}"]`
    : "";
  const rating =
    seo.ratingValue && seo.reviewCount
      ? `,
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "${escapeJson(seo.ratingValue)}",
        "reviewCount": "${escapeJson(seo.reviewCount)}"
      }`
      : "";
  const email = seo.email
    ? `,\n      "email": "${escapeJson(seo.email)}"`
    : "";
  const phone = seo.phone
    ? `,\n      "telephone": "${escapeJson(seo.phone)}"`
    : "";
  const cuisine = seo.cuisine.map((c) => `"${escapeJson(c)}"`).join(", ");

  return `    <title>${escapeHtml(seo.title)}</title>
    <meta name="description" content="${escapeHtml(seo.description)}" />
    <meta name="keywords" content="${escapeHtml(seo.keywords)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapeHtml(seo.canonical)}" />

    <!-- Open Graph -->
    <meta property="og:type" content="restaurant" />
    <meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(seo.ogUrl)}" />
    <meta property="og:image" content="${escapeHtml(seo.ogImage)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="${escapeHtml(seo.siteName)}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(seo.ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(seo.ogDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(seo.ogImage)}" />

    <!-- Favicon -->
    <link rel="icon" href="${escapeHtml(seo.favicon)}" />

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "name": "${escapeJson(seo.brandName)}",
      "image": "${escapeJson(seo.ogImage)}",
      "url": "${escapeJson(seo.canonical)}"${phone}${email},
      "priceRange": "$$",
      "servesCuisine": [${cuisine}],
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "${escapeJson(seo.address.street || "")}",
        "addressLocality": "${escapeJson(seo.address.city || "")}",
        "addressRegion": "${escapeJson(seo.address.state || "")}",
        "postalCode": "${escapeJson(seo.address.postcode || "")}",
        "addressCountry": "US"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": ${Number.isFinite(seo.lat) ? seo.lat : 0},
        "longitude": ${Number.isFinite(seo.lng) ? seo.lng : 0}
      }${rating},
      "hasMenu": "${escapeJson(seo.canonical)}menu",
      "potentialAction": {
        "@type": "OrderAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "${escapeJson(seo.canonical)}order"
        },
        "deliveryMethod": ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeDirectDownload"]
      }${sameAs}
    }
    </script>`;
}

const HEAD_START = "<!-- ORDERLY:TENANT_HEAD -->";
const HEAD_END = "<!-- /ORDERLY:TENANT_HEAD -->";

/** Replace the ORDERLY tenant head block in a built index.html. */
export function injectTenantHead(html: string, seo: TenantSeo): string {
  const block = `${HEAD_START}\n${renderTenantHeadHtml(seo)}\n    ${HEAD_END}`;
  const start = html.indexOf(HEAD_START);
  const end = html.indexOf(HEAD_END);
  if (start === -1 || end === -1 || end < start) {
    // Fallback: replace <title>…</title> at least
    return html.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtml(seo.title)}</title>`,
    );
  }
  return (
    html.slice(0, start) + block + html.slice(end + HEAD_END.length)
  );
}
