/**
 * Blok 3.2 — Support knowledge base + chat (retrieval, not open-ended LLM).
 *
 * Answers only from KB articles. Low confidence → escalate to human.
 * Never invents money figures, health/legal advice, or refund outcomes.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  db,
  supportEscalationsTable,
  supportKbArticlesTable,
  SUPPORT_PLATFORM_TENANT_ID,
} from "@workspace/db";

const CONFIDENCE_FLOOR = 0.28;

type SeedArticle = {
  slug: string;
  title: string;
  body: string;
  tags: string[];
};

const PLATFORM_SEED_EN: SeedArticle[] = [
  {
    slug: "how-to-read-reports",
    title: "How do I read sales and tip reports?",
    body:
      "Open the Orderly Foods Console dashboard. Use the Range control (Today / 7d / 28d / 30d) at the top. " +
      "Stats show paid orders only — we never invent metrics. Tips are restaurant-owned. " +
      "Refunds appear under Payments & tips and are excluded from sales totals. " +
      "Managers only see their own restaurant; Masters can pick a tenant.",
    tags: ["reports", "sales", "tips", "dashboard", "csv", "export"],
  },
  {
    slug: "how-to-change-menu",
    title: "How do I change the menu?",
    body:
      "Menu items live in your Square catalog and sync into Orderly. " +
      "Edit prices/names in Square, then refresh the menu on the Orderly side (or wait for the next sync). " +
      "Self-serve onboarding can store a menu *draft*, but live menu publish still needs a human check so prices stay correct. " +
      "If something looks wrong after an edit, escalate — do not guess prices in chat.",
    tags: ["menu", "items", "price", "square", "catalog", "change"],
  },
  {
    slug: "square-connect",
    title: "How do I connect Square?",
    body:
      "Use self-serve onboarding → Connect Square. You authorize Square yourself on Square’s page — " +
      "never send Application Secret or Access Token to Orderly staff in chat/email. " +
      "Sandbox first for trials; production later. Redirect URI must match exactly what is registered in the Square Developer Dashboard.",
    tags: ["square", "oauth", "connect", "onboarding", "token", "login"],
  },
  {
    slug: "qr-flyer",
    title: "How does the QR flyer work?",
    body:
      "Printed QR codes point at https://<your-domain>/r/<tenant-slug>?src=flyer. " +
      "That redirect is config-driven, so you can change the landing page without reprinting. " +
      "Scans appear under QR scans on the dashboard. Use ?src=flyer (or other src values) to track which flyer was scanned.",
    tags: ["qr", "flyer", "scan", "redirect", "marketing"],
  },
  {
    slug: "anchor-what-is-it",
    title: "What is Anchor verification?",
    body:
      "Anchor records a payment proof on-chain (via BranchlessPay). The dashboard shows anchored / pending / untracked. " +
      "Untracked (—) means no proof was recorded (often legacy). Pending means waiting for proof-back. " +
      "Alerts need ORDERLY_ALERT_WEBHOOK_URL on the server. Support chat will not invent anchor rates — look at Anchor health on the dashboard.",
    tags: ["anchor", "blockchain", "proof", "bp", "on-chain", "verification"],
  },
  {
    slug: "social-inbox",
    title: "How does the Social inbox trial work?",
    body:
      "Blok 4.1: Facebook/Instagram messages for the trial tenant land in Social inbox. " +
      "Every reply needs a human Approve click — nothing auto-sends by default. " +
      "Allergy/health/halal and spam are never auto-answered. Sending to Meta requires SOCIAL_SEND_ENABLED=1 plus gates. " +
      "Publishing the Meta app is an ops step before public Page comments flow reliably.",
    tags: ["social", "facebook", "instagram", "inbox", "meta", "reply"],
  },
  {
    slug: "refund-policy-pointer",
    title: "How do refunds work?",
    body:
      "Refunds go through Square (and, when configured, a negative anchor). " +
      "Use the restaurant’s normal refund path / owner PIN flow — this chat cannot issue refunds. " +
      "Dashboard Payments & tips shows refund cents separately so sales totals stay honest. " +
      "For a stuck refund or wrong amount, escalate to a human with the order id.",
    tags: ["refund", "money", "payment", "square", "chargeback"],
  },
  {
    slug: "escalate-when",
    title: "When should I escalate to a human?",
    body:
      "Escalate when: the answer is not in the knowledge base, money amounts disagree with Square, " +
      "health/allergy/halal questions, legal/consent/marketing send questions, or anything that could harm a guest. " +
      "This assistant only retrieves FAQ articles — it will not invent answers under low confidence.",
    tags: ["escalate", "human", "help", "support", "contact"],
  },
];

function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreArticle(
  queryTokens: string[],
  article: { title: string; body: string; tags: string[] },
): number {
  if (!queryTokens.length) return 0;
  const bag = new Set([
    ...tokenize(article.title),
    ...tokenize(article.body),
    ...article.tags.map((t) => t.toLowerCase()),
  ]);
  let hits = 0;
  for (const t of queryTokens) {
    if (bag.has(t)) hits += 1;
    else if ([...bag].some((b) => b.includes(t) || t.includes(b))) hits += 0.5;
  }
  // Title matches weigh more via duplicate title tokens already in bag.
  const titleHits = tokenize(article.title).filter((t) =>
    queryTokens.includes(t),
  ).length;
  const raw = (hits + titleHits * 1.5) / (queryTokens.length + 0.5);
  return Math.min(1, raw);
}

export type PublicKbArticle = {
  id: string;
  tenant_id: string;
  slug: string;
  locale: string;
  title: string;
  body: string;
  tags: string[];
  updated_at: string | null;
};

function toPublic(row: typeof supportKbArticlesTable.$inferSelect): PublicKbArticle {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    body: row.body,
    tags: row.tags || [],
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** Idempotent seed of platform EN FAQ articles. */
export async function ensurePlatformKbSeed(): Promise<{ inserted: number }> {
  const existing = await db
    .select({ slug: supportKbArticlesTable.slug })
    .from(supportKbArticlesTable)
    .where(
      and(
        eq(supportKbArticlesTable.tenantId, SUPPORT_PLATFORM_TENANT_ID),
        eq(supportKbArticlesTable.locale, "en"),
      ),
    );
  const have = new Set(existing.map((r) => r.slug));
  let inserted = 0;
  for (const a of PLATFORM_SEED_EN) {
    if (have.has(a.slug)) continue;
    await db.insert(supportKbArticlesTable).values({
      id: randomUUID(),
      tenantId: SUPPORT_PLATFORM_TENANT_ID,
      slug: a.slug,
      locale: "en",
      title: a.title,
      body: a.body,
      tags: a.tags,
    });
    inserted += 1;
  }
  return { inserted };
}

