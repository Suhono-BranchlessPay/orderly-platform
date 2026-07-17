import AsyncStorage from "@react-native-async-storage/async-storage";
import { tenant } from "../tenant";

const key = () => `orderly.recentOrders.${tenant.slug}`;

export type RecentOrderRef = {
  orderId: string;
  total?: number | null;
  savedAt: string;
};

export async function rememberOrder(
  orderId: string,
  total?: number | null,
): Promise<void> {
  const next: RecentOrderRef = {
    orderId,
    total: typeof total === "number" ? total : null,
    savedAt: new Date().toISOString(),
  };
  const prev = await listRecentOrders();
  const merged = [next, ...prev.filter((o) => o.orderId !== orderId)].slice(
    0,
    20,
  );
  await AsyncStorage.setItem(key(), JSON.stringify(merged));
}

export async function listRecentOrders(): Promise<RecentOrderRef[]> {
  try {
    const raw = await AsyncStorage.getItem(key());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentOrderRef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
