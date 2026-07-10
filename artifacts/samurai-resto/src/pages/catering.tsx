import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useTenant } from "@/lib/tenant";
import CateringFlyer from "@assets/WhatsApp_Image_2026-07-07_at_1.10.07_PM_1783444228285.jpeg";

const hibachi = [
  { name: "Chicken Hibachi Tray", feeds: "Feeds 8–10 people", price: "$89.99" },
  { name: "Steak Hibachi Tray", feeds: "Feeds 8–10 people", price: "$109.99" },
  { name: "Shrimp Hibachi Tray", feeds: "Feeds 8–10 people", price: "$109.99" },
  { name: "Combo Hibachi Tray", feeds: "Chicken, Steak & Shrimp · Feeds 10–12 people", price: "$139.99" },
  { name: "Deluxe Tray", feeds: "Steak, Shrimp, Scallop & Lobster · Feeds 12–15 people", price: "$199.99" },
];

const sushi = [
  {
    name: "Classic Roll Tray",
    detail: "40 pieces · Choose any 5 classic rolls",
    note: "California · Philly · Spicy Tuna · Cucumber · Avocado · Salmon · Shrimp Tempura · Eel Avocado · Spicy Crab",
    price: "$49.99",
  },
  {
    name: "Premium Roll Tray",
    detail: "50 pieces · Choose any 4 special rolls",
    note: "",
    price: "$79.99",
  },
  {
    name: "Party Tray",
    detail: "80 pieces · 4 classic + 4 special + 2 deep fried rolls",
    note: "",
    price: "$129.99",
  },
  {
    name: "Sushi & Hibachi Combo",
    detail: "Hibachi + Sushi Combo · Feeds 10–15 people",
    note: "",
    price: "From $179.99",
  },
];

const appetizers = [
  { name: "Egg Roll Tray", detail: "25 pcs", price: "$35.00" },
  { name: "Crab Rangoon Tray", detail: "30 pcs", price: "$45.00" },
  { name: "Gyoza Tray", detail: "30 pcs", price: "$45.00" },
  {
    name: "Mixed Appetizer Tray",
    detail: "Egg Roll, Gyoza, Crab Rangoon, Shrimp Shumai · Feeds 10–15 people",
    price: "$69.99",
  },
];

const bento = [
  { name: "Chicken Bento", price: "$12.50 / person" },
  { name: "Steak Bento", price: "$14.00 / person" },
  { name: "Shrimp Bento", price: "$14.00 / person" },
  { name: "Combo Bento", price: "Ask for pricing" },
];

const packages = [
  {
    name: "Silver Package",
    feeds: "Feeds 15–20 people",
    includes: "2 Hibachi Trays + Appetizer Tray",
    price: "$249",
    highlight: false,
  },
  {
    name: "Gold Package",
    feeds: "Feeds 25–30 people",
    includes: "3 Hibachi Trays + Sushi Tray + Appetizer Tray",
    price: "$399",
    highlight: true,
  },
  {
    name: "Platinum Package",
    feeds: "Feeds 40–50 people",
    includes: "Full Hibachi Buffet + Sushi Trays + Appetizers",
    price: "From $699",
    highlight: false,
  },
];

const addons = [
  { name: "Extra Yum Sauce", price: "+$5" },
  { name: "Noodles Instead of Rice (per tray)", price: "+$10" },
  { name: "Extra Sushi Roll (per roll)", price: "+$6" },
  { name: "Japanese Soda Package (6 bottles)", price: "+$15" },
];

const occasions = ["Birthday Parties", "Graduations", "Office Lunch", "Weddings", "Family Gatherings"];

function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-8">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-2">{label}</p>
      <h2 className="font-serif text-3xl md:text-4xl text-foreground">{title}</h2>
      <div className="w-16 h-1 bg-secondary mt-4" />
    </div>
  );
}

