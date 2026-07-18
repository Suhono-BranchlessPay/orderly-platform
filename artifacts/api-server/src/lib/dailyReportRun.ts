/**
 * Orchestrate assemble → HTML → email for one or more tenants.
 */
import { assembleDailyReport } from "./dailyReportAssemble";
import {
  renderDailyReportHtml,
  renderDailyReportSubject,
} from "./dailyReportHtml";
import { sendEmail } from "./emailSend";
import { logger } from "./logger";

export type DailyReportTenantConfig = {
  slug: string;
  timeZone: string;
  to: string[];
};

/**
 * Parse DAILY_REPORT_TENANTS env.
 * Format (avoid `:` because IANA zones contain it):
 *   slug=Timezone=email[,email2];slug2=Timezone=email
 * Example:
 *   samurai=America/Indiana/Indianapolis=owner@example.com
 * Or use DAILY_REPORT_TENANT_SLUG + DAILY_REPORT_TZ + DAILY_REPORT_TO.
 */
export function parseDailyReportTenants(
  raw = process.env.DAILY_REPORT_TENANTS || "",
): DailyReportTenantConfig[] {
  const globalTo = (process.env.DAILY_REPORT_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultTz =
    process.env.DAILY_REPORT_TZ?.trim() || "America/Indiana/Indianapolis";

  if (!raw.trim()) {
    const slug = process.env.DAILY_REPORT_TENANT_SLUG?.trim() || "samurai";
    if (!globalTo.length) return [];
    return [{ slug, timeZone: defaultTz, to: globalTo }];
  }

  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [slug, tz, emails] = part.split("=");
      const to = (emails || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        slug: (slug || "").trim(),
        timeZone: (tz || defaultTz).trim(),
        to: to.length ? to : globalTo,
      };
    })
    .filter((t) => t.slug && t.to.length);
}

export type RunDailyReportResult = {
  tenantSlug: string;
  reportDate: string;
  emailed: boolean;
  emailId?: string;
  error?: string;
  squareAvailable: boolean;
};

export async function runDailyReportForTenant(
  cfg: DailyReportTenantConfig,
  opts?: { reportDate?: string; dryRun?: boolean; language?: string },
): Promise<RunDailyReportResult> {
  const payload = await assembleDailyReport({
    tenantSlug: cfg.slug,
    timeZone: cfg.timeZone,
    reportDate: opts?.reportDate,
    language: opts?.language,
  });
  if (!payload) {
    return {
      tenantSlug: cfg.slug,
      reportDate: opts?.reportDate || "",
      emailed: false,
      error: "tenant_not_found",
      squareAvailable: false,
    };
  }

  const html = renderDailyReportHtml(payload);
  const subject = renderDailyReportSubject(payload);

  if (opts?.dryRun) {
    logger.info(
      {
        tenantSlug: cfg.slug,
        reportDate: payload.reportDate,
        squareAvailable: payload.squareAvailable,
        subject,
      },
      "daily report dry-run (not emailed)",
    );
    return {
      tenantSlug: cfg.slug,
      reportDate: payload.reportDate,
      emailed: false,
      squareAvailable: payload.squareAvailable,
    };
  }

  const textBody = [
    payload.narrative.greeting,
    "",
    payload.narrative.body,
    payload.narrative.attention ? `\nNeeds attention: ${payload.narrative.attention}` : "",
    payload.narrative.ideaForToday
      ? `\nIdea for today: ${payload.narrative.ideaForToday}`
      : "",
    payload.supplyReminder ? `\n${payload.supplyReminder}` : "",
    "",
    payload.disclaimer,
  ]
    .filter(Boolean)
    .join("\n");

  const sent = await sendEmail({
    to: cfg.to,
    subject,
    html,
    text: textBody,
  });

  if (!sent.ok) {
    return {
      tenantSlug: cfg.slug,
      reportDate: payload.reportDate,
      emailed: false,
      error: sent.error,
      squareAvailable: payload.squareAvailable,
    };
  }

  return {
    tenantSlug: cfg.slug,
    reportDate: payload.reportDate,
    emailed: true,
    emailId: sent.id,
    squareAvailable: payload.squareAvailable,
  };
}

export async function runDailyReportsForConfiguredTenants(opts?: {
  reportDate?: string;
  dryRun?: boolean;
  language?: string;
}): Promise<RunDailyReportResult[]> {
  const tenants = parseDailyReportTenants();
  const out: RunDailyReportResult[] = [];
  for (const t of tenants) {
    try {
      out.push(await runDailyReportForTenant(t, opts));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, slug: t.slug }, "daily report tenant failed");
      out.push({
        tenantSlug: t.slug,
        reportDate: opts?.reportDate || "",
        emailed: false,
        error: msg,
        squareAvailable: false,
      });
    }
  }
  return out;
}
