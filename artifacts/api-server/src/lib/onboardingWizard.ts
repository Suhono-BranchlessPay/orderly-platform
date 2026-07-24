/**
 * Wizard step schemas + fail-closed validators (Step 1 first).
 * See docs/SELF_SERVE_ONBOARDING_WIZARD.md.
 */
import { z } from "zod";

export const BUSINESS_TYPES = ["restaurant", "food_truck", "hybrid"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const ADDRESS_MODES = ["physical", "host_location"] as const;
export type AddressMode = (typeof ADDRESS_MODES)[number];

/** Step 1 — Identitas Bisnis (object first so drafts can .partial()) */
export const identityObjectSchema = z.object({
  legalBusinessName: z.string().trim().min(1).max(160),
  publicDisplayName: z.string().trim().min(1).max(160),
  businessType: z.enum(BUSINESS_TYPES),
  cuisine: z.string().trim().min(1).max(80),
  addressMode: z.enum(ADDRESS_MODES),
  physicalAddress: z.string().trim().max(280).optional().nullable(),
  hostVenueName: z.string().trim().max(160).optional().nullable(),
  hostVenueAddress: z.string().trim().max(280).optional().nullable(),
  /** Fail-closed: Linton nearly shipped without phone. */
  phone: z.string().trim().min(7).max(32),
  businessEmail: z.string().trim().email().max(160),
  /** Custom domain — not *.orderlyfoods.com */
  websiteDomain: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .refine(
      (d) => !d.toLowerCase().endsWith(".orderlyfoods.com"),
      "Use your own domain (not a subdomain of orderlyfoods.com)",
    )
    .refine(
      (d) => !d.includes("://") && !d.includes("/"),
      "Enter domain only, e.g. samurailinton.com",
    ),
  facebookPageUrl: z
    .string()
    .trim()
    .url()
    .max(300)
    .optional()
    .nullable()
    .or(z.literal("")),
  instagramHandle: z.string().trim().max(80).optional().nullable(),
});

export const identitySchema = identityObjectSchema.superRefine((val, ctx) => {
  if (val.addressMode === "physical") {
    if (!val.physicalAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["physicalAddress"],
        message: "Physical address is required for restaurant / hybrid",
      });
    }
  } else {
    if (!val.hostVenueName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hostVenueName"],
        message: "Host venue name is required for food-truck host location",
      });
    }
    if (!val.hostVenueAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hostVenueAddress"],
        message: "Host venue address is required",
      });
    }
  }
});

export type WizardIdentity = z.infer<typeof identityObjectSchema>;

export const PRESENTATIONS = ["box", "plate"] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export function defaultDishTerm(presentation: Presentation): string {
  return presentation === "box" ? "boxes" : "plates";
}

/** Step 2 — Gaya Layanan (required for AI Gateway content/reports). */
export const serviceStyleObjectSchema = z.object({
  presentation: z.enum(PRESENTATIONS),
  /** Hibachi/teppanyaki show in front of guests? */
  cookingShow: z.boolean(),
  /** How to refer to dishes — defaults from presentation if empty on complete. */
  dishTerm: z.string().trim().min(1).max(40),
  dineIn: z.boolean(),
  outdoorSeating: z.boolean(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const serviceStyleSchema = serviceStyleObjectSchema;
export type WizardServiceStyle = z.infer<typeof serviceStyleObjectSchema>;
export const serviceStyleDraftSchema = serviceStyleObjectSchema.partial();

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hoursLineSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (h) => !/^(tbd|tba|todo|n\/?a|\?+)$/i.test(h),
    "Hours cannot be TBD — enter a range or Closed",
  );

export const dayHoursSchema = z.object({
  day: z.enum(WEEKDAYS),
  hours: hoursLineSchema,
});

/** Step 3 — Lokasi & Jam (timezone explicit confirm; all 7 weekdays). */
export const hoursObjectSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(isValidIanaTimeZone, "Must be a valid IANA timezone"),
  /** Explicit owner confirm — silently defaulting TZ is forbidden. */
  timezoneConfirmed: z.boolean(),
  weekly: z.array(dayHoursSchema).max(7),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const hoursSchema = hoursObjectSchema.superRefine((val, ctx) => {
  if (val.timezoneConfirmed !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timezoneConfirmed"],
      message: "Confirm the timezone is correct for this restaurant",
    });
  }
  const seen = new Set<string>();
  for (const row of val.weekly) {
    if (seen.has(row.day)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekly"],
        message: `Duplicate day: ${row.day}`,
      });
    }
    seen.add(row.day);
  }
  for (const day of WEEKDAYS) {
    if (!seen.has(day)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekly"],
        message: `Missing hours for ${day}`,
      });
    }
  }
});

