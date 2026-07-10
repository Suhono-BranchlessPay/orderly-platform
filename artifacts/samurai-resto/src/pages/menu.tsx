import { useState, useEffect } from "react";
import { useGetMenuCategories, useGetMenuItems } from "@workspace/api-client-react";
import { MenuItemCard } from "@/components/MenuItemCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useTenant } from "@/lib/tenant";

export default function Menu() {
  const { brandName, cityLine } = useTenant();
  useEffect(() => {
    const loc = cityLine ? ` | ${cityLine}` : "";
    document.title = `Full Menu · ${brandName}${loc}`;
  }, [brandName, cityLine]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  
  const { data: categories, isLoading: loadingCategories } = useGetMenuCategories();
  
  // Only pass category to API if it's not "all"
  const itemsParams = activeCategory !== "all" ? { category: activeCategory } : undefined;
  const { data: items, isLoading: loadingItems } = useGetMenuItems(itemsParams);

  const sortedCategories = categories ? [...categories].sort((a, b) => a.sortOrder - b.sortOrder) : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-accent pt-32 pb-20 px-4 text-center border-b-8 border-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-black/80 z-0 mix-blend-multiply"></div>
        <div className="relative z-10">
          <h1 className="font-serif text-5xl md:text-6xl text-accent-foreground mb-4">Our Menu</h1>
          <p className="text-accent-foreground/80 max-w-2xl mx-auto text-lg">
            From our sizzling hibachi grills to our masterfully crafted sushi rolls, every dish is prepared with fresh ingredients and bold flavors.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-8">
        {loadingCategories ? (
          <div className="flex justify-center gap-2 mb-12 flex-wrap">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-24 rounded-full" />)}
          </div>
        ) : (
          <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory} className="w-full">
            <div className="flex justify-center mb-12">
              <TabsList className="bg-transparent flex-wrap justify-center h-auto gap-2 p-0">
                <TabsTrigger 
                  value="all"
                  className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-6 py-2.5 text-base"
                >
                  All Items
                </TabsTrigger>
                {sortedCategories.map(cat => (
                  <TabsTrigger 
                    key={cat.id} 
                    value={cat.id}
                    className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-6 py-2.5 text-base"
                  >
                    {cat.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            
            <div className="w-full">
              {loadingItems ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="flex flex-col gap-4">
                      <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-10 w-full mt-4" />
                    </div>
                  ))}
                </div>
              ) : items && items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {items.map(item => (
                    <MenuItemCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-24 bg-card rounded-xl border border-border">
                  <h3 className="font-serif text-2xl mb-2 text-foreground">No items found</h3>
                  <p className="text-muted-foreground mb-6">There are no menu items in this category right now.</p>
                  <button 
                    onClick={() => setActiveCategory("all")}
                    className="text-primary font-medium hover:underline"
                  >
                    View all items
                  </button>
                </div>
              )}
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}
