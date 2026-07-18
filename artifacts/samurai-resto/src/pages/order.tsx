import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateOrder } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2, ShoppingBag, Loader2, Pencil, MapPin, Phone, User, Package, CreditCard } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SquareCardPayment, type SquareCardHandle } from "@/components/SquareCardPayment";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  displayName,
  formatAddressDisplay,
  loadCheckoutProfile,
  rememberOrderId,
  saveCheckoutProfile,
  type StructuredAddress,
} from "@/lib/checkoutStorage";
import { useTenant } from "@/lib/tenant";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getAttribution } from "@/lib/attribution";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const addressSchema = z.object({
  street: z.string().min(1),
  unit: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  postcode: z.string().min(5),
  lat: z.number(),
  lng: z.number(),
});

/* ── Schema ── */
const detailsSchema = z.object({
  firstName:            z.string().min(1, "First name is required"),
  lastName:             z.string().optional(),
  customerPhone:        z.string().min(10, "Valid phone number required"),
  customerEmail:        z.string().email("Valid email required").optional().or(z.literal("")),
  orderType:            z.enum(["pickup", "delivery"]),
  address:              addressSchema.nullable().optional(),
  specialInstructions:  z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.orderType === "delivery" && !data.address) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a delivery address from the suggestions", path: ["address"] });
  }
});

type DetailsValues = z.infer<typeof detailsSchema>;

