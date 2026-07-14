import { tenant } from "../tenant";

/** Thin API client — same backend as web. No secrets in the app. */
function baseUrl(): string {
  const b = tenant.apiBaseUrl?.replace(/\/$/, "") ?? "";
  if (!b) {
    throw new Error(`${tenant.appName} is coming soon — online ordering not available yet.`);
  }
  return b;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Tenant-Slug": tenant.slug,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  categoryId?: string | null;
  imageUrl?: string | null;
  available?: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder?: number;
};

export type CheckoutConfig = {
  tenantId: string;
  orderTypes?: ("pickup" | "delivery")[];
  deliveryEnabled?: boolean;
  name?: string | null;
  restaurant?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
  } | null;
};

export type SquareConfig = {
  enabled: boolean;
  applicationId?: string;
  locationId?: string;
  environment?: string;
};

export type CreateOrderInput = {
  firstName: string;
  lastName?: string | null;
  customerPhone: string;
  customerEmail?: string | null;
  orderType: "pickup" | "delivery";
  address?: null;
  items: { menuItemId: string; quantity: number; specialInstructions?: string | null }[];
  specialInstructions?: string | null;
  squarePaymentSourceId: string;
  doordashExternalDeliveryId?: null;
  tipCents?: number | null;
  tipPercent?: number | null;
  channel?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  expoPushToken?: string | null;
};

export type CreateOrderResult = {
  id: string;
  status: string;
  total: number;
  orderType: string;
  doordashTrackingUrl?: string | null;
  bpAnchorStatus?: string | null;
  bpExplorerUrl?: string | null;
  /** Present when backend returns on-chain proof (evidence for P1) */
  chainTxHash?: string | null;
  bpChainTxHash?: string | null;
  createdAt?: string | null;
  readyAt?: string | null;
};

export type UpsellSuggestion = {
  menu_item_id: string;
  name: string;
  category: string;
  price_cents: number;
  score: number;
  reason: string;
};

export const api = {
  checkoutConfig: () => request<CheckoutConfig>("/api/config/checkout"),
  squareConfig: () => request<SquareConfig>("/api/square/config"),
  menuCategories: () => request<MenuCategory[]>("/api/menu/categories"),
  menuItems: () => request<MenuItem[]>("/api/menu/items"),
  featured: () => request<MenuItem[]>("/api/menu/featured"),
  createOrder: (input: CreateOrderInput) =>
    request<CreateOrderResult>("/api/orders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getOrder: (id: string) => request<CreateOrderResult>(`/api/orders/${id}`),
  registerPushToken: (orderId: string, expoPushToken: string) =>
    request<{ ok: boolean }>(`/api/orders/${orderId}/push-token`, {
      method: "POST",
      body: JSON.stringify({ expoPushToken }),
    }),
  upsellSuggestions: (menuItemIds: string[], limit = 3) =>
    request<{
      suggestions: UpsellSuggestion[];
      note?: string;
    }>("/api/upsell/suggestions", {
      method: "POST",
      body: JSON.stringify({ menu_item_ids: menuItemIds, limit }),
    }),
};
