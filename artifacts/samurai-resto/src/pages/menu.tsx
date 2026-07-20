import { useState, useEffect, useMemo } from "react";
import {
  useGetMenuCategories,
  useGetMenuItems,
  type MenuItem,
} from "@workspace/api-client-react";
import { MenuItemCard } from "@/components/MenuItemCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { trackAnalyticsEvent } from "@/lib/analytics";

function readDeepLinkItemId(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("item");
    const s = (raw || "").trim().slice(0, 128);
    if (!s || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(s)) return null;
    return s;
  } catch {
    return null;
  }
}

function MenuListRow({
  item,
  highlighted = false,
}: {
  item: MenuItem;
  highlighted?: boolean;
}) {
  const { addItem } = useCart();
  return (
    <div
      id={`menu-item-${item.id}`}
      className={`flex flex-col sm:flex-row sm:items-center gap-4 py-5 border-b scroll-mt-28 ${
        highlighted
          ? "border-primary bg-primary/5 px-3 -mx-3 rounded-lg"
          : "border-border"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-xl text-foreground">{item.name}</h3>
          <span className="text-primary font-semibold shrink-0">
            ${item.price.toFixed(2)}
          </span>
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <Button
        size="sm"
        className="bg-primary text-white shrink-0"
        onClick={() => addItem(item, 1)}
      >
        Add
      </Button>
    </div>
  );
}

function MenuLargeCard({
  item,
  defaultOpen = false,
  highlighted = false,
}: {
  item: MenuItem;
  defaultOpen?: boolean;
  highlighted?: boolean;
}) {
  return (
    <MenuItemCard
      item={item}
      defaultOpen={defaultOpen}
      highlighted={highlighted}
    />
  );
}

export default function Menu() {
  const { brandName, cityLine, storefront, tenant } = useTenant();
  const deepLinkItemId = useMemo(() => readDeepLinkItemId(), []);

  useEffect(() => {
    const loc = cityLine ? ` | ${cityLine}` : "";
    document.title = `${storefront.menuPageTitle} · ${brandName}${loc}`;
  }, [brandName, cityLine, storefront.menuPageTitle]);

  useEffect(() => {
    const tid = tenant?.tenantId;
    if (!tid) return;
    trackAnalyticsEvent({
      tenantId: tid,
      eventType: "menu_view",
      itemId: deepLinkItemId,
    });
  }, [tenant?.tenantId, deepLinkItemId]);

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [deepLinkOpened, setDeepLinkOpened] = useState(false);
  const { data: categories, isLoading: loadingCategories } = useGetMenuCategories();
  const itemsParams =
    activeCategory !== "all" ? { category: activeCategory } : undefined;
  const { data: items, isLoading: loadingItems } = useGetMenuItems(itemsParams);
  // Shared storefront (Samurai + Kirin + …): /api/menu/items?category= filters by
  // menu_items.category NAME. Tabs must pass the name — not sqcat_* id (that
  // returned 0 items on live Samurai). URLSearchParams encodes accents/spaces
  // (e.g. "À La Carte"). Stable slug can come later for 24-outlet scale.
  const sortedCategories = categories
    ? [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  // Social/QR `?item=` → keep All Items, scroll + open add dialog once.
  useEffect(() => {
    if (!deepLinkItemId || loadingItems || !items?.length || deepLinkOpened) {
      return;
    }
    const found = (items as MenuItem[]).find((i) => i.id === deepLinkItemId);
    if (!found) return;
    if (activeCategory !== "all") {
      setActiveCategory("all");
      return;
    }
    setDeepLinkOpened(true);
    const el = document.getElementById(`menu-item-${deepLinkItemId}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [
    deepLinkItemId,
    loadingItems,
    items,
    deepLinkOpened,
    activeCategory,
  ]);

  const variant = storefront.menuVariant;
  const gridClass =
    variant === "menu-cards-large"
      ? "grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto"
      : variant === "menu-list"
        ? "max-w-3xl mx-auto"
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";

  const headerMinimal = variant === "menu-list";

  return (
    <div className="min-h-screen bg-background pb-24">
      {headerMinimal ? (
        <div className="pt-16 pb-10 px-4 text-center border-b border-border">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-3">
            Order Online
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-3">
            {storefront.menuPageTitle}
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-base">
            {storefront.menuPageSubtitle}
          </p>
        </div>
      ) : (
        <div className="bg-accent pt-32 pb-20 px-4 text-center border-b-8 border-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-black/80 z-0 mix-blend-multiply" />
          <div className="relative z-10">
            <h1 className="font-serif text-5xl md:text-6xl text-accent-foreground mb-4">
              {storefront.menuPageTitle}
            </h1>
            <p className="text-accent-foreground/80 max-w-2xl mx-auto text-lg">
              {storefront.menuPageSubtitle}
            </p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 mt-8">
        {loadingCategories ? (
          <div className="flex justify-center gap-2 mb-12 flex-wrap">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))}
          </div>
        ) : (
          <Tabs
            defaultValue="all"
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="w-full"
          >
            <div className="flex justify-center mb-12">
              <TabsList className="bg-transparent flex-wrap justify-center h-auto gap-2 p-0">
                <TabsTrigger
                  value="all"
                  className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-6 py-2.5 text-base"
                >
                  All Items
                </TabsTrigger>
                {sortedCategories.map((cat) => (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.name}
                    className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-6 py-2.5 text-base"
                  >
                    {cat.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="w-full">
              {loadingItems ? (
                <div
                  className={
                    variant === "menu-list"
                      ? "max-w-3xl mx-auto space-y-4"
                      : gridClass
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton
                      key={i}
                      className={
                        variant === "menu-list"
                          ? "h-20 w-full"
                          : "w-full aspect-[4/3] rounded-xl"
                      }
                    />
                  ))}
                </div>
              ) : items && items.length > 0 ? (
                variant === "menu-list" ? (
                  <div className={gridClass}>
                    {(items as MenuItem[]).map((item) => (
                      <MenuListRow
                        key={item.id}
                        item={item}
                        highlighted={item.id === deepLinkItemId}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={gridClass}>
                    {(items as MenuItem[]).map((item) => {
                      const isTarget = item.id === deepLinkItemId;
                      return variant === "menu-cards-large" ? (
                        <MenuLargeCard
                          key={item.id}
                          item={item}
                          defaultOpen={isTarget && deepLinkOpened}
                          highlighted={isTarget}
                        />
                      ) : (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          defaultOpen={isTarget && deepLinkOpened}
                          highlighted={isTarget}
                        />
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="text-center py-24 bg-card rounded-xl border border-border max-w-lg mx-auto">
                  <h3 className="font-serif text-2xl mb-2 text-foreground">
                    Menu coming soon
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    This restaurant’s catalog will appear here once connected.
                  </p>
                  {activeCategory !== "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory("all")}
                      className="text-primary font-medium hover:underline"
                    >
                      View all items
                    </button>
                  )}
                </div>
              )}
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}