export type WizardHours = z.infer<typeof hoursObjectSchema>;
export const hoursDraftSchema = hoursObjectSchema.partial().extend({
  weekly: z.array(dayHoursSchema.partial().extend({
    day: z.enum(WEEKDAYS).optional(),
    hours: z.string().trim().max(80).optional(),
  })).max(7).optional(),
});

/** Persist shape for tenants.hours (Kirin convention). */
export function hoursToTenantJson(hours: WizardHours): Record<string, unknown> {
  const byDay = new Map(hours.weekly.map((r) => [r.day, r.hours.trim()]));
  return {
    timezone: hours.timezone.trim(),
    weekly: WEEKDAYS.map((day) => ({
      day,
      hours: byDay.get(day) || "Closed",
    })),
  };
}

/**
 * Step 4 — Connect Square + tax fail-closed.
 * taxRate is a decimal fraction (0.07 = 7%), same as tenants.tax_rate.
 * Never default from another tenant (e.g. Martinsville 7% → Linton).
 */
export const squareConnectObjectSchema = z.object({
  locationId: z.string().trim().min(1).max(80),
  locationName: z.string().trim().max(160).optional().nullable(),
  taxRate: z.number().finite().min(0).max(0.25),
  taxConfirmed: z.boolean(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const squareConnectSchema = squareConnectObjectSchema.superRefine(
  (val, ctx) => {
    if (val.taxConfirmed !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxConfirmed"],
        message:
          "Confirm this tax rate is correct for this restaurant's county — do not copy another restaurant's rate",
      });
    }
  },
);

export type WizardSquareConnect = z.infer<typeof squareConnectObjectSchema>;
export const squareConnectDraftSchema = squareConnectObjectSchema.partial();

/** Accept percent (7) or decimal (0.07) from the wizard UI/API. */
export function normalizeWizardTaxRate(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // UI usually sends percent 0–25; decimals ≤ 0.25 are already fractions.
  if (n > 0.25 && n <= 25) return Math.round((n / 100) * 1_000_000) / 1_000_000;
  if (n >= 0 && n <= 0.25) return n;
  return null;
}

/** Reserved SKU prefixes already used by live Orderly tenants. */
export const RESERVED_SKU_PREFIXES = ["KRN", "SAM"] as const;

export function normalizeSkuPrefix(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const ambiguousItemSchema = z.object({
  a: z.string().trim().min(1).max(160),
  b: z.string().trim().min(1).max(160),
  reason: z.string().trim().max(120).optional().nullable(),
});

/**
 * Step 5 — Menu / catalog gates.
 * Full Square→Orderly sync runs at publish; this step confirms SKU prefix +
 * ambiguous names before Go Live.
 */
export const catalogObjectSchema = z.object({
  skuPrefix: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "SKU prefix must be letters/numbers only"),
  /** Human confirms prefix is unique for this outlet (not another tenant). */
  skuPrefixUniqueConfirmed: z.boolean(),
  /** Samurai legacy SKU00x exempt — only when explicitly opted in. */
  samuraiLegacySkuExempt: z.boolean().optional().default(false),
  itemCount: z.number().int().min(0).optional().nullable(),
  missingSkuCount: z.number().int().min(0).optional().nullable(),
  ambiguousItems: z.array(ambiguousItemSchema).max(50).optional().nullable(),
  /** Hard gate: owner reviewed / renamed conflicting names in Square. */
  ambiguousReviewed: z.boolean(),
  /** Soft checklist: prices checked in Square Dashboard. */
  pricesCheckedInSquare: z.boolean(),
  /** Soft checklist: required choices are Square modifiers, not prose. */
  modifiersInSquareConfirmed: z.boolean(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const catalogSchema = catalogObjectSchema.superRefine((val, ctx) => {
  if (val.skuPrefixUniqueConfirmed !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skuPrefixUniqueConfirmed"],
      message: "Confirm this SKU prefix is unique for this restaurant",
    });
  }
  if (val.ambiguousReviewed !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ambiguousReviewed"],
      message: "Review ambiguous menu names before continuing",
    });
  }
  if (val.pricesCheckedInSquare !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pricesCheckedInSquare"],
      message: "Confirm prices were checked in Square",
    });
  }
  if (val.modifiersInSquareConfirmed !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["modifiersInSquareConfirmed"],
      message: "Confirm required choices are Square modifiers",
    });
  }
  if (val.skuPrefix === "KRN") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skuPrefix"],
      message: "Prefix KRN is reserved for Kirin",
    });
  }
  if (val.skuPrefix === "SAM" && !val.samuraiLegacySkuExempt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skuPrefix"],
      message: "Prefix SAM is reserved (Samurai legacy exempt only when explicitly checked)",
    });
  }
});

