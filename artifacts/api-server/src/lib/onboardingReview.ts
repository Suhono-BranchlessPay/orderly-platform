/**
 * Step 11 — Review & Go Live gate evaluation (fail-closed checklist).
 * Publish still creates draft/inactive tenants only.
 */
import type { OnboardingSession } from "@workspace/db";
import type { WizardState } from "./onboardingWizard";
import { resolveTenantTaxRate } from "./tenantTax";

export type OnboardingGate = {
  key: string;
  step: number;
  label: string;
  ok: boolean;
  detail: string | null;
};

export type OnboardingReviewResult = {
  gates: OnboardingGate[];
  allRequiredOk: boolean;
  blocking: string[];
  summary: {
    restaurantName: string | null;
    domain: string | null;
    timezone: string | null;
    taxRate: number | null;
    squareConnected: boolean;
    ownerEmail: string | null;
    sendHourLocal: number | null;
    gbpStatus: string | null;
    gscPath: string | null;
    healthDeptCleared: boolean;
    reviewReady: boolean;
  };
  publishEnabled: boolean;
};

export function evaluateOnboardingReview(
  session: OnboardingSession,
  opts?: { publishEnabled?: boolean },
): OnboardingReviewResult {
  const wizard = (session.wizard as WizardState) || {};
  const completed = new Set(
    Array.isArray(wizard.completedSteps) ? wizard.completedSteps : [],
  );

  const identityOk = Boolean(
    wizard.identity?.phone &&
      wizard.identity.phone.trim().length >= 7 &&
      wizard.identity.websiteDomain?.trim() &&
      completed.has(1),
  );
  const serviceOk = Boolean(
    wizard.serviceStyle?.presentation && completed.has(2),
  );
  const hoursOk = Boolean(
    wizard.hours?.timezoneConfirmed &&
      wizard.hours.timezone?.trim() &&
      completed.has(3),
  );
  const taxRate = resolveTenantTaxRate({
    taxRate: wizard.squareConnect?.taxRate,
  });
  const squareOk = Boolean(
    session.squareMerchantId &&
      session.squareLocationId &&
      wizard.squareConnect?.taxConfirmed &&
      taxRate != null &&
      completed.has(4),
  );
  const catalogOk = Boolean(
    wizard.catalog?.ambiguousReviewed &&
      wizard.catalog?.skuPrefixUniqueConfirmed &&
      completed.has(5),
  );
  const photosOk = Boolean(
    wizard.photos?.coverageAcknowledged && completed.has(6),
  );
  const socialOk = Boolean(
    wizard.social &&
      completed.has(7) &&
      ((wizard.social.path === "contact_us" &&
        wizard.social.contactUsAcknowledged) ||
        (wizard.social.path === "oauth" &&
          wizard.social.oauthConnected &&
          wizard.social.ibaVerified)),
  );
  const googleOk = Boolean(
    wizard.google &&
      completed.has(8) &&
      wizard.google.gbpStatus &&
      ((wizard.google.gscPath === "contact_us" &&
        wizard.google.contactUsAcknowledged) ||
        (wizard.google.gscPath === "verified" && wizard.google.gscConnected)) &&
      !(
        wizard.google.gbpStatus === "connected" && !wizard.google.gbpConnected
      ),
  );
  const opsOk = Boolean(
    wizard.ops?.ownerEmail &&
      typeof wizard.ops.sendHourLocal === "number" &&
      wizard.ops.opsAck === true &&
      wizard.ops.timezone &&
      completed.has(9),
  );
  const complianceOk = Boolean(
    wizard.compliance?.healthDeptCleared === true && completed.has(10),
  );
  const reviewOk = Boolean(
    wizard.review?.reviewAcknowledged === true &&
      wizard.review?.goLiveAcknowledged === true &&
      completed.has(11),
  );

  const gates: OnboardingGate[] = [
    {
      key: "identity",
      step: 1,
      label: "Business identity (phone + domain)",
      ok: identityOk,
      detail: wizard.identity?.websiteDomain || null,
    },
    {
      key: "serviceStyle",
      step: 2,
      label: "Service style",
      ok: serviceOk,
      detail: wizard.serviceStyle?.presentation || null,
    },
    {
      key: "hours",
      step: 3,
      label: "Hours & timezone confirmed",
      ok: hoursOk,
      detail: wizard.hours?.timezone || null,
    },
    {
      key: "square",
      step: 4,
      label: "Square connected + tax confirmed",
      ok: squareOk,
      detail:
        taxRate != null
          ? `tax ${(taxRate * 100).toFixed(2)}% · loc ${session.squareLocationId || "—"}`
          : null,
    },
    {
      key: "catalog",
      step: 5,
      label: "Catalog / SKU gates",
      ok: catalogOk,
      detail: wizard.catalog?.skuPrefix
        ? `prefix ${wizard.catalog.skuPrefix}`
        : null,
    },
    {
      key: "photos",
      step: 6,
      label: "Photo coverage acknowledged",
      ok: photosOk,
      detail:
        wizard.photos?.missingPhotoCount != null
          ? `missing ${wizard.photos.missingPhotoCount}`
          : null,
    },
    {
      key: "social",
      step: 7,
      label: "Social path",
      ok: socialOk,
      detail: wizard.social?.path || null,
    },
    {
      key: "google",
      step: 8,
      label: "Google GBP + GSC",
      ok: googleOk,
      detail: wizard.google
        ? `${wizard.google.gbpStatus}/${wizard.google.gscPath}`
        : null,
    },
    {
      key: "ops",
      step: 9,
      label: "Daily report ops",
      ok: opsOk,
      detail: wizard.ops?.ownerEmail
        ? `${wizard.ops.ownerEmail} @ ${wizard.ops.sendHourLocal}:00 ${wizard.ops.timezone || ""}`.trim()
        : null,
    },
    {
      key: "compliance",
      step: 10,
      label: "Health Dept clearance",
      ok: complianceOk,
      detail: wizard.compliance?.healthDeptNotes || null,
    },
    {
      key: "review",
      step: 11,
      label: "Review & Go Live acknowledgements",
      ok: reviewOk,
      detail: reviewOk ? "ready" : "not acknowledged yet",
    },
  ];

  const required = gates.filter((g) => g.step <= 10);
  const blocking = required.filter((g) => !g.ok).map((g) => g.label);
  const allRequiredOk = blocking.length === 0;
  const publishEnabled =
    opts?.publishEnabled ?? process.env.ONBOARDING_PUBLISH_ENABLED === "1";

  return {
    gates,
    allRequiredOk,
    blocking,
    summary: {
      restaurantName:
        wizard.identity?.publicDisplayName || session.restaurantName || null,
      domain: wizard.identity?.websiteDomain || session.domain || null,
      timezone: wizard.hours?.timezone || wizard.ops?.timezone || null,
      taxRate,
      squareConnected: Boolean(
        session.squareMerchantId && session.squareLocationId,
      ),
      ownerEmail: wizard.ops?.ownerEmail || null,
      sendHourLocal:
        typeof wizard.ops?.sendHourLocal === "number"
          ? wizard.ops.sendHourLocal
          : null,
      gbpStatus: wizard.google?.gbpStatus || null,
      gscPath: wizard.google?.gscPath || null,
      healthDeptCleared: wizard.compliance?.healthDeptCleared === true,
      reviewReady: reviewOk,
    },
    publishEnabled,
  };
}

export function assertPublishGates(session: OnboardingSession): void {
  const review = evaluateOnboardingReview(session);
  if (!review.allRequiredOk) {
    throw new Error(
      `Cannot publish — incomplete gates: ${review.blocking.join("; ")}`,
    );
  }
  const wizard = (session.wizard as WizardState) || {};
  const completed = new Set(
    Array.isArray(wizard.completedSteps) ? wizard.completedSteps : [],
  );
  if (
    wizard.review?.reviewAcknowledged !== true ||
    wizard.review?.goLiveAcknowledged !== true ||
    !completed.has(11)
  ) {
    throw new Error(
      "Cannot publish without Step 11 ready (review + Go Live acknowledgements). Go Live ≠ Save draft.",
    );
  }
}
