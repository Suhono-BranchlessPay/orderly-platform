import type { TenantContext } from "./tenant";
import {
  buildTenantSeo,
  type TenantSeo,
  injectTenantHead,
} from "./tenantSeo";
import { getSeoChrome } from "./seoI18n";
import {
  absoluteLocaleUrl,
  localePath,
  resolveSeoLocales,
  SEO_LOCALE_META,
  type SeoLocale,
} from "./seoLocales";

export type SeoTagRow = {
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  itemCount: number;
};

export type SeoPlaceRow = {
  slug: string;
  name: string;
  state: string | null;
  distanceMiles: number;
  deliveryAvailable: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  lat: number;
  lng: number;
};

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

export type SeoPageItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
};

/** Override homepage SEO for a specific path (canonical, title, JSON-LD extras). */
export function buildPageSeo(
  tenant: TenantContext,
  opts: {
    path: string;
    title: string;
    description: string;
    locale?: SeoLocale;
    noindex?: boolean;
  },
): TenantSeo {
  const base = buildTenantSeo(tenant);
  const locale = opts.locale || "en";
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const canonical = absoluteLocaleUrl(tenant.domain, locale, path);
  const meta = SEO_LOCALE_META[locale];
  return {
    ...base,
    title: opts.title,
    description: opts.description,
    ogTitle: opts.title,
    ogDescription: opts.description,
    canonical,
    ogUrl: canonical,
  };
}

export function renderHreflangLinks(opts: {
  domain: string;
  path: string;
  locales: SeoLocale[];
}): string {
  const links = opts.locales.map((loc) => {
    const href = absoluteLocaleUrl(opts.domain, loc, opts.path);
    return `    <link rel="alternate" hreflang="${loc}" href="${escapeHtml(href)}" />`;
  });
  const xDefault = absoluteLocaleUrl(opts.domain, "en", opts.path);
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefault)}" />`,
  );
  return links.join("\n");
}

export function applyHtmlLang(html: string, locale: SeoLocale): string {
  const meta = SEO_LOCALE_META[locale];
  return html
    .replace(/<html\b[^>]*>/i, `<html lang="${locale}" dir="${meta.dir}">`)
    .replace(
      /property="og:locale" content="[^"]*"/i,
      `property="og:locale" content="${meta.ogLocale}"`,
    );
}

export function renderTagSsrBody(opts: {
  seo: TenantSeo;
  tag: SeoTagRow;
  items: SeoPageItem[];
  relatedTags: Array<{ slug: string; name: string }>;
  locale: SeoLocale;
}): string {
  const { seo, tag, items, relatedTags, locale } = opts;
  const t = getSeoChrome(locale);
  const city = seo.address.city || "";
  const samples = items
    .slice(0, 3)
    .map((i) => i.name)
    .join(", ");
  const h1 = t.tagH1(tag.name, city, seo.brandName);
  const lead =
    locale === "en"
      ? tag.description || t.tagLead(tag.name, seo.brandName, city, samples)
      : t.tagLead(tag.name, seo.brandName, city, samples);
  const prefix = locale === "en" ? "" : `/${locale}`;

  const itemListJson = items
    .map(
      (it, i) => `{
      "@type": "ListItem",
      "position": ${i + 1},
      "item": {
        "@type": "MenuItem",
        "name": "${escapeJson(it.name)}",
        "description": "${escapeJson(it.description || "")}",
        "offers": {
          "@type": "Offer",
          "price": "${Number(it.price).toFixed(2)}",
          "priceCurrency": "USD"
        }
      }
    }`,
    )
    .join(",\n");

  const cards = items
    .map((it) => {
      const img = it.imageUrl
        ? `<img src="${escapeHtml(it.imageUrl)}" alt="${escapeHtml(it.name)}" width="120" height="90" loading="lazy" />`
        : "";
      return `<li class="seo-item">
        ${img}
        <div>
          <strong>${escapeHtml(it.name)}</strong>
          <p>${escapeHtml(it.description || "")}</p>
          <span>$${Number(it.price).toFixed(2)}</span>
        </div>
      </li>`;
    })
    .join("\n");

  const related = relatedTags
    .filter((x) => x.slug !== tag.slug)
    .slice(0, 8)
    .map(
      (x) =>
        `<a href="${prefix}/tags/${escapeHtml(x.slug)}">${escapeHtml(x.name)}</a>`,
    )
    .join(" · ");

  return `
<main class="orderly-seo-ssr" data-seo-page="tag" data-locale="${locale}">
  <nav aria-label="Breadcrumb"><a href="${prefix || "/"}">${escapeHtml(t.home)}</a> · <a href="${prefix}/menu">${escapeHtml(t.menu)}</a> · ${escapeHtml(tag.name)}</nav>
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(lead)}</p>
  <p><a href="${prefix}/order">${escapeHtml(t.orderOnline)}</a> · <a href="${prefix}/menu">${escapeHtml(t.fullMenu)}</a></p>
  <h2>${escapeHtml(t.tagOrderHeading(tag.name, seo.brandName))}</h2>
  <ul class="seo-items">${cards}</ul>
  ${related ? `<p>${escapeHtml(t.related)}: ${related}</p>` : ""}
  <address>
    ${escapeHtml(seo.brandName)} ·
    ${escapeHtml([seo.address.street, seo.address.city, seo.address.state].filter(Boolean).join(", "))}
    ${seo.phone ? ` · <a href="tel:${escapeHtml(seo.phone)}">${escapeHtml(seo.phone)}</a>` : ""}
  </address>
</main>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "${escapeJson(tag.name)} menu",
  "inLanguage": "${locale}",
  "itemListElement": [
${itemListJson}
  ]
}
</script>`;
}

