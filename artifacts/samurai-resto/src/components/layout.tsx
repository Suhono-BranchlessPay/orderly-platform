import { Link, useLocation } from "wouter";
import { useCart } from "@/lib/cart";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, ShoppingBag, Trash2, Menu as MenuIcon } from "lucide-react";
import { useState } from "react";

export function CartDrawer() {
  const { items, isCartOpen, setIsCartOpen, updateQuantity, removeItem, cartTotal } = useCart();
  const [, setLocation] = useLocation();

  return (
    <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col bg-background border-l-border">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl text-primary">Your Order</SheetTitle>
          <SheetDescription>
            {items.length === 0 ? "Your cart is empty." : "Review your items before checkout."}
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-4">
          {items.map((item) => (
            <div key={item.menuItem.id} className="flex gap-4 items-start">
              <div className="flex-1">
                <h4 className="font-medium text-foreground">{item.menuItem.name}</h4>
                <p className="text-primary font-semibold">${item.menuItem.price.toFixed(2)}</p>
                {item.specialInstructions && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    Note: {item.specialInstructions}
                  </p>
                )}
                
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center border border-border rounded-md">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQuantity(item.menuItem.id, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQuantity(item.menuItem.id, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.menuItem.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="pt-4 border-t border-border mt-auto">
            <div className="flex justify-between font-serif text-lg mb-6">
              <span>Subtotal</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <Button 
              className="w-full text-lg h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                setIsCartOpen(false);
                setLocation("/order");
              }}
            >
              Checkout
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { cartCount, cartTotal, setIsCartOpen } = useCart();
  const {
    brandName,
    logoSrc,
    phoneDisplay,
    phoneTel,
    addressLine,
    cityLine,
    weeklyHours,
  } = useTenant();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/menu", label: "Menu" },
    { href: "/catering", label: "Catering" },
    { href: "/account", label: "My Orders" },
    { href: "/order", label: "Order Online" },
  ];

  const mapsQuery = encodeURIComponent(`${addressLine} ${cityLine}`.trim());

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img
              src={logoSrc}
              alt={brandName}
              className="h-16 w-auto"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                className={`text-sm font-medium tracking-wide uppercase transition-colors hover:text-primary ${
                  location === link.href ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Button 
              variant="outline" 
              className="gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Cart ({cartCount})</span>
            </Button>
          </nav>

          {/* Mobile Nav Toggle */}
          <div className="flex items-center gap-4 md:hidden">
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative text-foreground"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <MenuIcon className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader className="text-left">
            <SheetTitle asChild>
              <img src={logoSrc} alt={brandName} className="h-16 w-auto" />
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-6 mt-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                className={`text-xl font-serif transition-colors hover:text-primary ${
                  location === link.href ? "text-primary" : "text-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Separator />
            <Button 
              className="w-full justify-start text-lg h-14 bg-primary text-primary-foreground"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsCartOpen(true);
              }}
            >
              <ShoppingBag className="mr-2 h-5 w-5" />
              View Cart ({cartCount})
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CartDrawer />

      <main className="flex-1">
        {children}
      </main>

      {/* Floating Cart */}
      {cartCount > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-primary text-white px-5 py-3.5 rounded-full shadow-2xl shadow-primary/40 hover:bg-primary/90 active:scale-95 transition-all duration-200 group"
        >
          <div className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-primary text-[10px] font-bold">
              {cartCount}
            </span>
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs text-white/70 font-medium">{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            <span className="text-sm font-bold">${cartTotal.toFixed(2)}</span>
          </div>
          <span className="text-sm font-bold text-white/90 ml-1 border-l border-white/30 pl-3">Checkout →</span>
        </button>
      )}

      <footer className="bg-accent text-accent-foreground py-16 border-t-4 border-primary">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
          <div>
            <img src={logoSrc} alt={brandName} className="h-20 w-auto mb-4" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
              target="_blank"
              rel="noreferrer"
              className="block text-accent-foreground/80 hover:text-primary transition-colors mb-1 underline underline-offset-2"
            >
              {addressLine}
            </a>
            <p className="text-accent-foreground/80 mb-5">{cityLine}</p>
            <a href={`tel:${phoneTel}`} className="block text-xl font-serif text-primary hover:text-primary-foreground transition-colors mb-2">
              {phoneDisplay || "Call to order"}
            </a>
            {phoneTel && (
            <a
              href={`tel:${phoneTel}`}
              className="mt-5 flex items-center justify-center md:justify-start gap-2 bg-primary hover:bg-primary/90 text-white font-semibold text-sm py-2.5 px-5 rounded-full transition-colors w-fit"
            >
              📞 Call to Order
            </a>
            )}
          </div>

          <div>
            <h3 className="font-serif text-xl mb-6 text-primary-foreground">Hours</h3>
            <div className="flex flex-col gap-1.5 text-sm items-center md:items-start">
              {weeklyHours.map(({ day, hours }) => (
                <div key={day} className="flex gap-3 w-full max-w-[220px]">
                  <span className="text-accent-foreground/60 w-24 shrink-0">{day}</span>
                  <span className="text-accent-foreground/90 font-medium">{hours}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-xl mb-6 text-primary-foreground">Connect</h3>
            <div className="flex flex-col items-center md:items-start gap-4">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent-foreground/80 hover:text-primary transition-colors underline underline-offset-4"
              >
                📍 Find us on Google Maps
              </a>
            </div>
            <div className="mt-8 pt-6 border-t border-accent-foreground/10 text-center md:text-left">
              <p className="text-xs text-accent-foreground/40">© {new Date().getFullYear()} {brandName}</p>
              <p className="text-xs text-accent-foreground/30 mt-1">{cityLine} · All rights reserved</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
