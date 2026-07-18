import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db, menuItemsTable, menuCategoriesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { resolveTenant } from "../lib/tenant";
import { buildTenantSeo } from "../lib/tenantSeo";
import {
  getTagPage,
  listIndexableTags,
  rebuildSeoTagsForTenant,
  resolveCanonicalTag,
  slugifySeo,
} from "../lib/seoTags";
import {
  getPlacePage,
  listIndexablePlaces,
  rebuildSeoPlacesForTenant,
} from "../lib/seoPlaces";
import {
  buildPageSeo,
  hreflangForTenantPage,
  injectPageHead,
  injectSsrBody,
  renderMenuSsrBody,
  renderPlaceSsrBody,
  renderTagSsrBody,
  type SeoMenuSection,
} from "../lib/seoRender";
import { getSeoChrome } from "../lib/seoI18n";
import { absoluteLocaleUrl, parseLocalePath } from "../lib/seoLocales";
import { logger } from "../lib/logger";

/**
 * Directory of the Vite storefront build (contains index.html + assets).
 * Set STOREFRONT_DIST in production so Express can inject per-tenant SEO.
 */
export function getStorefrontDist(): string | null {
  const fromEnv = process.env.STOREFRONT_DIST?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return null;
}

function isAssetPath(urlPath: string): boolean {
  return /\.[a-z0-9]+$/i.test(urlPath) && !urlPath.endsWith(".html");
}

async function ensureSeo(
  tenant: NonNullable<Awaited<ReturnType<typeof resolveTenant>>>,
) {
  const [tags, places] = await Promise.all([
    listIndexableTags(tenant.id),
    listIndexablePlaces(tenant.id),
  ]);
  if (tags.length === 0) await rebuildSeoTagsForTenant(tenant);
  if (places.length === 0) await rebuildSeoPlacesForTenant(tenant);
}

/**
 * Serve SPA index.html with Host-resolved tenant meta injected server-side.
 * For /tags/:slug and /places/:slug (+ locale prefixes), inject crawlable SSR.
 */