export async function listKbArticles(opts: {
  tenantId: string | null;
  locale?: string;
}): Promise<PublicKbArticle[]> {
  await ensurePlatformKbSeed();
  const locale = (opts.locale || "en").trim() || "en";
  const tenantIds = opts.tenantId
    ? [SUPPORT_PLATFORM_TENANT_ID, opts.tenantId]
    : [SUPPORT_PLATFORM_TENANT_ID];

  const rows = await db
    .select()
    .from(supportKbArticlesTable)
    .where(
      and(
        inArray(supportKbArticlesTable.tenantId, tenantIds),
        or(
          eq(supportKbArticlesTable.locale, locale),
          eq(supportKbArticlesTable.locale, "en"),
        ),
      ),
    )
    .orderBy(desc(supportKbArticlesTable.updatedAt));

  // Prefer locale match over EN duplicate of same slug.
  const bySlug = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const prev = bySlug.get(r.slug);
    if (!prev) {
      bySlug.set(r.slug, r);
      continue;
    }
    if (prev.locale !== locale && r.locale === locale) bySlug.set(r.slug, r);
  }
  return [...bySlug.values()].map(toPublic);
}

export type SupportChatResult = {
  answered: boolean;
  escalate: boolean;
  confidence: number;
  answer: string | null;
  article: PublicKbArticle | null;
  escalation_id: string | null;
  note: string;
};

export async function answerSupportQuestion(opts: {
  tenantId: string;
  question: string;
  askedBy?: string | null;
  locale?: string;
  forceEscalate?: boolean;
}): Promise<SupportChatResult> {
  const question = opts.question.trim().slice(0, 2000);
  if (!question) {
    return {
      answered: false,
      escalate: false,
      confidence: 0,
      answer: null,
      article: null,
      escalation_id: null,
      note: "Empty question.",
    };
  }

  const articles = await listKbArticles({
    tenantId: opts.tenantId,
    locale: opts.locale,
  });
  const tokens = tokenize(question);
  let best: { article: PublicKbArticle; score: number } | null = null;
  for (const a of articles) {
    const score = scoreArticle(tokens, a);
    if (!best || score > best.score) best = { article: a, score };
  }

  const confidence = best?.score ?? 0;
  const hit = best && confidence >= CONFIDENCE_FLOOR ? best.article : null;

  if (opts.forceEscalate || !hit) {
    const id = randomUUID();
    await db.insert(supportEscalationsTable).values({
      id,
      tenantId: opts.tenantId,
      askedBy: opts.askedBy || null,
      question,
      kbHitIds: best ? [best.article.id] : [],
      confidence,
      status: "open",
      note: opts.forceEscalate
        ? "Forced escalate by user."
        : "Low confidence — no strong KB match.",
      meta: { locale: opts.locale || "en" },
    });
    return {
      answered: false,
      escalate: true,
      confidence,
      answer: null,
      article: best?.article ?? null,
      escalation_id: id,
      note:
        "Escalated to a human. This assistant only answers from the knowledge base when confidence is high enough.",
    };
  }

  return {
    answered: true,
    escalate: false,
    confidence,
    answer: hit.body,
    article: hit,
    escalation_id: null,
    note: "Answered from knowledge base (retrieval only — not generative AI inventing facts).",
  };
}

export async function listEscalations(opts: {
  tenantId: string | null;
  status?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    tenant_id: string;
    asked_by: string | null;
    question: string;
    confidence: number | null;
    status: string;
    note: string | null;
    created_at: string | null;
  }>
> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  let rows;
  if (opts.tenantId && opts.status) {
    rows = await db
      .select()
      .from(supportEscalationsTable)
      .where(
        and(
          eq(supportEscalationsTable.tenantId, opts.tenantId),
          eq(supportEscalationsTable.status, opts.status),
        ),
      )
      .orderBy(desc(supportEscalationsTable.createdAt))
      .limit(limit);
  } else if (opts.tenantId) {
    rows = await db
      .select()
      .from(supportEscalationsTable)
      .where(eq(supportEscalationsTable.tenantId, opts.tenantId))
      .orderBy(desc(supportEscalationsTable.createdAt))
      .limit(limit);
  } else if (opts.status) {
    rows = await db
      .select()
      .from(supportEscalationsTable)
      .where(eq(supportEscalationsTable.status, opts.status))
      .orderBy(desc(supportEscalationsTable.createdAt))
      .limit(limit);
  } else {
    rows = await db
      .select()
      .from(supportEscalationsTable)
      .orderBy(desc(supportEscalationsTable.createdAt))
      .limit(limit);
  }

  return rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenantId,
    asked_by: r.askedBy,
    question: r.question,
    confidence: r.confidence,
    status: r.status,
    note: r.note,
    created_at: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}
