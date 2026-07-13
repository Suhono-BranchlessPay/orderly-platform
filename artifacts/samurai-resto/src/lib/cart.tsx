import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { MenuItem } from "@workspace/api-client-react";
import { useTenant } from "@/lib/tenant";
import { trackAnalyticsEvent } from "@/lib/analytics";

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: MenuItem, quantity: number, specialInstructions?: string) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  cartTotal: number;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const LEGACY_CART_KEY = "samurai-cart";

function cartKey(tenantId: string) {
  return `orderly-cart-${tenantId}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();
  const tenantId = tenant?.tenantId ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const key = cartKey(tenantId);
      let raw = localStorage.getItem(key);
      // One-time migrate legacy Samurai cart key for tenant samurai
      if (!raw && tenantId === "samurai") {
        raw = localStorage.getItem(LEGACY_CART_KEY);
        if (raw) {
          localStorage.setItem(key, raw);
          localStorage.removeItem(LEGACY_CART_KEY);
        }
      }
      setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch {
      setItems([]);
    }
    setHydrated(true);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !hydrated) return;
    localStorage.setItem(cartKey(tenantId), JSON.stringify(items));
  }, [items, tenantId, hydrated]);

  const addItem = (
    menuItem: MenuItem,
    quantity: number,
    specialInstructions?: string,
  ) => {
    if (tenantId) {
      trackAnalyticsEvent({
        tenantId,
        eventType: "add_to_cart",
        itemId: menuItem.id,
        meta: { quantity },
      });
    }
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItem.id === menuItem.id
            ? {
                ...i,
                quantity: i.quantity + quantity,
                specialInstructions:
                  specialInstructions ?? i.specialInstructions,
              }
            : i,
        );
      }
      return [...prev, { menuItem, quantity, specialInstructions }];
    });
    setIsCartOpen(true);
  };

  const removeItem = (menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItem.id !== menuItemId));
  };

  const updateQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(menuItemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.menuItem.id === menuItemId ? { ...i, quantity } : i,
      ),
    );
  };

  const clearCart = () => setItems([]);

  const cartTotal = items.reduce(
    (total, item) => total + item.menuItem.price * item.quantity,
    0,
  );
  const cartCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
