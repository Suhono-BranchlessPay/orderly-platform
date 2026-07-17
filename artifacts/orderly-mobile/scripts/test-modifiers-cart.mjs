/**
 * End-to-end logic test for modifier → cart lineId / price / note.
 * Run: node scripts/test-modifiers-cart.mjs
 * (Does not need Metro — mirrors src/lib/modifiers.ts + cart rules.)
 */
import assert from "node:assert/strict";

function parseModifierLists(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const listId = String(entry.list_id ?? entry.listId ?? "").trim();
    const listName = String(entry.list_name ?? entry.listName ?? "Options").trim();
    const mods = entry.modifiers;
    if (!Array.isArray(mods) || !listId) continue;
    const options = [];
    for (const m of mods) {
      if (!m || typeof m !== "object") continue;
      const id = String(m.id ?? "").trim();
      const name = String(m.name ?? "").trim();
      const price = Number(m.price ?? 0);
      if (!id || !name) continue;
      options.push({ id, name, price: Number.isFinite(price) ? price : 0 });
    }
    if (options.length) out.push({ listId, listName: listName || "Options", options });
  }
  return out;
}

function modifiersExtra(selected) {
  return selected.reduce((s, m) => s + (Number(m.price) || 0), 0);
}

function formatModifiersNote(selected) {
  if (!selected.length) return "";
  return selected
    .map((m) => (m.price > 0 ? `${m.name} (+$${m.price.toFixed(2)})` : m.name))
    .join("; ");
}

function lineKey(menuItemId, selected, note) {
  const modPart = selected
    .map((m) => m.id)
    .sort()
    .join(",");
  return `${menuItemId}|${modPart}|${(note || "").trim()}`;
}

const fixture = [
  {
    list_id: "fixture-protein",
    list_name: "Protein",
    modifiers: [
      { id: "mod-chicken", name: "Chicken", price: 0 },
      { id: "mod-steak", name: "Steak", price: 3 },
    ],
  },
  {
    list_id: "fixture-sauce",
    list_name: "Sauce",
    modifiers: [
      { id: "mod-yum", name: "Yum Yum", price: 0 },
      { id: "mod-spicy", name: "Spicy Mayo", price: 0.5 },
    ],
  },
];

const lists = parseModifierLists(fixture);
assert.equal(lists.length, 2);
assert.equal(lists[0].options.length, 2);

const selected = [
  {
    listId: "fixture-protein",
    listName: "Protein",
    id: "mod-steak",
    name: "Steak",
    price: 3,
  },
  {
    listId: "fixture-sauce",
    listName: "Sauce",
    id: "mod-spicy",
    name: "Spicy Mayo",
    price: 0.5,
  },
];

const base = 12.99;
const unit = base + modifiersExtra(selected);
assert.ok(Math.abs(unit - 16.49) < 0.001, `unit=${unit}`);

const note = formatModifiersNote(selected);
assert.ok(note.includes("Steak (+$3.00)"));
assert.ok(note.includes("Spicy Mayo (+$0.50)"));

const idA = lineKey("item-hibachi", selected, undefined);
const idB = lineKey("item-hibachi", selected, "no onion");
const idC = lineKey(
  "item-hibachi",
  [selected[0]], // steak only
  undefined,
);
assert.notEqual(idA, idB);
assert.notEqual(idA, idC);

// Cart merge: same lineId stacks qty
const lines = [];
function add(itemId, qty, mods, userNote) {
  const special =
    [formatModifiersNote(mods), userNote?.trim()].filter(Boolean).join(" · ") ||
    undefined;
  const lid = lineKey(itemId, mods, userNote);
  const unitPrice = base + modifiersExtra(mods);
  const i = lines.findIndex((l) => l.lineId === lid);
  if (i >= 0) {
    lines[i].quantity += qty;
    return;
  }
  lines.push({
    lineId: lid,
    menuItemId: itemId,
    unitPrice,
    quantity: qty,
    specialInstructions: special,
  });
}

add("item-hibachi", 1, selected);
add("item-hibachi", 2, selected);
assert.equal(lines.length, 1);
assert.equal(lines[0].quantity, 3);
assert.ok(Math.abs(lines[0].unitPrice - 16.49) < 0.001);

add("item-hibachi", 1, [selected[0]]);
assert.equal(lines.length, 2);

const checkoutPayload = lines.map((l) => ({
  menuItemId: l.menuItemId,
  quantity: l.quantity,
  specialInstructions: l.specialInstructions ?? null,
}));
assert.ok(checkoutPayload[0].specialInstructions.includes("Steak"));
assert.equal(
  checkoutPayload.reduce((s, l) => s + l.quantity, 0),
  4,
);

console.log("OK — modifier parse, live price, lineId, cart merge, checkout payload");
console.log(JSON.stringify({ lines, checkoutPayload }, null, 2));
