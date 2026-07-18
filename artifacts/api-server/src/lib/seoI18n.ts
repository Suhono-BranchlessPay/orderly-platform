import type { SeoLocale } from "./seoLocales";

/** Curated storefront SEO chrome — not machine dumps of whole menus. */
export type SeoChrome = {
  home: string;
  menu: string;
  orderOnline: string;
  fullMenu: string;
  orderPickup: string;
  related: string;
  viewMenu: string;
  mapDirections: string;
  restaurantLocation: string;
  popularFrom: string;
  menuH1: (cuisine: string, city: string, brand: string) => string;
  menuLead: (brand: string, city: string) => string;
  tagH1: (tag: string, city: string, brand: string) => string;
  tagLead: (tag: string, brand: string, city: string, samples: string) => string;
  tagOrderHeading: (tag: string, brand: string) => string;
  placeH1: (cuisine: string, place: string, brand: string) => string;
  placeLead: (
    cuisine: string,
    place: string,
    brand: string,
    miles: string,
  ) => string;
  deliveryAvailable: (miles: string) => string;
  pickupOnly: (place: string, miles: string) => string;
  thinTag: string;
  outsideArea: string;
};

const en: SeoChrome = {
  home: "Home",
  menu: "Menu",
  orderOnline: "Order online",
  fullMenu: "Full menu",
  orderPickup: "Order for pickup",
  related: "Related",
  viewMenu: "View menu",
  mapDirections: "Map & directions",
  restaurantLocation: "Restaurant location",
  popularFrom: "Popular from",
  menuH1: (cuisine, city, brand) =>
    city
      ? `Best ${cuisine} in ${city} | ${brand} | ${cuisine} near me`
      : `${brand} Menu | Order ${cuisine} Online`,
  menuLead: (brand, city) =>
    `Order online from ${brand}${city ? ` in ${city}` : ""}. Browse the full menu — fresh from our kitchen, no marketplace markups.`,
  tagH1: (tag, city, brand) =>
    city
      ? `Best ${tag} in ${city} | ${brand} | ${tag} near me`
      : `Best ${tag} | ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `Order ${tag.toLowerCase()} for pickup from ${brand}${city ? ` in ${city}` : ""}. Popular choices include ${samples}. Fresh from our kitchen — no marketplace markups.`,
  tagOrderHeading: (tag, brand) => `Order ${tag} from ${brand}`,
  placeH1: (cuisine, place, brand) =>
    `Best ${cuisine} in ${place} | ${brand} | ${cuisine} near me`,
  placeLead: (cuisine, place, brand, miles) =>
    `Order ${cuisine.toLowerCase()} near ${place} from ${brand}. About ${miles} miles away.`,
  deliveryAvailable: (miles) =>
    `Delivery available within our service area (~${miles} miles from the restaurant).`,
  pickupOnly: (place, miles) =>
    `Pickup available — about ${miles} miles from ${place}.`,
  thinTag: "This dish page needs at least 3 matching menu items.",
  outsideArea: "We only publish place pages inside our real service area.",
};

const es: SeoChrome = {
  home: "Inicio",
  menu: "Menú",
  orderOnline: "Pedir en línea",
  fullMenu: "Menú completo",
  orderPickup: "Pedir para llevar",
  related: "Relacionados",
  viewMenu: "Ver menú",
  mapDirections: "Mapa y direcciones",
  restaurantLocation: "Ubicación del restaurante",
  popularFrom: "Populares de",
  menuH1: (cuisine, city, brand) =>
    city
      ? `El mejor ${cuisine} en ${city} | ${brand} | ${cuisine} cerca de mí`
      : `Menú de ${brand} | Pedir ${cuisine} en línea`,
  menuLead: (brand, city) =>
    `Pide en línea en ${brand}${city ? ` en ${city}` : ""}. Explora el menú completo — fresco de nuestra cocina, sin comisiones de apps de delivery.`,
  tagH1: (tag, city, brand) =>
    city
      ? `El mejor ${tag} en ${city} | ${brand} | ${tag} cerca de mí`
      : `El mejor ${tag} | ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `Pide ${tag.toLowerCase()} para llevar en ${brand}${city ? ` en ${city}` : ""}. Opciones populares: ${samples}. Fresco de nuestra cocina — sin comisiones de apps de delivery.`,
  tagOrderHeading: (tag, brand) => `Pide ${tag} en ${brand}`,
  placeH1: (cuisine, place, brand) =>
    `${cuisine} para llevar y a domicilio en ${place} | ${brand}`,
  placeLead: (cuisine, place, brand, miles) =>
    `Pide ${cuisine.toLowerCase()} cerca de ${place} en ${brand}. A unas ${miles} millas del restaurante.`,
  deliveryAvailable: (miles) =>
    `Entrega disponible en nuestra zona de servicio (unas ${miles} millas del restaurante).`,
  pickupOnly: (place, miles) =>
    `Disponible para llevar — unas ${miles} millas desde ${place}.`,
  thinTag: "Esta página necesita al menos 3 platos del menú.",
  outsideArea: "Solo publicamos páginas de zonas dentro de nuestro radio real de servicio.",
};

