/** Normalize host for tenant domain comparisons (no www, no scheme). */
export function normalizeTenantHost(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .replace(/^www\./i, "")
    .toLowerCase()
    .trim();
}

/**
 * siteUrl for GSC OAuth must be https and match the tenant's domain host.
 * Returns canonical `https://host/` or null if invalid / mismatched.
 */
export function resolveGscSiteUrlForTenant(
  siteUrlRaw: string | undefined | null,
  tenantDomain: string,
): string | null {
  const expectedHost = normalizeTenantHost(tenantDomain || "samurairesto.com");
  const fallback = `https://${expectedHost}/`;
  const candidate = (siteUrlRaw || fallback).trim();
  try {
    const withScheme = candidate.includes("://")
      ? candidate
      : `https://${candidate}`;
    const u = new URL(withScheme);
    if (u.protocol !== "https:") return null;
    const host = normalizeTenantHost(u.hostname);
    if (host !== expectedHost) return null;
    return `${u.origin.replace(/\/$/, "")}/`;
  } catch {
    return null;
  }
}
