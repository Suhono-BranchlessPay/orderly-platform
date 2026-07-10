import { useGetFeaturedItems } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuItemCard, IMAGE_MAP } from "@/components/MenuItemCard";
import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { useTenant } from "@/lib/tenant";

/* ── Carousel slides (new high-quality photos) ── */
import SlideOMG from "@assets/OMG_Roll_1783446966481.jpeg";
import SlideSushi from "@assets/Samurai_Sushi_Platter_FB_1783446966479.jpg";
import SlideSweet from "@assets/Sweat_Heard_1783446966481.jpeg";
import SlideBeefBento from "@assets/beef_bento_1783446966482.jpeg";
import SlideBento from "@assets/BentoBox_1783446966476.jpeg";

/* ── About section photos ── */
import BeefBento from "@assets/beef_bento_1783478990267.jpeg";

/* ── Brochures ── */
import MenuBrochure from "@assets/WhatsApp_Image_2026-06-10_at_4.03.55_PM_(2)_1783446468726.jpeg";
import CateringBrochure from "@assets/WhatsApp_Image_2026-07-07_at_1.10.07_PM_1783446468725.jpeg";

const HERO_SLIDES = [
  { src: SlideOMG,      alt: "OMG Roll — Chef's Signature",         pos: "object-center" },
  { src: SlideSushi,    alt: "Sushi Platter",                       pos: "object-center" },
  { src: SlideSweet,    alt: "Sweet Heart Roll",                    pos: "object-center" },
  { src: SlideBeefBento,alt: "Beef Bento Box",                     pos: "object-top"    },
  { src: SlideBento,    alt: "Chicken Bento Box",                   pos: "object-top"    },
];

const REVIEWS = [
  { name: "Britney M.", initials: "BM", source: "Google",   text: "The food was amazing!!! The service was just as good. Drinks never got empty. They spoke to us as if they had known us forever. This is definitely our new favorite spot!" },
  { name: "Winston C.", initials: "WC", source: "Google",   text: "The sushi was fresher than wet paint! You've got to try this spot out. The hibachi is absolutely incredible!" },
  { name: "Jeremy B.",  initials: "JB", source: "Facebook", text: "Tried a bunch of things: the OMG Roll is amazing. Hibachi chicken was perfectly seasoned. The staff was so friendly. Will definitely be back!" },
  { name: "Amanda L.",  initials: "AL", source: "Google",   text: "Best sushi in town by far! The rolls are creative and incredibly fresh. My family comes here every weekend now." },
  { name: "Mike T.",    initials: "MT", source: "Facebook", text: "The hibachi grill experience is top notch. Our chef was entertaining and the food was phenomenal. Prices are very reasonable!" },
  { name: "Sarah K.",   initials: "SK", source: "Google",   text: "Went here for my birthday and it exceeded all expectations. The Dragon Roll and Beef Hibachi are must-orders!" },
];

const BROCHURES = [
  {
    title:       "Full Menu",
    subtitle:    "Hibachi • Sushi • Bento • Drinks",
    description: "Complete menu with all rolls, hibachi, bento boxes, appetizers, and drinks with prices.",
    src:         MenuBrochure,
    filename:    "Menu.jpg",
    badge:       "📋",
  },
  {
    title:       "Party Trays & Catering",
    subtitle:    "Perfect for any occasion",
    description: "Hibachi trays, sushi trays, event packages (Silver/Gold/Platinum), office lunch, and add-ons.",
    src:         CateringBrochure,
    filename:    "Catering-Menu.jpg",
    badge:       "🎉",
  },
];

/* Items that have real photos — shown on homepage */
const PHOTO_ITEMS = new Set(Object.keys(IMAGE_MAP));