export default function Catering() {
  const { brandName, phoneDisplay, phoneTel, fullAddress } = useTenant();
  useEffect(() => {
    document.title = `Catering & Party Trays · ${brandName}`;
  }, [brandName]);
  return (
    <div className="flex flex-col w-full">
      {/* Hero */}
      <section className="relative bg-accent py-28 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black/60 z-0" />
        <img
          src={CateringFlyer}
          alt="Catering menu background"
          className="absolute inset-0 w-full h-full object-cover object-top opacity-30"
        />
        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="inline-block border border-primary/50 text-primary uppercase tracking-[0.2em] px-4 py-1.5 mb-6 text-sm font-medium bg-background/10 backdrop-blur-md rounded-sm">
            Party Trays &amp; Catering
          </div>
          <h1 className="font-serif text-5xl md:text-7xl text-accent-foreground font-bold mb-4">
            Catering &amp; <span className="text-primary">Party Trays</span>
          </h1>
          <p className="text-lg md:text-xl text-accent-foreground/80 max-w-2xl mx-auto mb-4">
            Fresh · Fast · Flavorful — Perfect for any occasion!
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {occasions.map((o) => (
              <span key={o} className="bg-primary/20 border border-primary/40 text-primary-foreground/90 text-sm px-4 py-1.5 rounded-full font-medium backdrop-blur-sm">
                {o}
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            {phoneTel && (
            <Button asChild size="lg" className="text-lg h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground">
              <a href={`tel:${phoneTel}`}>Call to Order: {phoneDisplay || phoneTel}</a>
            </Button>
            )}
            <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8 border-accent-foreground/30 text-accent-foreground hover:bg-accent-foreground hover:text-accent bg-background/5 backdrop-blur-sm">
              <Link href="/order">Order Online</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Hibachi Party Trays */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <SectionTitle label="🔥 Hibachi Party Trays" title="Hibachi Party Trays" />
          <p className="text-muted-foreground mb-8 -mt-2">Includes Fried Rice, Vegetables &amp; Yum Sauce</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {hibachi.map((item) => (
              <div key={item.name} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-2 hover:border-primary/40 transition-colors">
                <h3 className="font-serif text-xl text-foreground font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground flex-1">{item.feeds}</p>
                <p className="text-2xl font-bold text-primary mt-2">{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sushi Party Trays */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <SectionTitle label="🍣 Sushi Party Trays" title="Sushi Party Trays" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {sushi.map((item) => (
              <div key={item.name} className="bg-background border border-border rounded-2xl p-6 flex flex-col gap-2 hover:border-primary/40 transition-colors">
                <h3 className="font-serif text-xl text-foreground font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                {item.note && (
                  <p className="text-xs text-muted-foreground/70 italic border-l-2 border-primary/30 pl-3 mt-1">
                    Choose from: {item.note}
                  </p>
                )}
                <p className="text-2xl font-bold text-primary mt-auto pt-3">{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Appetizer Trays */}
      <section className="py-20 bg-background border-t border-border">
        <div className="container mx-auto px-4">
          <SectionTitle label="🥢 Appetizer Trays" title="Appetizer Trays" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {appetizers.map((item) => (
              <div key={item.name} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-2 hover:border-primary/40 transition-colors">
                <h3 className="font-serif text-lg text-foreground font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground flex-1">{item.detail}</p>
                <p className="text-2xl font-bold text-primary mt-2">{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bento / Office Lunch */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <SectionTitle label="🍱 Office Lunch Catering" title="Bento / Office Lunch" />
          <p className="text-muted-foreground mb-2 -mt-2">Minimum 10 orders</p>
          <p className="text-sm text-muted-foreground mb-8">
            Includes: Hibachi · Fried Rice · California Roll · Spring Roll · Yum Sauce
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {bento.map((item) => (
              <div key={item.name} className="bg-background border border-border rounded-2xl p-5 text-center hover:border-primary/40 transition-colors">
                <h3 className="font-serif text-lg text-foreground font-semibold mb-2">{item.name}</h3>
                <p className="text-xl font-bold text-primary">{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Event Packages */}
      <section className="py-20 bg-background border-t border-border">
        <div className="container mx-auto px-4">
          <SectionTitle label="🎉 Event Packages" title="Event Packages" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`rounded-2xl p-8 flex flex-col gap-3 border transition-all ${
                  pkg.highlight
                    ? "bg-primary text-primary-foreground border-primary shadow-xl scale-105"
                    : "bg-card border-border hover:border-primary/40"
                }`}
              >
                {pkg.highlight && (
                  <span className="text-xs font-bold uppercase tracking-widest bg-primary-foreground/20 text-primary-foreground rounded-full px-3 py-1 w-fit">
                    Most Popular
                  </span>
                )}
                <h3 className={`font-serif text-2xl font-bold ${pkg.highlight ? "text-primary-foreground" : "text-foreground"}`}>
                  {pkg.name}
                </h3>
                <p className={`text-sm font-medium ${pkg.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {pkg.feeds}
                </p>
                <p className={`text-sm flex-1 ${pkg.highlight ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                  {pkg.includes}
                </p>
                <p className={`text-4xl font-bold font-serif mt-4 ${pkg.highlight ? "text-primary-foreground" : "text-primary"}`}>
                  {pkg.price}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-Ons */}
      <section className="py-16 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <SectionTitle label="➕ Add-Ons" title="Add-Ons" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {addons.map((a) => (
              <div key={a.name} className="bg-background border border-border rounded-xl p-4 flex flex-col gap-1">
                <p className="text-sm text-foreground font-medium">{a.name}</p>
                <p className="text-lg font-bold text-primary">{a.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* We Can Accommodate */}
      <section className="py-16 bg-background border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">We Can Accommodate</h2>
          <div className="w-16 h-1 bg-secondary mx-auto mb-10" />
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {["Large Events", "Corporate Meetings", "School Functions", "Custom Orders", "Special Requests"].map((item) => (
              <div key={item} className="flex items-center gap-2 bg-card border border-border rounded-full px-5 py-2.5 text-sm font-medium text-foreground">
                <span className="text-primary">✓</span>
                {item}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-3xl p-10">
            <h3 className="font-serif text-2xl text-foreground mb-2">Ready to Place a Catering Order?</h3>
            <p className="text-muted-foreground mb-8">Call or text us — we'll help plan your event menu!</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {phoneTel && (
              <Button asChild size="lg" className="text-lg h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground">
                <a href={`tel:${phoneTel}`}>Call: {phoneDisplay || phoneTel}</a>
              </Button>
              )}
              <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                <Link href="/order">Order Online</Link>
              </Button>
            </div>
            {fullAddress && (
              <p className="text-xs text-muted-foreground mt-6">{fullAddress}</p>
            )}
          </div>
        </div>
      </section>

      {/* Back to home */}
      <div className="bg-background py-8 text-center border-t border-border">
        <Button asChild variant="ghost" className="text-primary hover:text-primary/80">
          <Link href="/menu">← View Full Menu</Link>
        </Button>
      </div>
    </div>
  );
}
