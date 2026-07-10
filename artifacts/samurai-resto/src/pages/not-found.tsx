import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, UtensilsCrossed } from "lucide-react";
import { useEffect } from "react";
import { useTenant } from "@/lib/tenant";

export default function NotFound() {
  const { brandName } = useTenant();
  useEffect(() => {
    document.title = `Page Not Found · ${brandName}`;
  }, [brandName]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 bg-background">
      <UtensilsCrossed className="h-16 w-16 text-primary/30 mx-auto mb-6" />
      <h1 className="font-serif text-7xl font-bold text-primary mb-2">404</h1>
      <h2 className="font-serif text-2xl text-foreground mb-3">Page Not Found</h2>
      <p className="text-muted-foreground max-w-sm mx-auto text-sm mb-8">
        This page doesn't exist. Let us bring you back to the good stuff.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild className="bg-primary hover:bg-primary/90 text-white gap-2">
          <Link href="/"><Home className="h-4 w-4" /> Go Home</Link>
        </Button>
        <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-white gap-2">
          <Link href="/menu"><UtensilsCrossed className="h-4 w-4" /> View Menu</Link>
        </Button>
      </div>
    </div>
  );
}