export type SeoMenuSection = {
  name: string;
  description: string | null;
  items: SeoPageItem[];
};

/**
 * Crawlable /menu body + schema.org Menu (sections + MenuItems).
 * Bots see the full menu HTML before JS hydrates the SPA.
 */
export function renderMenuSsrBody(opts: {
  seo: TenantSeo;
  sections: SeoMenuSection[];
  cuisine: string;
  locale: SeoLocale;
}): string {
  const { seo, sections, cuisine, locale } = opts;
  const t = getSeoChrome(locale);
  const city = seo.address.city || "";
  const h1 = t.menuH1(cuisine, city, seo.brandName);
  const lead = t.menuLead(seo.brandName, city);
  const prefix = locale === "en" ? "" : `/${locale}`;

  const sectionHtml = sections
    .map((section) => {
      const items = section.items
        .map((it) => {
          const img = it.imageUrl
            ? `<img src="${escapeHtml(it.imageUrl)}" alt="${escapeHtml(it.name)}" width="120" height="90" loading="lazy" />`
            : "";
          return `<li class="seo-item">
        ${img}
        <div>
          <strong>${escapeHtml(it.name)}</strong>
          <p>${escapeHtml(it.description || "")}</p>
          <span>$${Number(it.price).toFixed(2)}</span>
        </div>
      </li>`;
        })
        .join("\n");
      return `<section class="seo-menu-section">
      <h2>${escapeHtml(section.name)}</h2>
      ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ""}
      <ul class="seo-items">${items}</ul>
    </section>`;
    })
    .join("\n");

  const sectionJson = sections
    .map((section) => {
      const itemsJson = section.items
        .map(
          (it) => `{
          "@type": "MenuItem",
          "name": "${escapeJson(it.name)}",
          "description": "${escapeJson(it.description || "")}",
          "offers": {
            "@type": "Offer",
            "price": "${Number(it.price).toFixed(2)}",
            "priceCurrency": "USD"
          }
        }`,
        )
        .join(",\n");
      return `{
      "@type": "MenuSection",
      "name": "${escapeJson(section.name)}",
      "hasMenuItem": [
${itemsJson}
      ]
    }`;
    })
    .join(",\n");

  return `
<main class="orderly-seo-ssr" data-seo-page="menu" data-locale="${locale}">
  <nav aria-label="Breadcrumb"><a href="${prefix || "/"}">${escapeHtml(t.home)}</a> · ${escapeHtml(t.menu)}</nav>
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(lead)}</p>
  <p><a href="${prefix}/order">${escapeHtml(t.orderOnline)}</a></p>
  ${sectionHtml}
  <address>
    ${escapeHtml(seo.brandName)} ·
    ${escapeHtml([seo.address.street, seo.address.city, seo.address.state].filter(Boolean).join(", "))}
    ${seo.phone ? ` · <a href="tel:${escapeHtml(seo.phone)}">${escapeHtml(seo.phone)}</a>` : ""}
  </address>
</main>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Menu",
  "name": "${escapeJson(seo.brandName)} ${escapeJson(cuisine)} menu",
  "inLanguage": "${locale}",
  "hasMenuSection": [
${sectionJson}
  ]
}
</script>`;
}

