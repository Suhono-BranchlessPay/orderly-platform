/**
 * Square Gift Cards API — Square is the issuer (compliance / escheatment).
 * Orderly never holds gift-card liability balances itself.
 *
 * Docs: https://developer.squareup.com/docs/gift-cards/using-gift-cards-api
 */
import { randomUUID } from "crypto";
import {
  getSquareCredsForTenantSlug,
  type SquareCreds,
} from "./square";

const SQUARE_API_VERSION = "2024-11-20";

async function squareRequest<T>(
  creds: SquareCreds,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${creds.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.accessToken}`,
      "Square-Version": SQUARE_API_VERSION,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Square Gift Cards API ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type SquareGiftCard = {
  id: string;
  gan?: string;
  state?: string;
  balance_money?: { amount?: number; currency?: string };
};

export async function createDigitalGiftCard(input: {
  tenantSlug: string;
}): Promise<SquareGiftCard> {
  const creds = await getSquareCredsForTenantSlug(input.tenantSlug);
  if (!creds) throw new Error("Square not configured for tenant");
  const data = await squareRequest<{ gift_card?: SquareGiftCard }>(
    creds,
    "/v2/gift-cards",
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        location_id: creds.locationId,
        gift_card: { type: "DIGITAL" },
      }),
    },
  );
  if (!data.gift_card?.id) throw new Error("Square create gift card: empty response");
  return data.gift_card;
}

/**
 * ACTIVATE with initial balance after the buyer paid (custom payment path).
 * buyer_payment_instrument_ids required for Square compliance checks.
 */
export async function activateGiftCard(input: {
  tenantSlug: string;
  giftCardId: string;
  amountCents: number;
  currency?: string;
  referenceId?: string;
  buyerPaymentInstrumentIds: string[];
}): Promise<{ giftCard: SquareGiftCard; activityId?: string }> {
  const creds = await getSquareCredsForTenantSlug(input.tenantSlug);
  if (!creds) throw new Error("Square not configured for tenant");
  const data = await squareRequest<{
    gift_card_activity?: {
      id?: string;
      gift_card?: SquareGiftCard;
      gift_card_balance_money?: { amount?: number; currency?: string };
    };
  }>(creds, "/v2/gift-cards/activities", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      gift_card_activity: {
        gift_card_id: input.giftCardId,
        type: "ACTIVATE",
        location_id: creds.locationId,
        activate_activity_details: {
          amount_money: {
            amount: input.amountCents,
            currency: input.currency || "USD",
          },
          reference_id: input.referenceId,
          buyer_payment_instrument_ids: input.buyerPaymentInstrumentIds,
        },
      },
    }),
  });
  const activity = data.gift_card_activity;
  const giftCard = activity?.gift_card;
  if (!giftCard?.id) {
    // Some responses only return activity + balance; re-fetch card
    const fetched = await retrieveGiftCard({
      tenantSlug: input.tenantSlug,
      giftCardId: input.giftCardId,
    });
    return { giftCard: fetched, activityId: activity?.id };
  }
  return { giftCard, activityId: activity?.id };
}

export async function retrieveGiftCard(input: {
  tenantSlug: string;
  giftCardId: string;
}): Promise<SquareGiftCard> {
  const creds = await getSquareCredsForTenantSlug(input.tenantSlug);
  if (!creds) throw new Error("Square not configured for tenant");
  const data = await squareRequest<{ gift_card?: SquareGiftCard }>(
    creds,
    `/v2/gift-cards/${encodeURIComponent(input.giftCardId)}`,
    { method: "GET" },
  );
  if (!data.gift_card?.id) throw new Error("Gift card not found");
  return data.gift_card;
}

export async function retrieveGiftCardFromGan(input: {
  tenantSlug: string;
  gan: string;
}): Promise<SquareGiftCard> {
  const creds = await getSquareCredsForTenantSlug(input.tenantSlug);
  if (!creds) throw new Error("Square not configured for tenant");
  const data = await squareRequest<{ gift_card?: SquareGiftCard }>(
    creds,
    "/v2/gift-cards/from-gan",
    {
      method: "POST",
      body: JSON.stringify({ gan: input.gan.trim() }),
    },
  );
  if (!data.gift_card?.id) throw new Error("Gift card not found for GAN");
  return data.gift_card;
}

/**
 * Manual REDEEM when not using Payments API gift-card source.
 * Prefer charging via Payments API with gift card source when possible.
 */
export async function redeemGiftCardActivity(input: {
  tenantSlug: string;
  giftCardId: string;
  amountCents: number;
  currency?: string;
  referenceId?: string;
}): Promise<{ giftCard: SquareGiftCard; activityId?: string }> {
  const creds = await getSquareCredsForTenantSlug(input.tenantSlug);
  if (!creds) throw new Error("Square not configured for tenant");
  const data = await squareRequest<{
    gift_card_activity?: {
      id?: string;
      gift_card?: SquareGiftCard;
    };
  }>(creds, "/v2/gift-cards/activities", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      gift_card_activity: {
        gift_card_id: input.giftCardId,
        type: "REDEEM",
        location_id: creds.locationId,
        redeem_activity_details: {
          amount_money: {
            amount: input.amountCents,
            currency: input.currency || "USD",
          },
          reference_id: input.referenceId,
        },
      },
    }),
  });
  const activity = data.gift_card_activity;
  if (activity?.gift_card?.id) {
    return { giftCard: activity.gift_card, activityId: activity.id };
  }
  const fetched = await retrieveGiftCard({
    tenantSlug: input.tenantSlug,
    giftCardId: input.giftCardId,
  });
  return { giftCard: fetched, activityId: activity?.id };
}
