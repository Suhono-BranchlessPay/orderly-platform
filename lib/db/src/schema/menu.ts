import { pgTable, text, real, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const menuCategoriesTable = pgTable("menu_categories", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("samurai"),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Block 5 seam: optional parent category for hierarchy (retail/grocery
   * departments & sub-departments). Restaurants stay flat — null parent,
   * zero behavior change.
   */
  parentId: text("parent_id"),
});

/**
 * `menu_items` is conceptually the platform "catalog_items" table — kept
 * under its original name to avoid a breaking rename. See
 * docs/MULTI_VERTICAL_SEAMS.md and the optional `catalog_items` view
 * created in scripts/migrate-block5-multi-vertical-seams.sql.
 */
export const menuItemsTable = pgTable("menu_items", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("samurai"),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  price: real("price").notNull(),
  imageUrl: text("image_url"),
  available: boolean("available").notNull().default(true),
  featured: boolean("featured").notNull().default(false),

  // --- Block 5 multi-vertical seams (all nullable / non-breaking) ---
  /** Unit the price is quoted in, e.g. "each" | "lb" | "kg" | "oz". Null = existing restaurant per-item pricing. */
  priceUnit: text("price_unit"),
  /** Catalog item kind, e.g. "food" | "grocery" | "retail" | "apparel". Null = unclassified (restaurants). */
  itemType: text("item_type"),
  /** Tax category/code for non-restaurant verticals (e.g. grocery exemptions). Null = tenant default tax rate applies. */
  taxCategory: text("tax_category"),
  /** Whether stock is tracked for this item. False for existing restaurant menu items. */
  trackInventory: boolean("track_inventory").notNull().default(false),
  /** On-hand quantity, only meaningful when trackInventory = true. */
  stockQty: integer("stock_qty"),
  /** UPC/EAN barcode for retail/grocery scanning. */
  barcode: text("barcode"),
  /** Manufacturer/brand name for retail/grocery items. */
  brand: text("brand"),
  /** Expiry/best-by date for perishable grocery items. */
  expiryDate: timestamp("expiry_date"),
  /** Extra search terms for catalog search (not used by current menu search). */
  searchKeywords: text("search_keywords"),
  /** Whether this item can be shipped (vs. pickup/delivery only). False for existing restaurant food items. */
  shippable: boolean("shippable").notNull().default(false),
  /** Carrier shipping class/rate group, only meaningful when shippable = true. */
  shipClass: text("ship_class"),
  /** Item weight in grams, for shipping rate calculation. */
  weightGrams: integer("weight_grams"),
  /** Age-gated item flag (e.g. alcohol, tobacco). False for existing menu items. */
  ageRestricted: boolean("age_restricted").notNull().default(false),
});

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("samurai"),
  customerId: text("customer_id"),
  addressId: text("address_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  orderType: text("order_type").notNull(),
  deliveryAddress: text("delivery_address"),
  /** @deprecated Prefer *_cents columns — kept for Square/API dollar display compat. */
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull(),
  tip: real("tip").notNull().default(0),
  platformFee: real("platform_fee").notNull().default(0),
  processingFee: real("processing_fee").notNull().default(0),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull(),
  deliveryFee: real("delivery_fee").notNull().default(0),
  /** Canonical money — integer cents, set at order create time. */
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  processingFeeCents: integer("processing_fee_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status").notNull().default("pending"),
  paymentTiming: text("payment_timing").notNull().default("pay_at_pickup"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  squareOrderId: text("square_order_id"),
  squarePaymentId: text("square_payment_id"),
  doordashExternalDeliveryId: text("doordash_external_delivery_id"),
  doordashTrackingUrl: text("doordash_tracking_url"),
  doordashStatus: text("doordash_status"),
  estimatedDropoffTime: text("estimated_dropoff_time"),
  bpAnchorId: text("bp_anchor_id"),
  bpContentHash: text("bp_content_hash"),
  bpAnchorStatus: text("bp_anchor_status"),
  chainTxHash: text("chain_tx_hash"),
  bpExplorerUrl: text("bp_explorer_url"),
  /** web | android | ios | qr | doordash | instagram | tiktok | … */
  channel: text("channel"),
  sourceDetail: jsonb("source_detail")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  paidAt: timestamp("paid_at"),
  acceptedAt: timestamp("accepted_at"),
  inProgressAt: timestamp("in_progress_at"),
  readyAt: timestamp("ready_at"),
  completedAt: timestamp("completed_at"),
  /** Cumulative Square refund amount in cents (separate from sales totals). */
  refundCents: integer("refund_cents").notNull().default(0),
  refundedAt: timestamp("refunded_at"),
  specialInstructions: text("special_instructions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderLinesTable = pgTable("order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => ordersTable.id),
  menuItemId: text("menu_item_id").notNull(),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  subtotal: real("subtotal").notNull(),
  specialInstructions: text("special_instructions"),
});

export const insertMenuCategorySchema = createInsertSchema(menuCategoriesTable);
export const insertMenuItemSchema = createInsertSchema(menuItemsTable);
export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export const insertOrderLineSchema = createInsertSchema(orderLinesTable).omit({ id: true });

export type MenuCategory = typeof menuCategoriesTable.$inferSelect;
export type MenuItem = typeof menuItemsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderLine = typeof orderLinesTable.$inferSelect;
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
