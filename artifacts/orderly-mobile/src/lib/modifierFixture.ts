import type { MenuItem } from "../api/client";

/**
 * Sample Square-shaped modifier lists for local/E2E testing.
 * Live Samurai catalog currently has squareModifiers = [] for all items —
 * enable with EXPO_PUBLIC_MODIFIER_FIXTURE=1 (or __DEV__ default below).
 */
export const FIXTURE_SQUARE_MODIFIERS = [
  {
    list_id: "fixture-protein",
    list_name: "Protein",
    modifiers: [
      { id: "mod-chicken", name: "Chicken", price: 0 },
      { id: "mod-steak", name: "Steak", price: 3 },
      { id: "mod-shrimp", name: "Shrimp", price: 2.5 },
    ],
  },
  {
    list_id: "fixture-sauce",
    list_name: "Sauce",
    modifiers: [
      { id: "mod-yum", name: "Yum Yum", price: 0 },
      { id: "mod-spicy", name: "Spicy Mayo", price: 0.5 },
      { id: "mod-eel", name: "Eel Sauce", price: 0.5 },
    ],
  },
];

/** Items that receive the fixture when enabled (must exist on live menu). */
const FIXTURE_ITEM_NAMES = new Set([
  "Hibachi Chicken",
  "California Roll",
  "Chicken Bento",
]);

export function modifierFixtureEnabled(): boolean {
  const env = process.env.EXPO_PUBLIC_MODIFIER_FIXTURE;
  if (env === "0" || env === "false") return false;
  if (env === "1" || env === "true") return true;
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/** Attach fixture modifiers when item has none and fixture is on. */
export function withModifierFixture(item: MenuItem): MenuItem {
  if (!modifierFixtureEnabled()) return item;
  if (!FIXTURE_ITEM_NAMES.has(item.name)) return item;
  const existing = item.squareModifiers;
  if (Array.isArray(existing) && existing.length > 0) return item;
  return { ...item, squareModifiers: FIXTURE_SQUARE_MODIFIERS };
}

export function applyModifierFixture(items: MenuItem[]): MenuItem[] {
  if (!modifierFixtureEnabled()) return items;
  return items.map(withModifierFixture);
}