export function createSpaHtmlHandler(
  storefrontDist: string,
): RequestHandler {
  const indexPath = path.join(storefrontDist, "index.html");
  let cachedTemplate: string | null = null;
  let cachedMtimeMs = 0;

  function loadTemplate(): string {
    const stat = fs.statSync(indexPath);
    if (cachedTemplate && stat.mtimeMs === cachedMtimeMs) {
      return cachedTemplate;
    }
    cachedTemplate = fs.readFileSync(indexPath, "utf8");
    cachedMtimeMs = stat.mtimeMs;
    return cachedTemplate;
  }

  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const urlPath = req.path || "/";
    if (urlPath.startsWith("/api")) {
      next();
      return;
    }
    if (isAssetPath(urlPath)) {
      next();
      return;
    }

    try {
      if (!fs.existsSync(indexPath)) {
        res.status(503).send("Storefront build not found. Run frontend build.");
        return;
      }

      const tenant = await resolveTenant({
        host: req.headers.host,
        slugHint:
          typeof req.headers["x-tenant-slug"] === "string"
            ? req.headers["x-tenant-slug"]
            : typeof req.query.tenant === "string"
              ? req.query.tenant
              : undefined,
        allowEnvFallback: true,
      });

      if (!tenant) {
        res.status(404).send("Unknown restaurant domain.");
        return;
      }

      const template = loadTemplate();
      const { locale, path: logicalPath } = parseLocalePath(urlPath);
      const tagMatch = logicalPath.match(/^\/tags\/([^/]+)\/?$/i);
      const placeMatch = logicalPath.match(/^\/places\/([^/]+)\/?$/i);
      const chrome = getSeoChrome(locale);

      if (tagMatch) {
        await ensureSeo(tenant);
        const slug = decodeURIComponent(tagMatch[1]);
        const resolved = resolveCanonicalTag(slug);
        if (!resolved) {
          res.status(404).send(chrome.thinTag);
          return;
        }
        // Alias → canonical (e.g. /tags/drink → /tags/drinks) so Google consolidates equity.
        if (slugifySeo(slug) !== resolved.slug) {
          const target = absoluteLocaleUrl(
            tenant.domain,
            locale,
            `/tags/${resolved.slug}`,
          );
          res.redirect(301, target);
          return;
        }
        const page = await getTagPage(tenant.id, resolved.slug);
        if (!page) {
          res.status(404).send(chrome.thinTag);
          return;
        }
        const related = await listIndexableTags(tenant.id);
        const city = buildTenantSeo(tenant).address.city || "";
        const title = chrome.tagH1(
          page.tag.name,
          city,
          buildTenantSeo(tenant).brandName,
        );
        const samples = page.items
          .slice(0, 3)
          .map((i) => i.name)
          .join(", ");
        const description =
          locale === "en"
            ? page.tag.metaDescription || page.tag.description || ""
            : chrome.tagLead(
                page.tag.name,
                buildTenantSeo(tenant).brandName,
                city,
                samples,
              );
        const pageSeo = buildPageSeo(tenant, {
          path: `/tags/${page.tag.slug}`,
          title,
          description,
          locale,
        });
        let html = injectPageHead(
          template,
          pageSeo,
          hreflangForTenantPage(tenant, `/tags/${page.tag.slug}`),
          locale,
        );
        html = injectSsrBody(
          html,
          renderTagSsrBody({
            seo: pageSeo,
            tag: page.tag,
            items: page.items,
            relatedTags: related.map((t) => ({
              slug: t.slug,
              name: t.name,
            })),
            locale,
          }),
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(html);
        return;
      }

      if (placeMatch) {
        await ensureSeo(tenant);
        const slug = decodeURIComponent(placeMatch[1]);
        const place = await getPlacePage(tenant.id, slug);
        if (!place) {
          res.status(404).send(chrome.outsideArea);
          return;
        }
        const baseSeo = buildTenantSeo(tenant);
        const cuisine = baseSeo.cuisine[0] || "Food";
        let featured = await db
          .select({
            id: menuItemsTable.id,
            name: menuItemsTable.name,
            description: menuItemsTable.description,
            price: menuItemsTable.price,
            imageUrl: menuItemsTable.imageUrl,
          })
          .from(menuItemsTable)
          .where(
            and(
              eq(menuItemsTable.tenantId, tenant.id),
              eq(menuItemsTable.available, true),
              eq(menuItemsTable.featured, true),
            ),
          )
          .limit(8);
        if (featured.length < 3) {
          featured = await db
            .select({
              id: menuItemsTable.id,
              name: menuItemsTable.name,
              description: menuItemsTable.description,
              price: menuItemsTable.price,
              imageUrl: menuItemsTable.imageUrl,
            })
            .from(menuItemsTable)
            .where(
              and(
                eq(menuItemsTable.tenantId, tenant.id),
                eq(menuItemsTable.available, true),
              ),
            )
            .limit(8);
        }
        const title = chrome.placeH1(cuisine, place.name, baseSeo.brandName);
        const description = chrome.placeLead(
          cuisine,
          place.name,
          baseSeo.brandName,
          String(place.distanceMiles),
        );
        const pageSeo = buildPageSeo(tenant, {
          path: `/places/${place.slug}`,
          title,
          description,
          locale,
        });
        let html = injectPageHead(
          template,
          pageSeo,
          hreflangForTenantPage(tenant, `/places/${place.slug}`),
          locale,
        );
        html = injectSsrBody(
          html,
          renderPlaceSsrBody({
            seo: pageSeo,
            place,
            featured,
            cuisine,
            locale,
          }),
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).send(html);
        return;
      }

      const menuMatch = /^\/menu\/?$/i.test(logicalPath);
      if (menuMatch) {
        const baseSeo = buildTenantSeo(tenant);
        const cuisine = baseSeo.cuisine[0] || "Food";
        const city = baseSeo.address.city || "";
        const [categories, items] = await Promise.all([
          db
            .select({
              name: menuCategoriesTable.name,
              description: menuCategoriesTable.description,
              sortOrder: menuCategoriesTable.sortOrder,
            })
            .from(menuCategoriesTable)
            .where(eq(menuCategoriesTable.tenantId, tenant.id))
            .orderBy(asc(menuCategoriesTable.sortOrder)),
          db
            .select({
              id: menuItemsTable.id,
              name: menuItemsTable.name,
              description: menuItemsTable.description,
              price: menuItemsTable.price,
              imageUrl: menuItemsTable.imageUrl,
              category: menuItemsTable.category,
            })
            .from(menuItemsTable)
            .where(
              and(
                eq(menuItemsTable.tenantId, tenant.id),
                eq(menuItemsTable.available, true),
              ),
            ),
        ]);

        const byCategory = new Map<string, typeof items>();
        for (const it of items) {
          const key = it.category || "Menu";
          const bucket = byCategory.get(key);
          if (bucket) bucket.push(it);
          else byCategory.set(key, [it]);
        }
        const sections: SeoMenuSection[] = [];
        const seen = new Set<string>();
        for (const cat of categories) {
          const bucket = byCategory.get(cat.name);
          if (bucket && bucket.length > 0) {
            sections.push({
              name: cat.name,
              description: cat.description,
              items: bucket,
            });
            seen.add(cat.name);
          }
        }
        // Items whose category has no matching category row — keep them crawlable.
        for (const [name, bucket] of byCategory) {
          if (!seen.has(name) && bucket.length > 0) {
            sections.push({ name, description: null, items: bucket });
          }
        }

        // Only SSR when we actually have menu content; otherwise fall through to
        // head-only injection so bots never index an empty menu page.
        if (sections.length > 0) {
          const title = chrome.menuH1(cuisine, city, baseSeo.brandName);
          const description = chrome.menuLead(baseSeo.brandName, city);
          const pageSeo = buildPageSeo(tenant, {
            path: "/menu",
            title,
            description,
            locale,
          });
          let html = injectPageHead(
            template,
            {
              ...pageSeo,
              openingHours: baseSeo.openingHours,
              cuisine: baseSeo.cuisine,
              ratingValue: baseSeo.ratingValue,
              reviewCount: baseSeo.reviewCount,
            },
            hreflangForTenantPage(tenant, "/menu"),
            locale,
          );
          html = injectSsrBody(
            html,
            renderMenuSsrBody({
              seo: pageSeo,
              sections,
              cuisine,
              locale,
            }),
          );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=300");
          res.status(200).send(html);
          return;
        }
      }

      const base = buildTenantSeo(tenant);
      const seo = buildPageSeo(tenant, {
        path: logicalPath.startsWith("/") ? logicalPath : `/${logicalPath}`,
        title: base.title,
        description: base.description,
        locale,
      });
      // Keep homepage Restaurant JSON-LD from base canonical brand data
      const html = injectPageHead(
        template,
        {
          ...seo,
          // Preserve rich Restaurant schema fields from base
          openingHours: base.openingHours,
          cuisine: base.cuisine,
          ratingValue: base.ratingValue,
          reviewCount: base.reviewCount,
        },
        hreflangForTenantPage(
          tenant,
          logicalPath === "/" ? "/" : logicalPath,
        ),
        locale,
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      logger.error({ err }, "SPA tenant HTML injection failed");
      next(err);
    }
  };
}