const zh: SeoChrome = {
  home: "首页",
  menu: "菜单",
  orderOnline: "在线点餐",
  fullMenu: "完整菜单",
  orderPickup: "自取点餐",
  related: "相关",
  viewMenu: "查看菜单",
  mapDirections: "地图与路线",
  restaurantLocation: "餐厅地址",
  popularFrom: "热门推荐",
  menuH1: (cuisine, city, brand) =>
    city ? `${city}最佳${cuisine} — ${brand}菜单` : `${brand}菜单`,
  menuLead: (brand, city) =>
    `在${brand}${city ? `（${city}）` : ""}在线点餐。浏览完整菜单，厨房直达，无平台加价。`,
  tagH1: (tag, city, brand) =>
    city ? `${city}${tag} — ${brand}` : `${tag} — ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `在${brand}${city ? `（${city}）` : ""}在线预订${tag}自取。人气选择：${samples}。厨房直达，无外卖平台加价。`,
  tagOrderHeading: (tag, brand) => `在${brand}点${tag}`,
  placeH1: (cuisine, place, brand) =>
    `${place}${cuisine}外送与自取 — ${brand}`,
  placeLead: (cuisine, place, brand, miles) =>
    `在${place}附近向${brand}点${cuisine}。距离约${miles}英里。`,
  deliveryAvailable: (miles) =>
    `配送范围内（距餐厅约${miles}英里）。`,
  pickupOnly: (place, miles) =>
    `可自取 — 距${place}约${miles}英里。`,
  thinTag: "此菜品页至少需要3道匹配菜单。",
  outsideArea: "我们仅发布服务半径内的地区页面。",
};

const vi: SeoChrome = {
  home: "Trang chủ",
  menu: "Thực đơn",
  orderOnline: "Đặt online",
  fullMenu: "Toàn bộ thực đơn",
  orderPickup: "Đặt mang đi",
  related: "Liên quan",
  viewMenu: "Xem thực đơn",
  mapDirections: "Bản đồ & đường đi",
  restaurantLocation: "Địa chỉ nhà hàng",
  popularFrom: "Món nổi bật từ",
  menuH1: (cuisine, city, brand) =>
    city ? `${cuisine} ngon nhất tại ${city} — ${brand}` : `Thực đơn ${brand}`,
  menuLead: (brand, city) =>
    `Đặt online tại ${brand}${city ? ` ở ${city}` : ""}. Xem toàn bộ thực đơn — trực tiếp từ bếp, không phụ phí sàn.`,
  tagH1: (tag, city, brand) =>
    city ? `${tag} tại ${city} — ${brand}` : `${tag} — ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `Đặt ${tag.toLowerCase()} mang đi tại ${brand}${city ? ` ở ${city}` : ""}. Gợi ý: ${samples}. Trực tiếp từ bếp — không phụ phí sàn.`,
  tagOrderHeading: (tag, brand) => `Đặt ${tag} tại ${brand}`,
  placeH1: (cuisine, place, brand) =>
    `${cuisine} giao hàng & mang đi tại ${place} — ${brand}`,
  placeLead: (cuisine, place, brand, miles) =>
    `Đặt ${cuisine.toLowerCase()} gần ${place} tại ${brand}. Cách khoảng ${miles} dặm.`,
  deliveryAvailable: (miles) =>
    `Có giao hàng trong khu vực phục vụ (~${miles} dặm từ nhà hàng).`,
  pickupOnly: (place, miles) =>
    `Có mang đi — khoảng ${miles} dặm từ ${place}.`,
  thinTag: "Trang này cần ít nhất 3 món khớp trên thực đơn.",
  outsideArea: "Chúng tôi chỉ tạo trang cho khu vực trong bán kính phục vụ.",
};