export default function Home() {
  const {
    brandName,
    tagline,
    aboutText,
    addressLine,
    cityLine,
    mapsSearchUrl,
    metaTitle,
    tenant,
  } = useTenant();

  useEffect(() => {
    document.title = metaTitle;
  }, [metaTitle]);

  const { data: featuredItems, isLoading } = useGetFeaturedItems();
  const [currentSlide, setCurrentSlide]   = useState(0);
  const [visible, setVisible]             = useState(true);
  const [previewBrochure, setPreviewBrochure] = useState<null | typeof BROCHURES[0]>(null);

  /* Auto-advance carousel with fade */
  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentSlide(i => (i + 1) % HERO_SLIDES.length);
        setVisible(true);
      }, 500);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const goToSlide = (idx: number) => {
    if (idx === currentSlide) return;
    setVisible(false);
    setTimeout(() => { setCurrentSlide(idx); setVisible(true); }, 500);
  };

  /* Only featured items that have a real photo */
  const photoFeatured = featuredItems?.filter(item => PHOTO_ITEMS.has(item.name)) ?? [];
  const showReviews = tenant?.tenantId === "samurai";
  const ratingValue =
    typeof tenant?.theme?.ratingValue === "string" ? tenant.theme.ratingValue : null;
  const reviewCount =
    typeof tenant?.theme?.reviewCount === "string" ? tenant.theme.reviewCount : null;

  const slide = HERO_SLIDES[currentSlide];
  const locationLabel = [cityLine.split(",")[0], addressLine].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col w-full">

      {/* ══ Hero Carousel ══ */}
      <section className="relative min-h-[88vh] flex items-center justify-center overflow-hidden bg-black">

        {/* Background image — no zoom, no scale, object-contain keeps full dish visible */}
        <div
          className="absolute inset-0 z-0"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease" }}
        >
          {/* Soft vignette gradient so text is always readable */}
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
          <img
            key={currentSlide}
            src={slide.src}
            alt={slide.alt}
            className={`w-full h-full object-cover ${slide.pos}`}
          />
        </div>

        {/* Hero content */}
        <div className="container mx-auto px-4 z-20 flex flex-col items-center text-center mt-16">
          {/* Google rating pill — only when tenant has rating config */}
          {ratingValue && (
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 mb-8 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 hover:bg-white/15 transition-colors"
          >
            <span className="text-yellow-400 text-base">★★★★★</span>
            <span className="text-white font-semibold text-sm">{ratingValue}</span>
            {reviewCount && (
              <span className="text-white/60 text-sm">· {Number(reviewCount).toLocaleString()}+ Google Reviews</span>
            )}
          </a>
          )}

          <h1 className="font-serif font-bold tracking-tight text-white leading-none mb-3">
            <span className="block text-5xl md:text-7xl lg:text-8xl">Fresh Sushi.</span>
            <span className="block text-5xl md:text-7xl lg:text-8xl text-primary mt-1">Hot Hibachi.</span>
            <span className="block text-5xl md:text-7xl lg:text-8xl mt-1">Delivered Fast.</span>
          </h1>

          <p className="mt-8 text-white/70 text-base md:text-lg max-w-lg">
            {tagline}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full sm:w-auto">
            <Button asChild size="lg" className="text-base px-8 bg-primary hover:bg-primary/90 text-white min-w-[180px]">
              <Link href="/order">🥡 Order Pickup</Link>
            </Button>
            <Button asChild size="lg" className="text-base px-8 bg-primary hover:bg-primary/90 text-white min-w-[180px]">
              <Link href="/order">🛵 Order Delivery</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base px-8 border-white/30 text-white hover:bg-white/10 min-w-[180px]">
              <Link href="/menu">View Menu</Link>
            </Button>
          </div>

          {/* Dot indicators */}
          <div className="flex gap-2 mt-10">
            {HERO_SLIDES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? "w-8 bg-primary" : "w-4 bg-white/30 hover:bg-white/60"}`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          {locationLabel && (
            <p className="mt-4 text-white/40 text-xs">{locationLabel}</p>
          )}
        </div>
      </section>

      {/* ══ Menu Downloads ══ */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-3">Save For Later</p>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground">Download Our Menus</h2>
            <div className="w-20 h-0.5 bg-secondary mx-auto mt-5" />
            <p className="text-muted-foreground mt-4 text-sm max-w-md mx-auto">
              Tap to preview full size or download to your phone for easy ordering.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {BROCHURES.map((brochure) => (
              <div key={brochure.title} className="bg-background border border-border rounded-2xl overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
                <button
                  onClick={() => setPreviewBrochure(brochure)}
                  className="relative aspect-[16/9] overflow-hidden group w-full"
                >
                  <img
                    src={brochure.src}
                    alt={brochure.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="text-white text-sm font-semibold bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-4 py-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" /> View Full Size
                    </span>
                  </div>
                </button>

                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{brochure.badge}</span>
                    <div>
                      <h3 className="font-serif text-xl font-semibold text-foreground">{brochure.title}</h3>
                      <p className="text-xs text-primary font-semibold uppercase tracking-wider mt-0.5">{brochure.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm flex-1 mb-5">{brochure.description}</p>
                  <a
                    href={brochure.src}
                    download={brochure.filename}
                    className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary/90 text-white font-semibold text-sm py-3 px-4 rounded-lg transition-colors"
                  >
                    <Download className="h-4 w-4" /> Download Menu
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brochure lightbox */}
      {previewBrochure && (
        <div
          className="fixed inset-0 z-[100] bg-black/96 flex items-center justify-center p-4"
          onClick={() => setPreviewBrochure(null)}
        >
          <div className="relative max-w-5xl w-full flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-serif text-xl">{previewBrochure.title}</h3>
              <div className="flex gap-3">
                <a
                  href={previewBrochure.src}
                  download={previewBrochure.filename}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="h-4 w-4" /> Download
                </a>
                <button
                  onClick={() => setPreviewBrochure(null)}
                  className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 text-sm transition-colors"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <img
              src={previewBrochure.src}
              alt={previewBrochure.title}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* ══ Featured Dishes (only items with real photos) ══ */}
      <section className="py-24 bg-background border-t-4 border-primary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-3">Chef's Selection</p>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground">Featured Dishes</h2>
            <div className="w-20 h-0.5 bg-secondary mx-auto mt-5" />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-10 w-full mt-3" />
                </div>
              ))}
            </div>
          ) : photoFeatured.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {photoFeatured.slice(0, 4).map(item => (
                <MenuItemCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground italic py-12">Check back soon for featured dishes.</p>
          )}

          <div className="mt-14 text-center">
            <Button asChild variant="outline" size="lg" className="border-primary text-primary hover:bg-primary hover:text-white">
              <Link href="/menu">See Full Menu</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ══ Guest Reviews ══ */}
      {showReviews && (
      <section className="py-24 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-3">Google &amp; Facebook Reviews</p>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground">What Our Guests Are Saying</h2>
            <div className="w-20 h-0.5 bg-secondary mx-auto mt-5" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {REVIEWS.map(review => (
              <div key={review.name} className="bg-background border border-border rounded-2xl p-6 flex flex-col gap-4 hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-2">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} className="w-4 h-4 fill-yellow-400" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                  <span className="ml-1 text-xs text-muted-foreground uppercase tracking-wide">{review.source}</span>
                </div>
                <p className="text-foreground/80 text-sm leading-relaxed flex-1">"{review.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                    {review.initials}
                  </div>
                  <span className="font-semibold text-foreground text-sm">{review.name}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a href={mapsSearchUrl} target="_blank" rel="noreferrer"
              className="text-primary hover:text-primary/80 text-sm font-medium underline underline-offset-4 transition-colors">
              Read more reviews on Google Maps →
            </a>
          </div>
        </div>
      </section>
      )}

      {/* ══ About ══ */}
      <section className="py-24 bg-background border-t border-border overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Image column */}
            <div className="order-2 md:order-1 flex justify-center">
              <div className="relative w-full max-w-sm mx-auto">
                {/* Decorative red glow behind */}
                <div className="absolute -inset-3 rounded-3xl bg-primary/20 blur-2xl" />
                {/* Main photo — portrait ratio so nothing is cropped */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-border/60 aspect-[4/5]">
                  <img
                    src={BeefBento}
                    alt="Beef Bento Box — Steak, Fried Rice, Veggies, Spring Rolls & Sushi"
                    className="w-full h-full object-cover object-center"
                  />
                  {/* Dish label badge */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                    <span className="text-2xl">🍱</span>
                    <div>
                      <p className="text-white font-semibold text-sm leading-tight">Beef Bento Box</p>
                      <p className="text-white/60 text-xs mt-0.5">Steak · Rice · Veggies · Spring Roll · Sushi</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text column */}
            <div className="order-1 md:order-2 lg:pl-4">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-3">Our Story</p>
              <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-6 leading-tight">
                The Neighborhood Japanese Experience
              </h2>
              <p className="text-muted-foreground mb-5 leading-relaxed">
                {aboutText}
              </p>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Whether you're celebrating a family milestone around our sizzling hibachi grills or enjoying an intimate date night with our signature sushi rolls, you'll find deep rich flavors and a welcoming atmosphere at {brandName}.
              </p>

              <div className="flex items-center gap-8 pt-6 border-t border-border">
                <div className="text-center">
                  <span className="block font-serif text-3xl text-primary mb-1">79+</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Menu Items</span>
                </div>
                <div className="text-center border-l border-border pl-8">
                  <span className="block font-serif text-3xl text-primary mb-1">100%</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Fresh Daily</span>
                </div>
                {ratingValue && (
                <div className="text-center border-l border-border pl-8">
                  <span className="block font-serif text-3xl text-primary mb-1">{ratingValue}★</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Google Rating</span>
                </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
