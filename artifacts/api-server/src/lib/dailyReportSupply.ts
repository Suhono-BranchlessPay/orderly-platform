/**
 * Level-1 supply reminder from Square item quantities (last 7 days).
 * Facts only — usage from sales. Never predict "days until empty".
 */

export type SupplyType =
  | "gelas_minuman"
  | "botol_air"
  | "box_bento"
  | "porsi_hibachi"
  | "wadah_appetizer";

export type SupplyUsage = {
  supplyType: SupplyType;
  label: string;
  quantity: number;
  contributingItems: { name: string; quantity: number }[];
};

/** Skip modifiers / sides that are not packaging units. */
const SKIP_NAME_RE =
  /\b(change|instead of|side |add |extra |no |without|sauce|rice upgrade|noodle instead)\b/i;

type Rule = {
  supplyType: SupplyType;
  label: string;
  test: (name: string) => boolean;
};

const RULES: Rule[] = [
  {
    supplyType: "botol_air",
    label: "water bottles",
    test: (n) => /\bbottle\s*water\b|\bwater\s*bottle\b/i.test(n),
  },
  {
    supplyType: "gelas_minuman",
    label: "drink cups",
    test: (n) =>
      /\b(soda|japanese\s*soda|soft\s*drink|fountain|iced\s*tea|lemonade)\b/i.test(
        n,
      ) && !/\bbottle\s*water\b/i.test(n),
  },
  {
    supplyType: "box_bento",
    label: "bento boxes",
    test: (n) => /\bbento\b/i.test(n),
  },
  {
    supplyType: "porsi_hibachi",
    label: "hibachi portions",
    test: (n) => /\bhibachi\b/i.test(n) && !/\bside\b/i.test(n),
  },
  {
    supplyType: "wadah_appetizer",
    label: "appetizer containers",
    test: (n) =>
      /\b(crab\s*rangoon|egg\s*roll|gyoza|spring\s*roll|edamame|dumpling)\b/i.test(
        n,
      ),
  },
];

export function classifySupplyItem(
  itemName: string,
): { supplyType: SupplyType; label: string } | null {
  const name = itemName.trim();
  if (!name || SKIP_NAME_RE.test(name)) return null;
  for (const rule of RULES) {
    if (rule.test(name)) return { supplyType: rule.supplyType, label: rule.label };
  }
  return null;
}

/**
 * Aggregate weekly item quantities into supply usage buckets.
 * Input should be ProductMix rows for last 7 days (not just top 5).
 */
export function buildSupplyUsageFromProducts(
  products: { name: string; quantity: number }[],
): SupplyUsage[] {
  const map = new Map<SupplyType, SupplyUsage>();

  for (const p of products) {
    const qty = Math.round(Number(p.quantity) || 0);
    if (qty <= 0) continue;
    const cls = classifySupplyItem(p.name);
    if (!cls) continue;
    const cur = map.get(cls.supplyType) ?? {
      supplyType: cls.supplyType,
      label: cls.label,
      quantity: 0,
      contributingItems: [],
    };
    cur.quantity += qty;
    cur.contributingItems.push({ name: p.name, quantity: qty });
    map.set(cls.supplyType, cur);
  }

  const order: SupplyType[] = [
    "gelas_minuman",
    "botol_air",
    "box_bento",
    "wadah_appetizer",
    "porsi_hibachi",
  ];
  return order
    .map((t) => map.get(t))
    .filter((x): x is SupplyUsage => Boolean(x && x.quantity > 0));
}

export function formatSupplyReminderLine(usage: SupplyUsage[]): string {
  if (!usage.length) return "";
  const parts = usage.map((u) => `~${u.quantity} ${u.label}`);
  return `Used this week (from sales): ${parts.join(", ")}. Check supply stock before you run out.`;
}