export type WizardCatalog = z.infer<typeof catalogObjectSchema>;
export const catalogDraftSchema = catalogObjectSchema.partial();

/**
 * Step 6 — Menu photos (soft / warn gate).
 * Progress OK to continue; not a hard % block. Owner must acknowledge coverage.
 */
export const photosObjectSchema = z.object({
  /** Required to leave step — acknowledges warn-level coverage. */
  coverageAcknowledged: z.boolean(),
  /** Checklist #15 — logo/favicon/hero/og paths or plan. */
  brandAssetsConfirmed: z.boolean().optional().default(false),
  /** Honest ops plan when sellable items still need photos (checklist #16). */
  needsPhotoPlan: z.string().trim().max(500).optional().nullable(),
  itemCount: z.number().int().min(0).optional().nullable(),
  withPhotoCount: z.number().int().min(0).optional().nullable(),
  missingPhotoCount: z.number().int().min(0).optional().nullable(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const photosSchema = photosObjectSchema.superRefine((val, ctx) => {
  if (val.coverageAcknowledged !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coverageAcknowledged"],
      message:
        "Acknowledge photo coverage (you can continue with a needs-photo plan — this is not a hard block)",
    });
  }
  const missing = val.missingPhotoCount ?? 0;
  if (
    missing > 0 &&
    !(val.needsPhotoPlan && val.needsPhotoPlan.trim().length >= 8)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["needsPhotoPlan"],
      message:
        "Some items are missing photos — add a short needs-photo ops plan (or add photos in Square and refresh)",
    });
  }
});

export type WizardPhotos = z.infer<typeof photosObjectSchema>;
export const photosDraftSchema = photosObjectSchema.partial();

export const SOCIAL_PATHS = ["contact_us", "oauth"] as const;
export type SocialPath = (typeof SOCIAL_PATHS)[number];

/**
 * Step 7 — Connect social.
 * Default / non-allowlisted: contact_us (“Hubungi tim kami…”).
 * OAuth path only when server verifies Meta Page connection (fail-closed).
 */