const id: SeoChrome = {
  home: "Beranda",
  menu: "Menu",
  orderOnline: "Pesan online",
  fullMenu: "Menu lengkap",
  orderPickup: "Pesan untuk diambil",
  related: "Terkait",
  viewMenu: "Lihat menu",
  mapDirections: "Peta & petunjuk arah",
  restaurantLocation: "Lokasi restoran",
  popularFrom: "Populer dari",
  menuH1: (cuisine, city, brand) =>
    city ? `${cuisine} terbaik di ${city} — ${brand}` : `Menu ${brand}`,
  menuLead: (brand, city) =>
    `Pesan online di ${brand}${city ? ` di ${city}` : ""}. Jelajahi menu lengkap — langsung dari dapur, tanpa markup marketplace.`,
  tagH1: (tag, city, brand) =>
    city ? `${tag} di ${city} — ${brand}` : `${tag} — ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `Pesan ${tag.toLowerCase()} untuk diambil di ${brand}${city ? ` di ${city}` : ""}. Pilihan populer: ${samples}. Langsung dari dapur — tanpa markup marketplace.`,
  tagOrderHeading: (tag, brand) => `Pesan ${tag} di ${brand}`,
  placeH1: (cuisine, place, brand) =>
    `${cuisine} delivery & ambil di tempat di ${place} — ${brand}`,
  placeLead: (cuisine, place, brand, miles) =>
    `Pesan ${cuisine.toLowerCase()} dekat ${place} di ${brand}. Sekitar ${miles} mil.`,
  deliveryAvailable: (miles) =>
    `Pengantaran tersedia dalam area layanan (~${miles} mil dari restoran).`,
  pickupOnly: (place, miles) =>
    `Bisa diambil — sekitar ${miles} mil dari ${place}.`,
  thinTag: "Halaman ini butuh minimal 3 item menu yang cocok.",
  outsideArea: "Kami hanya menampilkan halaman di dalam radius layanan.",
};

const ar: SeoChrome = {
  home: "الرئيسية",
  menu: "القائمة",
  orderOnline: "اطلب عبر الإنترنت",
  fullMenu: "القائمة الكاملة",
  orderPickup: "اطلب للاستلام",
  related: "ذات صلة",
  viewMenu: "عرض القائمة",
  mapDirections: "الخريطة والاتجاهات",
  restaurantLocation: "موقع المطعم",
  popularFrom: "الأشهر من",
  menuH1: (cuisine, city, brand) =>
    city ? `أفضل ${cuisine} في ${city} — ${brand}` : `قائمة ${brand}`,
  menuLead: (brand, city) =>
    `اطلب عبر الإنترنت من ${brand}${city ? ` في ${city}` : ""}. تصفح القائمة الكاملة — مباشرة من المطبخ، بدون عمولات المنصات.`,
  tagH1: (tag, city, brand) =>
    city ? `${tag} في ${city} — ${brand}` : `${tag} — ${brand}`,
  tagLead: (tag, brand, city, samples) =>
    `اطلب ${tag} للاستلام من ${brand}${city ? ` في ${city}` : ""}. اختيارات شائعة: ${samples}. مباشرة من مطبخنا — بدون عمولات المنصات.`,
  tagOrderHeading: (tag, brand) => `اطلب ${tag} من ${brand}`,
  placeH1: (cuisine, place, brand) =>
    `${cuisine} للتوصيل والاستلام في ${place} — ${brand}`,
  placeLead: (cuisine, place, brand, miles) =>
    `اطلب ${cuisine} قرب ${place} من ${brand}. على بعد حوالي ${miles} ميل.`,
  deliveryAvailable: (miles) =>
    `التوصيل متاح ضمن منطقة الخدمة (~${miles} ميل من المطعم).`,
  pickupOnly: (place, miles) =>
    `الاستلام متاح — حوالي ${miles} ميل من ${place}.`,
  thinTag: "تحتاج هذه الصفحة إلى 3 أطباق متطابقة على الأقل.",
  outsideArea: "ننشر فقط صفحات المناطق داخل نطاق خدمتنا الفعلي.",
};

/** Fallback locales reuse English chrome until native review packs land. */
const PACKS: Partial<Record<SeoLocale, SeoChrome>> = {
  en,
  es,
  zh,
  vi,
  id,
  ar,
  th: en,
  hi: en,
  fil: en,
  ne: en,
  my: en,
};

export function getSeoChrome(locale: SeoLocale): SeoChrome {
  return PACKS[locale] || en;
}
