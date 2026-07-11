/**
 * Bundled Samurai-only food photos. Never import these for other tenants.
 */
import SlideOMG from "@assets/OMG_Roll_1783446966481.jpeg";
import SlideSushi from "@assets/Samurai_Sushi_Platter_FB_1783446966479.jpg";
import SlideSweet from "@assets/Sweat_Heard_1783446966481.jpeg";
import SlideBeefBento from "@assets/beef_bento_1783446966482.jpeg";
import SlideBento from "@assets/BentoBox_1783446966476.jpeg";
import BeefBentoStory from "@assets/beef_bento_1783478990267.jpeg";
import MenuBrochure from "@assets/WhatsApp_Image_2026-06-10_at_4.03.55_PM_(2)_1783446468726.jpeg";
// Same flyer as catering page (one asset; avoids duplicate WhatsApp hashes on VPS)
import CateringBrochure from "@assets/WhatsApp_Image_2026-07-07_at_1.10.07_PM_1783444228285.jpeg";

export const SAMURAI_HERO_IMAGES = [
  { src: SlideOMG, alt: "OMG Roll — Chef's Signature", pos: "object-center" },
  { src: SlideSushi, alt: "Sushi Platter", pos: "object-center" },
  { src: SlideSweet, alt: "Sweet Heart Roll", pos: "object-center" },
  { src: SlideBeefBento, alt: "Beef Bento Box", pos: "object-top" },
  { src: SlideBento, alt: "Chicken Bento Box", pos: "object-top" },
];

export const SAMURAI_STORY_IMAGE = BeefBentoStory;

export const SAMURAI_REVIEWS = [
  {
    name: "Britney M.",
    initials: "BM",
    source: "Google",
    text: "The food was amazing!!! The service was just as good. Drinks never got empty. They spoke to us as if they had known us forever. This is definitely our new favorite spot!",
  },
  {
    name: "Winston C.",
    initials: "WC",
    source: "Google",
    text: "The sushi was fresher than wet paint! You've got to try this spot out. The hibachi is absolutely incredible!",
  },
  {
    name: "Jeremy B.",
    initials: "JB",
    source: "Facebook",
    text: "Tried a bunch of things: the OMG Roll is amazing. Hibachi chicken was perfectly seasoned. The staff was so friendly. Will definitely be back!",
  },
  {
    name: "Amanda L.",
    initials: "AL",
    source: "Google",
    text: "Best sushi in town by far! The rolls are creative and incredibly fresh. My family comes here every weekend now.",
  },
  {
    name: "Mike T.",
    initials: "MT",
    source: "Facebook",
    text: "The hibachi grill experience is top notch. Our chef was entertaining and the food was phenomenal. Prices are very reasonable!",
  },
  {
    name: "Sarah K.",
    initials: "SK",
    source: "Google",
    text: "Went here for my birthday and it exceeded all expectations. The Dragon Roll and Beef Hibachi are must-orders!",
  },
];

export const SAMURAI_BROCHURES = [
  {
    title: "Full Menu",
    subtitle: "Hibachi • Sushi • Bento • Drinks",
    description:
      "Complete menu with all rolls, hibachi, bento boxes, appetizers, and drinks with prices.",
    src: MenuBrochure,
    filename: "Menu.jpg",
  },
  {
    title: "Party Trays & Catering",
    subtitle: "Perfect for any occasion",
    description:
      "Hibachi trays, sushi trays, event packages (Silver/Gold/Platinum), office lunch, and add-ons.",
    src: CateringBrochure,
    filename: "Catering-Menu.jpg",
  },
];