export const socialObjectSchema = z.object({
  path: z.enum(SOCIAL_PATHS),
  /** Required when path === contact_us */
  contactUsAcknowledged: z.boolean().optional().default(false),
  /**
   * Server-set only on complete for oauth path.
   * Client cannot self-claim connected.
   */
  oauthConnected: z.boolean().optional().default(false),
  /** Page OAuth verified (proxy for IBA/Page identity until IG IBA field exists). */
  ibaVerified: z.boolean().optional().default(false),
  pageId: z.string().trim().max(80).optional().nullable(),
  pageName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const socialSchema = socialObjectSchema.superRefine((val, ctx) => {
  if (val.path === "contact_us" && val.contactUsAcknowledged !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactUsAcknowledged"],
      message:
        "Confirm you will contact Orderly to activate Facebook / Instagram (Hubungi tim kami)",
    });
  }
  if (val.path === "oauth") {
    if (val.oauthConnected !== true || val.ibaVerified !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oauthConnected"],
        message:
          "Meta OAuth is not verified for this session. Use contact-us, or connect an allow-listed tenant Page first.",
      });
    }
  }
});

export type WizardSocial = z.infer<typeof socialObjectSchema>;
export const socialDraftSchema = socialObjectSchema.partial();

export const GBP_STATUSES = ["manual", "pending", "connected"] as const;
export type GbpStatus = (typeof GBP_STATUSES)[number];
export const GSC_PATHS = ["contact_us", "verified"] as const;
export type GscPath = (typeof GSC_PATHS)[number];

/**
 * Step 8 — Google (GBP + GSC).
 * GBP may stay manual/pending. GSC “verified” is server-set only (fail-closed).
 */
export const googleObjectSchema = z.object({
  gbpStatus: z.enum(GBP_STATUSES),
  gscPath: z.enum(GSC_PATHS),
  /** Required when gscPath === contact_us */
  contactUsAcknowledged: z.boolean().optional().default(false),
  /** Server-set only when GBP OAuth row exists. */
  gbpConnected: z.boolean().optional().default(false),
  /** Server-set only when GSC OAuth row exists. */
  gscConnected: z.boolean().optional().default(false),
  gscSiteUrl: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const googleSchema = googleObjectSchema.superRefine((val, ctx) => {
  if (val.gscPath === "contact_us" && val.contactUsAcknowledged !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactUsAcknowledged"],
      message:
        "Confirm you will contact Orderly for Google Search Console (or verify GSC OAuth first)",
    });
  }
  if (val.gbpStatus === "connected" && val.gbpConnected !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gbpStatus"],
      message:
        "GBP is not verified. Choose manual/pending, or connect GBP OAuth for an allow-listed tenant first.",
    });
  }
  if (val.gscPath === "verified" && val.gscConnected !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gscPath"],
      message:
        "GSC is not verified. Use contact-us, or complete GSC OAuth for this tenant first.",
    });
  }
});

export type WizardGoogle = z.infer<typeof googleObjectSchema>;
export const googleDraftSchema = googleObjectSchema.partial();

/**
 * Step 9 — Laporan & Ops (daily report recipient + local send hour).
 * Timezone must come from Step 3 (server-copied on complete). Cron still
 * needs ops to wire DAILY_REPORT_TENANTS / FROM domain at Go Live.
 */
export const opsObjectSchema = z.object({
  ownerEmail: z.string().trim().email().max(160),
  /** Local hour 0–23 in Step 3 timezone. */
  sendHourLocal: z.number().int().min(0).max(23),
  /** Snapshot of wizard.hours.timezone at complete (server-set). */
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  ccEmails: z
    .array(z.string().trim().email().max(160))
    .max(5)
    .optional()
    .default([]),
  notes: z.string().trim().max(500).optional().nullable(),
  /**
   * Confirm owner understands Orderly still wires DAILY_REPORT_TENANTS
   * + verified FROM domain before live sends (checklist #21).
   */
  opsAck: z.boolean().optional().default(false),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const opsSchema = opsObjectSchema.superRefine((val, ctx) => {
  if (val.opsAck !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["opsAck"],
      message:
        "Confirm daily-report ops acknowledgement (email + local hour; Orderly wires delivery env at Go Live)",
    });
  }
  if (!val.timezone || !String(val.timezone).trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timezone"],
      message:
        "Timezone is required from Step 3 before completing Reports & ops",
    });
  }
});