export function renderPlaceSsrBody(opts: {
  seo: TenantSeo;
  place: SeoPlaceRow;
  featured: SeoPageItem[];
  cuisine: string;
  locale: SeoLocale;
}): string {
  const { seo, place, featured, cuisine, locale } = opts;
  const t = getSeoChrome(locale);
  const miles = String(place.distanceMiles);
  const h1 = t.placeH1(cuisine, place.name, seo.brandName);
  const lead = t.placeLead(cuisine, place.name, seo.brandName, miles);
  const deliveryLine = place.deliveryAvailable
    ? t.deliveryAvailable(miles)
    : t.pickupOnly(place.name, miles);
  const prefix = locale === "en" ? "" : `/${locale}`;

  const cards = featured
    .map(
      (it) => `<li class="seo-item">
      <strong>${escapeHtml(it.name)}</strong> — $${Number(it.price).toFixed(2)}
      <p>${escapeHtml(it.description || "")}</p>
    </li>`,
    )
    .join("\n");

  return `
<main class="orderly-seo-ssr" data-seo-page="place" data-locale="${locale}">
  <nav aria-label="Breadcrumb"><a href="${prefix || "/"}">${escapeHtml(t.home)}</a> · <a href="${prefix}/menu">${escapeHtml(t.menu)}</a> · ${escapeHtml(place.name)}</nav>
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(lead)}</p>
  <p>${escapeHtml(deliveryLine)}</p>
  <p><a href="${prefix}/order">${escapeHtml(t.orderPickup)}</a> · <a href="${prefix}/menu">${escapeHtml(t.viewMenu)}</a></p>
  <h2>${escapeHtml(t.popularFrom)} ${escapeHtml(seo.brandName)}</h2>
  <ul class="seo-items">${cards}</ul>
  <h2>${escapeHtml(t.restaurantLocation)}</h2>
  <address>
    ${escapeHtml(seo.brandName)}<br/>
    ${escapeHtml([seo.address.street, seo.address.city, seo.address.state, seo.address.postcode].filter(Boolean).join(", "))}
    ${seo.phone ? `<br/><a href="tel:${escapeHtml(seo.phone)}">${escapeHtml(seo.phone)}</a>` : ""}
  </address>
  <p><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(
    [seo.address.street, seo.address.city, seo.address.state].filter(Boolean).join(", "),
  )}">${escapeHtml(t.mapDirections)}</a></p>
</main>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "${escapeJson(seo.brandName)}",
  "url": "${escapeJson(seo.canonical)}",
  "inLanguage": "${locale}",
  "areaServed": {
    "@type": "City",
    "name": "${escapeJson(place.name)}"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "${escapeJson(seo.address.street || "")}",
    "addressLocality": "${escapeJson(seo.address.city || "")}",
    "addressRegion": "${escapeJson(seo.address.state || "")}",
    "postalCode": "${escapeJson(seo.address.postcode || "")}",
    "addressCountry": "US"
  }
}
</script>`;
}

const SSR_START = "<!-- ORDERLY:SSR_BODY -->";
const SSR_END = "<!-- /ORDERLY:SSR_BODY -->";

/** Inject crawlable body into #root so bots see real content before JS. */
export function injectSsrBody(html: string, body: string): string {
  const wrapped = `<div id="root">${SSR_START}${body}${SSR_END}</div>`;
  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', wrapped);
  }
  if (html.includes('id="root"')) {
    return html.replace(/<div id="root">[\s\S]*?<\/div>/, wrapped);
  }
  return html;
}

export function injectPageHead(
  html: string,
  seo: TenantSeo,
  extraHead = "",
  locale: SeoLocale = "en",
): string {
  let out = injectTenantHead(html, seo);
  out = applyHtmlLang(out, locale);
  if (extraHead) {
    out = out.replace("</head>", `${extraHead}\n</head>`);
  }
  return out;
}

export function robotsMetaNoindex(): string {
  return `    <meta name="robots" content="noindex, follow" />\n`;
}

export function hreflangForTenantPage(
  tenant: TenantContext,
  logicalPath: string,
): string {
  const locales = resolveSeoLocales(tenant);
  return renderHreflangLinks({
    domain: tenant.domain,
    path: logicalPath,
    locales,
  });
}

export { localePath, resolveSeoLocales };
