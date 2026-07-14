import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

/**
 * Meta Conversion API outbox (ads measurement — NOT social inbox).
 * Request path only enqueues; a background flush POSTs to Meta so order/pay
 * never waits on Graph. Default off via META_CAPI_ENABLED.
 */
export const META_CAPI_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type MetaCapiStatus = (typeof META_CAPI_STATUSES)[number];

export const metaCapiOutboxTable = pgTable(
  "meta_capi_outbox",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** Meta standard event name: ViewContent | AddToCart | InitiateCheckout | Purchase */
    eventName: text("event_name").notNull(),
    /** Stable id for Pixel↔CAPI dedup when browser Pixel is added later. */
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    metaEventId: text("meta_event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("meta_capi_outbox_tenant_status_idx").on(table.tenantId, table.status),
    index("meta_capi_outbox_event_id_idx").on(table.eventId),
  ],
);