/* ── Progress Bar ── */
const STEPS = ["Cart", "Details", "Confirm", "Done"] as const;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10 w-full max-w-lg mx-auto">
      {STEPS.map((label, idx) => {
        const isCompleted = idx < step;
        const isActive    = idx === step;
        const isLast      = idx === STEPS.length - 1;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
                ${isCompleted ? "bg-primary border-primary text-white" :
                  isActive    ? "bg-primary/20 border-primary text-primary" :
                                "bg-muted border-border text-muted-foreground"}`}
              >
                {isCompleted ? "✓" : idx + 1}
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap ${isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div className={`h-0.5 flex-1 mx-2 mb-5 rounded transition-all duration-500 ${isCompleted ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type DeliveryQuote = {
  externalDeliveryId: string;
  deliveryFee: number;
  estimatedDropoffTime: string | null;
  grandTotal: number;
};

/* ══ Main Component ══ */
export default function Order() {
  const { brandName, fullAddress } = useTenant();
  useEffect(() => {
    document.title = `Order Online · ${brandName}`;
  }, [brandName]);
  const { items, cartTotal, clearCart, setIsCartOpen } = useCart();
  const { toast } = useToast();
  const createOrder = useCreateOrder();

  const [step, setStep]                   = useState(0); // 0=Cart 1=Details 2=Confirm 3=Done
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [successTotal, setSuccessTotal] = useState<number | null>(null);
  const [successTrackingUrl, setSuccessTrackingUrl] = useState<string | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState("default");
  const [addressUnit, setAddressUnit] = useState("");
  const [tipPreset, setTipPreset] = useState<"none" | 15 | 18 | 20 | "custom">("none");
  const [customTipDollars, setCustomTipDollars] = useState("");
  const [pickupEstimateLabel, setPickupEstimateLabel] = useState<string | null>(null);
  const [ordersPaused, setOrdersPaused] = useState(false);
  const cardRef = useRef<SquareCardHandle>(null);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      customerPhone: "",
      customerEmail: "",
      orderType: "pickup",
      address: null,
      specialInstructions: "",
    },
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/square/config`)
      .then((r) => r.json())
      .then((c: { enabled?: boolean }) => setCheckoutEnabled(Boolean(c.enabled)))
      .catch(() => setCheckoutEnabled(false));

    fetch(`${API_BASE}/api/kitchen/estimate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: {
        orders_paused?: boolean;
        estimate?: { label?: string };
      } | null) => {
        if (!c) return;
        setOrdersPaused(Boolean(c.orders_paused));
        if (c.estimate?.label) setPickupEstimateLabel(c.estimate.label);
      })
      .catch(() => {});

    fetch(`${API_BASE}/api/config/checkout`)
      .then((r) => r.json())
      .then((c: { tenantId?: string }) => {
        const tid = c.tenantId ?? "default";
        setTenantId(tid);
        const saved = loadCheckoutProfile(tid);
        if (saved) {
          form.reset({
            firstName: saved.firstName,
            lastName: saved.lastName ?? "",
            customerPhone: saved.customerPhone,
            customerEmail: saved.customerEmail ?? "",
            orderType: "pickup",
            address: saved.address ?? null,
            specialInstructions: "",
          });
          setAddressUnit(saved.address?.unit ?? "");
        }
      })
      .catch(() => {});
  }, [form]);

  const values    = form.getValues();
  const orderType = form.watch("orderType");
  const tax       = cartTotal * 0.07;
  const baseTotal = orderType === "delivery" && deliveryQuote
    ? deliveryQuote.grandTotal
    : cartTotal + tax;
  const tipCents =
    tipPreset === "none"
      ? 0
      : tipPreset === "custom"
        ? Math.max(0, Math.round(parseFloat(customTipDollars || "0") * 100) || 0)
        : Math.round(cartTotal * tipPreset);
  const tipDollars = tipCents / 100;
  const total = baseTotal + tipDollars;

  useEffect(() => {
    if (orderType !== "delivery") {
      setDeliveryQuote(null);
    }
  }, [orderType]);

  /* ── Step 0 → 1: validate cart is non-empty ── */
  const goToDetails = () => {
    if (items.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before proceeding.", variant: "destructive" });
      return;
    }
    setStep(1);
    window.scrollTo(0, 0);
  };

  /* ── Step 1 → 2: validate details form ── */
  const goToConfirm = async () => {
    const ok = await form.trigger();
    if (!ok) return;

    const data = form.getValues();
    if (data.orderType === "delivery") {
      setQuoteLoading(true);
      setDeliveryQuote(null);
      try {
        const res = await fetch(`${API_BASE}/api/delivery/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName || null,
            customerPhone: data.customerPhone,
            address: data.address,
            items: items.map((item) => ({
              menuItemId: item.menuItem.id,
              quantity: item.quantity,
            })),
          }),
        });
        const body = await res.json() as DeliveryQuote & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? "Cannot deliver to this address");
        }
        setDeliveryQuote({
          externalDeliveryId: body.externalDeliveryId,
          deliveryFee: body.deliveryFee,
          estimatedDropoffTime: body.estimatedDropoffTime,
          grandTotal: body.grandTotal,
        });
      } catch (err) {
        toast({
          title: "Delivery unavailable",
          description: err instanceof Error ? err.message : "Please try a different address or pickup.",
          variant: "destructive",
        });
        setQuoteLoading(false);
        return;
      }
      setQuoteLoading(false);
    }

    setStep(2);
    trackAnalyticsEvent({
      tenantId,
      eventType: "checkout_start",
      meta: { orderType: data.orderType, itemCount: items.length },
    });
    window.scrollTo(0, 0);
  };

  /* ── Step 2 → submit ── */
  const placeOrder = async () => {
    if (ordersPaused) {
      toast({
        title: "Ordering paused",
        description: "Online ordering is temporarily paused. Please try again shortly.",
        variant: "destructive",
      });
      return;
    }
    if (!checkoutEnabled) {
      toast({
        title: "Checkout unavailable",
        description: "Please call the restaurant to place your order.",
        variant: "destructive",
      });
      return;
    }

    const data = form.getValues();

    if (!cardRef.current?.isReady()) {
      toast({
        title: "Payment required",
        description: "Enter your card details to complete your order.",
        variant: "destructive",
      });
      return;
    }

    let squarePaymentSourceId: string;
    try {
      squarePaymentSourceId = await cardRef.current.tokenize();
    } catch (err) {
      toast({
        title: "Payment failed",
        description: err instanceof Error ? err.message : "Could not process card.",
        variant: "destructive",
      });
      return;
    }

    if (data.orderType === "delivery" && !deliveryQuote) {
      toast({
        title: "Delivery quote required",
        description: "Go back and confirm your delivery address.",
        variant: "destructive",
      });
      return;
    }

    const orderInput = {
      firstName: data.firstName,
      lastName: data.lastName || null,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail || null,
      orderType: data.orderType,
      address: data.orderType === "delivery" ? data.address : null,
      squarePaymentSourceId,
      doordashExternalDeliveryId:
        data.orderType === "delivery" ? deliveryQuote?.externalDeliveryId : null,
      items: items.map(item => ({
        menuItemId: item.menuItem.id,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || null,
      })),
      specialInstructions: data.specialInstructions || null,
      tipCents,
      channel: getAttribution(tenantId).channel,
      sourceDetail: getAttribution(tenantId).source_detail,
    };
    createOrder.mutate({ data: orderInput }, {
      onSuccess: (response) => {
        saveCheckoutProfile(tenantId, {
          firstName: data.firstName,
          lastName: data.lastName || null,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail || undefined,
          address: data.orderType === "delivery" ? data.address ?? null : loadCheckoutProfile(tenantId)?.address ?? null,
        });
        rememberOrderId(response.id);
        setSuccessOrderId(response.id);
        setSuccessTotal(response.total);
        setSuccessTrackingUrl(
          (response as { doordashTrackingUrl?: string | null }).doordashTrackingUrl ?? null,
        );
        {
          const attr = getAttribution(tenantId);
          const detail = attr.source_detail || {};
          trackAnalyticsEvent({
            tenantId,
            eventType: "paid",
            orderId: response.id,
            meta: {
              tipCents,
              channel: attr.channel,
              // Click ids for CAPI matching even after URL loses ?fbclid=
              ...(typeof detail.fbc === "string" ? { fbc: detail.fbc } : {}),
              ...(typeof detail.fbclid === "string"
                ? { fbclid: detail.fbclid }
                : {}),
            },
          });
        }
        clearCart();
        setDeliveryQuote(null);
        setStep(3);
        window.scrollTo(0, 0);
      },
      onError: (error: unknown) => {
        let description = "Your card could not be charged. Please try again.";
        if (error && typeof error === "object" && "data" in error) {
          const data = (error as { data?: { error?: string } }).data;
          if (data?.error) description = data.error;
        }
        toast({ title: "Payment failed", description, variant: "destructive" });
      },
    });
  };

  /* ══ Done Screen ══ */
  if (step === 3 && successOrderId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
        <ProgressBar step={3} />
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center shadow-xl">
          <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Order Confirmed!</h1>
          <p className="text-muted-foreground mb-6">Thank you for choosing {brandName}.</p>
          <div className="bg-muted w-full rounded-xl p-5 border border-border mb-3">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Order Number</p>
            <p className="font-mono text-2xl font-bold text-primary">{successOrderId.substring(0, 8).toUpperCase()}</p>
          </div>
          <div className="bg-muted w-full rounded-xl p-4 border border-border mb-8 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-semibold capitalize">{values.orderType}</span>
              <span className="text-muted-foreground">— Est. 20–30 min</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{values.customerPhone}</span>
            </div>
            {values.orderType === "delivery" && values.address && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{formatAddressDisplay(values.address)}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Your card has been charged ${(successTotal ?? total).toFixed(2)}.
            {values.orderType === "delivery"
              ? " Your order is being prepared and a Dasher will be assigned shortly."
              : ` We'll call you at ${values.customerPhone} when your order is ready.`}
          </p>
          {successTrackingUrl && (
            <a
              href={successTrackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary font-semibold underline mb-6 block"
            >
              Track your delivery on DoorDash →
            </a>
          )}
          {!successTrackingUrl && values.orderType === "delivery" && (
            <p className="text-xs text-muted-foreground mb-6">
              Tracking link will be sent when your Dasher is assigned.
            </p>
          )}
          {values.orderType === "pickup" && (
            <p className="text-xs text-muted-foreground mb-6">
              We&apos;ll call you at {values.customerPhone} when your order is ready.
            </p>
          )}
          <Button asChild className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-white">
            <Link href="/">← Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="container mx-auto px-4 max-w-2xl">

        {/* Back link */}
        <Button variant="ghost" asChild className="pl-0 text-muted-foreground hover:text-foreground mb-6">
          <Link href="/menu"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Menu</Link>
        </Button>

        <h1 className="font-serif text-4xl text-foreground mb-8">Checkout</h1>

        {ordersPaused && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
            Online ordering is temporarily paused. Please try again shortly or call the restaurant.
          </div>
        )}

        <ProgressBar step={step} />

        {/* ══ STEP 0 — Cart Review ══ */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/30">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <h2 className="font-serif text-xl text-foreground">Your Cart</h2>
                <span className="ml-auto text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
              </div>

              {items.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-muted-foreground mb-4">Your cart is empty.</p>
                  <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-white">
                    <Link href="/menu">Browse Menu</Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map(item => (
                    <div key={item.menuItem.id} className="flex items-start gap-4 px-6 py-4">
                      <span className="bg-primary/10 text-primary text-sm font-bold px-2.5 py-1 rounded-lg min-w-[2.5rem] text-center">
                        {item.quantity}×
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{item.menuItem.name}</p>
                        {item.specialInstructions && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">Note: {item.specialInstructions}</p>
                        )}
                      </div>
                      <span className="font-semibold text-foreground whitespace-nowrap">
                        ${(item.menuItem.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {items.length > 0 && (
                <div className="px-6 py-4 border-t border-border bg-muted/20 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span><span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax (7%)</span><span>${tax.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-serif text-xl font-bold text-foreground pt-1">
                    <span>Total</span><span className="text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsCartOpen(true)} className="flex-1 border-border text-foreground hover:border-primary hover:text-primary">
                  <Pencil className="h-4 w-4 mr-2" /> Edit Cart
                </Button>
                <Button onClick={goToDetails} className="flex-1 bg-primary hover:bg-primary/90 text-white h-12">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 1 — Details ══ */}
        {step === 1 && (
          <Form {...form}>
            <div className="space-y-5">
              {/* Pickup or Delivery */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h2 className="font-serif text-xl text-foreground mb-4">How do you want it?</h2>
                <FormField
                  control={form.control}
                  name="orderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-4">
                          {(["pickup", "delivery"] as const).map(type => (
                            <FormItem key={type} className="flex items-center space-x-0 space-y-0">
                              <FormControl><RadioGroupItem value={type} className="peer sr-only" /></FormControl>
                              <FormLabel className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-border bg-popover p-5 hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 transition-all">
                                <span className="text-2xl mb-1">{type === "pickup" ? "🥡" : "🛵"}</span>
                                <span className="font-semibold text-base text-foreground capitalize">{type}</span>
                                <span className="text-xs text-muted-foreground mt-0.5">{type === "pickup" ? "Collect at restaurant" : "Delivered to you"}</span>
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {orderType === "pickup" && pickupEstimateLabel && !ordersPaused && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Ready in about <span className="font-medium text-foreground">{pickupEstimateLabel}</span>
                  </p>
                )}
              </div>

              {/* Contact Info */}
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <h2 className="font-serif text-xl text-foreground mb-2">Your Info</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground flex items-center gap-2"><User className="h-3.5 w-3.5" /> First Name *</FormLabel>
                      <FormControl><Input placeholder="Sri" {...field} className="h-12 bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Last Name</FormLabel>
                      <FormControl><Input placeholder="Optional" {...field} className="h-12 bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="customerPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Phone *</FormLabel>
                    <FormControl><Input placeholder="(765) 555-1234" {...field} className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Email (Optional)</FormLabel>
                    <FormControl><Input placeholder="you@example.com" type="email" {...field} className="h-12 bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {orderType === "delivery" && (
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <FormLabel className="text-foreground flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Delivery Address *</FormLabel>
                      <FormControl>
                        <AddressAutocomplete
                          apiBase={API_BASE}
                          value={(field.value as StructuredAddress | null) ?? null}
                          unit={addressUnit}
                          onAddressChange={field.onChange}
                          onUnitChange={setAddressUnit}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="specialInstructions" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Order Notes (Optional)</FormLabel>
                    <FormControl><Textarea placeholder="Any special requests for the kitchen?" {...field} className="resize-none h-20 bg-background" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1 border-border">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={goToConfirm} disabled={quoteLoading} className="flex-1 bg-primary hover:bg-primary/90 text-white h-12">
                  {quoteLoading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Getting delivery quote…</>
                    : <>Review Order <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          </Form>
        )}

        {/* ══ STEP 2 — Confirm ══ */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Order summary */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <h2 className="font-serif text-xl text-foreground">Order Summary</h2>
                <button onClick={() => setStep(0)} className="text-xs text-primary hover:underline underline-offset-2">Edit Cart</button>
              </div>
              <div className="divide-y divide-border">
                {items.map(item => (
                  <div key={item.menuItem.id} className="flex gap-4 px-6 py-3 items-center">
                    <span className="bg-primary/10 text-primary text-sm font-bold px-2 py-0.5 rounded">{item.quantity}×</span>
                    <span className="flex-1 text-foreground font-medium">{item.menuItem.name}</span>
                    <span className="text-foreground font-semibold">${(item.menuItem.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-border bg-muted/20 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal</span><span>${cartTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm text-muted-foreground"><span>Tax (7%)</span><span>${tax.toFixed(2)}</span></div>
                {values.orderType === "delivery" && deliveryQuote && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Delivery</span><span>${deliveryQuote.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {values.orderType === "delivery" && deliveryQuote?.estimatedDropoffTime && (
                  <p className="text-xs text-muted-foreground">
                    Est. delivery by {new Date(deliveryQuote.estimatedDropoffTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <div className="pt-2 space-y-2">
                  <p className="text-sm font-medium text-foreground">Add a tip <span className="text-muted-foreground font-normal">(100% to the restaurant)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["none", "No tip"],
                      [15, "15%"],
                      [18, "18%"],
                      [20, "20%"],
                      ["custom", "Custom"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={String(key)}
                        type="button"
                        onClick={() => setTipPreset(key)}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          tipPreset === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tipPreset === "custom" && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={customTipDollars}
                        onChange={(e) => setCustomTipDollars(e.target.value)}
                        className="max-w-[140px] bg-background"
                      />
                    </div>
                  )}
                  {tipCents > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tip</span><span>${tipDollars.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between font-serif text-2xl font-bold text-foreground pt-1">
                  <span>Total</span><span className="text-primary">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Customer details review */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl text-foreground">Your Details</h2>
                <button onClick={() => setStep(1)} className="text-xs text-primary hover:underline underline-offset-2">Edit</button>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-3 text-foreground">
                  <span className="text-2xl">{values.orderType === "pickup" ? "🥡" : "🛵"}</span>
                  <span className="font-semibold capitalize">{values.orderType}</span>
                  {values.orderType === "pickup" && fullAddress && (
                    <span className="text-muted-foreground">· {fullAddress}</span>
                  )}
                  {values.orderType === "pickup" && pickupEstimateLabel && (
                    <span className="text-muted-foreground">· ready in ~{pickupEstimateLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <User className="h-4 w-4" /><span>{displayName(values.firstName, values.lastName)}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="h-4 w-4" /><span>{values.customerPhone}</span>
                </div>
                {values.address && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="h-4 w-4" /><span>{formatAddressDisplay(values.address)}</span>
                  </div>
                )}
                {values.specialInstructions && (
                  <div className="flex items-start gap-3 text-muted-foreground">
                    <span className="text-base mt-0.5">📝</span><span className="italic">{values.specialInstructions}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment — prepaid card required */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-serif text-xl text-foreground">Payment</h2>
              <p className="text-sm text-muted-foreground">
                Pay in full now with your card. Your order is sent to the kitchen only after payment succeeds.
              </p>
              {checkoutEnabled === false && (
                <p className="text-sm text-destructive">
                  Online payment is not available right now. Please call the restaurant.
                </p>
              )}
              <div>
                <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Card details
                </p>
                <SquareCardPayment ref={cardRef} onReadyChange={setCardReady} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-border">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={placeOrder}
                disabled={
                  createOrder.isPending ||
                  !cardReady ||
                  checkoutEnabled === false ||
                  ordersPaused
                }
                className="flex-2 flex-[2] bg-primary hover:bg-primary/90 text-white h-14 text-base shadow-lg shadow-primary/20"
              >
                {createOrder.isPending
                  ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing payment…</>
                  : <>✓ Pay &amp; Place Order · ${total.toFixed(2)}</>}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              By placing your order, you agree to be contacted at the phone number provided.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
