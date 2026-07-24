/**
 * Step 8 helpers — GBP / GSC status for onboarding wizard.
 * OAuth rows are keyed by live tenant_id (same constraint as Meta Step 7).
 */
import { eq } from "drizzle-orm";
import {
  db,
  gscOauthConnectionsTable,
  onboardingInvitesTable,
  tenantsTable,
} from "@workspace/db";
import { getGbpOauthConnection } from "./gbpOauth";
import { GBP_TRIAL_TENANT_IDS, isGbpTrialTenant } from "./gbpConfig";

export type OnboardingGoogleStatus = {
  targetTenantId: string | null;
  targetSlug: string | null;
  gbpConnected: boolean;
  gscConnected: boolean;
  gscSiteUrl: string | null;
  gbpAllowlist: string[];
  recommendedGbpStatus: "manual" | "pending" | "connected";
  recommendedGscPath: "contact_us" | "verified";
  contactUsMessage: string;
  note: string;
};

const CONTACT_US_MESSAGE =
  "Hubungi tim kami untuk mengaktifkan Google Search Console / Business Profile — email support@orderlyfoods.com. Self-serve Google OAuth is ops/dashboard for allow-listed tenants.";

export async function getOnboardingGoogleStatus(input: {
  inviteId: string | null | undefined;
}): Promise<OnboardingGoogleStatus> {
  const base: OnboardingGoogleStatus = {
    targetTenantId: null,
    targetSlug: null,
    gbpConnected: false,
    gscConnected: false,
    gscSiteUrl: null,
    gbpAllowlist: [...GBP_TRIAL_TENANT_IDS],
    recommendedGbpStatus: "manual",
    recommendedGscPath: "contact_us",
    contactUsMessage: CONTACT_US_MESSAGE,
    note: "Greenfield onboarding: mark GBP manual/pending and GSC contact-us until publish + ops connect.",
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
  const tenantId = tenant?.id || null;
  base.targetTenantId = tenantId;
  if (!tenantId) {
    base.note =
      "Invite target slug has no live tenant yet — use GBP manual/pending + GSC contact-us.";
    return base;
  }

  const gbp = await getGbpOauthConnection(tenantId);
  base.gbpConnected = Boolean(gbp);
  if (base.gbpConnected) base.recommendedGbpStatus = "connected";
  else if (isGbpTrialTenant(tenantId)) {
    base.recommendedGbpStatus = "pending";
    base.note =
      "Target tenant is on GBP trial allow-list — connect via dashboard, or leave pending.";
  }

  const [gsc] = await db
    .select({
      siteUrl: gscOauthConnectionsTable.siteUrl,
    })
    .from(gscOauthConnectionsTable)
    .where(eq(gscOauthConnectionsTable.tenantId, tenantId))
    .limit(1);
  if (gsc?.siteUrl) {
    base.gscConnected = true;
    base.gscSiteUrl = gsc.siteUrl;
    base.recommendedGscPath = "verified";
    base.note = base.gbpConnected
      ? "GBP + GSC OAuth verified for invite target tenant."
      : "GSC OAuth verified; GBP still manual/pending unless connected.";
  }

  return base;
}
