import { MenuItem } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/lib/tenant";

import SushiPlatter from "@assets/Samurai_Sushi_Platter_FB_1783446966479.jpg";
import CrabRangoon from "@assets/Crab_Rangon_1783446966479.jpeg";
import VegRoll from "@assets/vegetable_Roll_1783446966480.jpeg";
import KaniSalad from "@assets/Kani_Salad_1783446966480.jpeg";
import SeaweedSalad from "@assets/Sewet_salad_1783446966480.jpeg";
import SweetHeart from "@assets/Sweat_Heard_1783446966481.jpeg";
import OMGRoll from "@assets/OMG_Roll_1783446966481.jpeg";
import BeefHibachi from "@assets/Beef_Habachi_1783446966481.jpeg";
import BeefBento from "@assets/beef_bento_1783446966482.jpeg";
import BentoBox from "@assets/BentoBox_1783446966476.jpeg";

export const IMAGE_MAP: Record<string, string> = {
  "Crab Rangoon": CrabRangoon,
  "Vegetable Spring Roll": VegRoll,
  "Kani Salad": KaniSalad,
  "Seaweed Salad": SeaweedSalad,
  "Sweet Heart Roll": SweetHeart,
  "OMG Roll": OMGRoll,
  "Beef Hibachi": BeefHibachi,
  "Beef Bento Box": BeefBento,
  "Sushi Platter": SushiPlatter,
  "Chicken Bento Box": BentoBox,
  "Steak Bento Box": BeefBento,
  "Shrimp Bento Box": BentoBox,
  "Scallop Bento Box": BeefBento,
  "Combo Bento Box": BeefBento,
};

type BadgeType = "popular" | "chef" | "new";

const BADGES: Record<string, BadgeType> = {
  "OMG Roll": "popular",
  "Dragon Roll": "popular",
  "Chicken Hibachi": "popular",
  "Beef Hibachi": "popular",
  "Spicy Tuna Roll": "popular",
  "California Roll": "popular",
  "Salmon Roll": "chef",
  "Shrimp Tempura Roll": "chef",
  "Sweet Heart Roll": "chef",
  "Kani Salad": "chef",
  "Shrimp Hibachi": "popular",
  "Combo Hibachi": "popular",
};

const BADGE_STYLES: Record<BadgeType, { label: string; className: string }> = {
  popular: {
    label: "🔥 Popular",
    className: "bg-primary/90 text-white",
  },
  chef: {
    label: "👨‍🍳 Chef's Pick",
    className: "bg-secondary/90 text-secondary-foreground",
  },
  new: {
    label: "✨ New",
    className: "bg-emerald-600/90 text-white",
  },
};

export function MenuItemCard({ item, showAdd = true }: { item: MenuItem; showAdd?: boolean }) {
  const { addItem } = useCart();
  const { brandShort } = useTenant();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);

  const matchedImage = item.imageUrl || IMAGE_MAP[item.name];
  const badge = BADGES[item.name];
  const badgeStyle = badge ? BADGE_STYLES[badge] : null;

  const handleAdd = () => {
    addItem(item, quantity, instructions || undefined);
    setIsDialogOpen(false);
    toast({
      title: "Added to cart",
      description: `${quantity}× ${item.name} added to your order.`,
    });
    setInstructions("");
    setQuantity(1);
  };

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 flex flex-col h-full group">
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted relative flex items-center justify-center">
          {matchedImage ? (
            <img
              src={matchedImage}
              alt={item.name}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-secondary/10 flex items-center justify-center">
              <span className="font-serif text-3xl text-primary/20 uppercase tracking-widest px-4 text-center">
                {brandShort}
              </span>
            </div>
          )}

          {badgeStyle && (
            <div className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${badgeStyle.className}`}>
              {badgeStyle.label}
            </div>
          )}

          {!item.available && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
              <span className="bg-destructive text-white px-4 py-2 font-bold tracking-wider rounded-md transform -rotate-12 border-2 border-white/20">
                SOLD OUT
              </span>
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col flex-1">
          <div className="flex justify-between items-start mb-2 gap-3">
            <h3 className="font-serif text-lg font-medium leading-tight text-foreground">{item.name}</h3>
            <span className="font-bold text-primary whitespace-nowrap">${item.price.toFixed(2)}</span>
          </div>

          <p className="text-muted-foreground text-sm flex-1 mb-5 line-clamp-3">
            {item.description || "A delicious traditional favorite prepared fresh."}
          </p>

          {showAdd && (
            <Button
              className="w-full font-semibold gap-2 border-border text-foreground hover:border-primary hover:text-primary transition-colors"
              onClick={() => setIsDialogOpen(true)}
              disabled={!item.available}
              variant="outline"
            >
              <Plus className="h-4 w-4" /> Add to Order
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">{item.name}</DialogTitle>
            <DialogDescription>
              ${item.price.toFixed(2)} {item.description ? `· ${item.description}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</Button>
                <span className="w-8 text-center text-lg font-bold text-foreground">{quantity}</span>
                <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}>+</Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Special Instructions (Optional)</label>
              <Textarea
                placeholder="e.g. No spicy mayo, extra ginger..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="resize-none bg-background border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90 text-white" onClick={handleAdd}>
              Add to Cart · ${(item.price * quantity).toFixed(2)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
