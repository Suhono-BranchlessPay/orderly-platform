/**
 * Step 7 helpers — Meta social path selection (contact-us vs verified OAuth).
 * Meta Page OAuth requires a real allow-listed tenant_id (not a draft session).
 */
import { eq } from "drizzle-orm";
import { db, onboardingInvitesTable, tenantsTable } from "@workspace/db";
import {
  getMetaOauthConnectionForTenant,
  isMetaPageOauthEnabled,
  isTenantAllowedForMetaPageOauth,
  metaPageOauthAllowlist,
} from "./metaOauth";

export type OnboardingSocialStatus = {
  recommendedPath: "contact_us" | "oauth";
  contactUsMessage: string;
  oauthAvailable: boolean;
  oauthEnabled: boolean;
  allowlist: string[];
  targetTenantId: string | null;
  targetSlug: string | null;
  oauthConnected: boolean;
  ibaVerified: boolean;
  pageId: string | null;
  pageName: string | null;
  note: string;
};

const CONTACT_US_MESSAGE =
  "Hubungi tim kami untuk mengaktifkan Facebook / Instagram — email support@orderlyfoods.com. Self-serve Meta connect is only for Orderly-controlled / allow-listed tenants after Advanced Access.";

export async function getOnboardingSocialStatus(input: {
  inviteId: string | null | undefined;
}): Promise<OnboardingSocialStatus> {
  const base: OnboardingSocialStatus = {
    recommendedPath: "contact_us",
    contactUsMessage: CONTACT_US_MESSAGE,
    oauthAvailable: false,
    oauthEnabled: isMetaPageOauthEnabled(),
    allowlist: metaPageOauthAllowlist(),
    targetTenantId: null,
    targetSlug: null,
    oauthConnected: false,
    ibaVerified: false,
    pageId: null,
    pageName: null,
    note: "Greenfield onboarding uses contact-us until a draft tenant is published and allow-listed.",
  };

  if (!input.inviteId) return base;

  const [invite] = await db
    .select()
    .from(onboardingInvitesTable)
    .where(eq(onboardingInvitesTable.id, input.inviteId))
    .limit(1);
  const slug = invite?.targetSlug?.trim() || null;
  if (!slug) return base;

  base.targetSlug = slug;
  const [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);

  const tenantId = tenant?.id || slug;
  base.targetTenantId = tenant?.id ?? null;

  const allowed =
    isTenantAllowedForMetaPageOauth(tenantId) ||
    isTenantAllowedForMetaPageOauth(slug);
  if (!allowed || !base.oauthEnabled) {
    base.note =
      "This invite’s target is not allow-listed for Meta Page OAuth. Use contact-us.";
    return base;
  }

  const conn = await getMetaOauthConnectionForTenant(tenantId);
  const connected = Boolean(conn?.pageId);
  base.oauthAvailable = true;
  base.oauthConnected = connected;
  // Page OAuth with pageId = identity verified for inbox path (IBA deep-check is ops).
  base.ibaVerified = connected;
  base.pageId = conn?.pageId ?? null;
  base.pageName = conn?.pageName ?? null;
  base.recommendedPath = connected ? "oauth" : "contact_us";
  base.note = connected
    ? "Meta Page OAuth already verified for this invite’s target tenant."
    : "Target tenant is allow-listed — connect Meta from the dashboard, then complete Step 7 via OAuth path. Until then use contact-us.";
  return base;
}
