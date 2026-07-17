import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { MenuItem } from "../api/client";
import {
  formatModifiersNote,
  lineKey,
  modifiersExtra,
  type SelectedModifier,
} from "../lib/modifiers";

export type CartLine = {
  lineId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  specialInstructions?: string;
  modifiers?: SelectedModifier[];
};

type CartContextValue = {
  lines: CartLine[];
  addItem: (
    item: MenuItem,
    qty?: number,
    note?: string,
    modifiers?: SelectedModifier[],
  ) => void;
  setQty: (lineId: string, quantity: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const addItem = useCallback(
    (
      item: MenuItem,
      qty = 1,
      note?: string,
      modifiers: SelectedModifier[] = [],
    ) => {
      const modNote = formatModifiersNote(modifiers);
      const special = [modNote, note?.trim()].filter(Boolean).join(" · ") || undefined;
      const id = lineKey(item.id, modifiers, note);
      const unitPrice = item.price + modifiersExtra(modifiers);

      setLines((prev) => {
        const i = prev.findIndex((l) => l.lineId === id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], quantity: next[i].quantity + qty };
          return next;
        }
        return [
          ...prev,
          {
            lineId: id,
            menuItemId: item.id,
            name: item.name,
            unitPrice,
            quantity: qty,
            specialInstructions: special,
            modifiers: modifiers.length ? modifiers : undefined,
          },
        ];
      });
    },
    [],
  );

  const setQty = useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const remove = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    return { lines, addItem, setQty, remove, clear, subtotal, count };
  }, [lines, addItem, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart requires CartProvider");
  return ctx;
}