export type WizardOps = z.infer<typeof opsObjectSchema>;
export const opsDraftSchema = opsObjectSchema.partial();

/**
 * Step 10 — Compliance.
 * Hard gate: Health Dept clearance checkbox (Kirin / soft-open truth).
 */
export const complianceObjectSchema = z.object({
  /** Required true to leave the step / publish. */
  healthDeptCleared: z.boolean().optional().default(false),
  /** Optional permit / county / inspector notes for ops. */
  healthDeptNotes: z.string().trim().max(500).optional().nullable(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const complianceSchema = complianceObjectSchema.superRefine(
  (val, ctx) => {
    if (val.healthDeptCleared !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["healthDeptCleared"],
        message:
          "Confirm Health Department clearance before continuing (required)",
      });
    }
  },
);

export type WizardCompliance = z.infer<typeof complianceObjectSchema>;
export const complianceDraftSchema = complianceObjectSchema.partial();

/**
 * Step 11 — Review & Go Live acknowledgements.
 * Completing this step marks the session "ready". Actual Go Live is POST /publish
 * (ONBOARDING_PUBLISH_ENABLED) and only creates a draft/inactive tenant shell.
 */
export const reviewObjectSchema = z.object({
  /** Owner reviewed the P0 gate summary. */
  reviewAcknowledged: z.boolean().optional().default(false),
  /**
   * Owner understands: Go Live ≠ Save draft; publish creates draft/inactive
   * shell; human activates; paid smoke is post-Go Live ops.
   */
  goLiveAcknowledged: z.boolean().optional().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
  confirmedAt: z.string().trim().datetime().optional().nullable(),
});

export const reviewSchema = reviewObjectSchema.superRefine((val, ctx) => {
  if (val.reviewAcknowledged !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewAcknowledged"],
      message: "Confirm you reviewed the onboarding summary before Go Live",
    });
  }
  if (val.goLiveAcknowledged !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["goLiveAcknowledged"],
      message:
        "Confirm Go Live creates a draft/inactive tenant shell (not active) and paid smoke is ops",
    });
  }
});

export type WizardReview = z.infer<typeof reviewObjectSchema>;
export const reviewDraftSchema = reviewObjectSchema.partial();

export type WizardState = {
  identity?: WizardIdentity | null;
  serviceStyle?: WizardServiceStyle | null;
  hours?: WizardHours | null;
  squareConnect?: WizardSquareConnect | null;
  catalog?: WizardCatalog | null;
  photos?: WizardPhotos | null;
  social?: WizardSocial | null;
  google?: WizardGoogle | null;
  ops?: WizardOps | null;
  compliance?: WizardCompliance | null;
  review?: WizardReview | null;
  completedSteps?: number[];
  [key: string]: unknown;
};

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export function identityToLegacyFields(identity: WizardIdentity): {
  restaurantName: string;
  address: string | null;
  cuisine: string;
  contact: Record<string, unknown>;
  domain: string;
} {
  const address =
    identity.addressMode === "physical"
      ? identity.physicalAddress?.trim() || null
      : [
          identity.hostVenueName?.trim(),
          identity.hostVenueAddress?.trim(),
        ]
          .filter(Boolean)
          .join(" — ") || null;

  return {
    restaurantName: identity.publicDisplayName.trim(),
    address,
    cuisine: identity.cuisine.trim(),
    contact: {
      email: identity.businessEmail.trim(),
      phone: identity.phone.trim(),
      legalBusinessName: identity.legalBusinessName.trim(),
      businessType: identity.businessType,
      addressMode: identity.addressMode,
      facebookPageUrl: identity.facebookPageUrl || null,
      instagramHandle: identity.instagramHandle?.replace(/^@/, "") || null,
    },
    domain: normalizeDomain(identity.websiteDomain),
  };
}

/** Draft save may be partial — only validate required when completing step. */
export const identityDraftSchema = identityObjectSchema.partial();
