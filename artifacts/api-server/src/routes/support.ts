/**
 * Blok 3.2 — Support API (KB list, chat, escalations).
 * Mounted at /api/dashboard/support (Orderly console nginx only proxies /api/dashboard/*).
 */
import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import {
  resolveDashboardSession,
  readDashboardSessionToken,
  resolveScopedTenantId,
} from "../lib/dashboardAuth";
import {
  answerSupportQuestion,
  ensurePlatformKbSeed,
  listEscalations,
  listKbArticles,
} from "../lib/supportKb";

declare global {
  namespace Express {
    interface Request {
      supportActor?: {
        label: string;
        role: "master" | "manager";
        tenantId: string | null;
      };
    }
  }
}

const router = Router();

const requireSupportAccess: RequestHandler = async (req, res, next) => {
  try {
    const user = await resolveDashboardSession(readDashboardSessionToken(req));
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.supportActor = {
      label: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    next();
  } catch (err) {
    req.log?.error({ err }, "Support auth check failed");
    res.status(500).json({ error: "Auth check failed" });
  }
};

router.use(requireSupportAccess);

function resolveTenantForSupport(
  req: Request,
  res: { status: (c: number) => { json: (b: unknown) => void } },
  required: boolean,
): string | null | undefined {
  const actor = req.supportActor!;
  const requested =
    typeof req.query.tenant_id === "string"
      ? req.query.tenant_id.trim()
      : typeof (req.body as { tenant_id?: unknown })?.tenant_id === "string"
        ? String((req.body as { tenant_id: string }).tenant_id).trim()
        : null;
  const scope = resolveScopedTenantId(
    { role: actor.role, tenantId: actor.tenantId },
    requested || null,
  );
  if (!scope.ok) {
    res.status(403).json({ error: scope.error });
    return undefined;
  }
  if (required && !scope.tenantId) {
    res.status(400).json({
      error: "tenant_id is required (pick a restaurant in the console).",
    });
    return undefined;
  }
  return scope.tenantId;
}

router.get("/health", async (_req, res): Promise<void> => {
  const seed = await ensurePlatformKbSeed();
  res.json({
    ok: true,
    service: "orderly-support",
    mode: "kb-retrieval",
    seed_inserted: seed.inserted,
    note: "Answers from knowledge base only; low confidence escalates to a human. No generative inventing of money/health facts.",
  });
});

router.get("/kb", async (req, res): Promise<void> => {
  const tenantId = resolveTenantForSupport(req, res, false);
  if (tenantId === undefined) return;
  const locale =
    typeof req.query.locale === "string" ? req.query.locale.trim() : "en";
  const articles = await listKbArticles({ tenantId, locale });
  res.json({
    articles,
    count: articles.length,
    tenant_id: tenantId,
    locale,
  });
});

const chatBody = z.object({
  question: z.string().min(1).max(2000),
  tenant_id: z.string().min(1).optional(),
  locale: z.string().min(2).max(8).optional(),
  escalate: z.boolean().optional(),
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = chatBody.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  // Re-attach body tenant for resolver
  (req as { body: unknown }).body = parsed.data;
  const tenantId = resolveTenantForSupport(req, res, true);
  if (tenantId === undefined || !tenantId) return;

  const result = await answerSupportQuestion({
    tenantId,
    question: parsed.data.question,
    askedBy: req.supportActor?.label || null,
    locale: parsed.data.locale || "en",
    forceEscalate: Boolean(parsed.data.escalate),
  });
  res.json(result);
});

router.get("/escalations", async (req, res): Promise<void> => {
  const tenantId = resolveTenantForSupport(req, res, false);
  if (tenantId === undefined) return;
  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : undefined;
  const rows = await listEscalations({
    tenantId,
    status: status || undefined,
  });
  res.json({ escalations: rows, count: rows.length, tenant_id: tenantId });
});

export default router;
