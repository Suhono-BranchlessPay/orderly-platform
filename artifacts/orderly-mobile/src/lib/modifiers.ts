/** Parse Square-synced modifier lists from menu item JSON. */

export type ModifierOption = {
  id: string;
  name: string;
  price: number;
};

export type ModifierList = {
  listId: string;
  listName: string;
  options: ModifierOption[];
};

export type SelectedModifier = {
  listId: string;
  listName: string;
  id: string;
  name: string;
  price: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function parseModifierLists(raw: unknown): ModifierList[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: ModifierList[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const listId = String(row.list_id ?? row.listId ?? "").trim();
    const listName = String(row.list_name ?? row.listName ?? "Options").trim();
    const mods = row.modifiers;
    if (!Array.isArray(mods) || !listId) continue;
    const options: ModifierOption[] = [];
    for (const m of mods) {
      const mo = asRecord(m);
      if (!mo) continue;
      const id = String(mo.id ?? "").trim();
      const name = String(mo.name ?? "").trim();
      const price = Number(mo.price ?? 0);
      if (!id || !name) continue;
      options.push({
        id,
        name,
        price: Number.isFinite(price) ? price : 0,
      });
    }
    if (options.length) out.push({ listId, listName: listName || "Options", options });
  }
  return out;
}

export function modifiersExtra(selected: SelectedModifier[]): number {
  return selected.reduce((s, m) => s + (Number(m.price) || 0), 0);
}

export function formatModifiersNote(selected: SelectedModifier[]): string {
  if (!selected.length) return "";
  return selected
    .map((m) =>
      m.price > 0
        ? `${m.name} (+$${m.price.toFixed(2)})`
        : m.name,
    )
    .join("; ");
}

export function lineKey(
  menuItemId: string,
  selected: SelectedModifier[],
  note?: string,
): string {
  const modPart = selected
    .map((m) => m.id)
    .sort()
    .join(",");
  return `${menuItemId}|${modPart}|${(note || "").trim()}`;
}
