/**
 * Blok 3.3 — Dashboard i18n dictionaries (vanilla JS).
 * Spec asked for react-i18next; this console is still a single HTML page, so
 * we use the same locale set + data-i18n keys. When the console moves to React,
 * migrate these strings into react-i18next JSON resources.
 *
 * Locales: en, zh, es, id, th, my, vi, hi, ne, fil, ar
 * th / my / ne / ar need native-speaker review before owner-facing production.
 */
(function (global) {
  const LOCALES = [
    { code: "en", label: "English", dir: "ltr", review: "ok" },
    { code: "zh", label: "中文", dir: "ltr", review: "ok" },
    { code: "es", label: "Español", dir: "ltr", review: "ok" },
    { code: "id", label: "Bahasa Indonesia", dir: "ltr", review: "ok" },
    { code: "th", label: "ไทย", dir: "ltr", review: "needs_native" },
    { code: "my", label: "မြန်မာ", dir: "ltr", review: "needs_native" },
    { code: "vi", label: "Tiếng Việt", dir: "ltr", review: "ok" },
    { code: "hi", label: "हिन्दी", dir: "ltr", review: "ok" },
    { code: "ne", label: "नेपाली", dir: "ltr", review: "needs_native" },
    { code: "fil", label: "Filipino", dir: "ltr", review: "ok" },
    { code: "ar", label: "العربية", dir: "rtl", review: "needs_native" },
  ];

  const en = {
    "gate.title": "Orderly Foods Console",
    "gate.subtitle": "Platform staff only — not a restaurant owner tool.",
    "gate.email": "Work email",
    "gate.password": "Password",
    "gate.signin": "Sign in",
    "gate.fine": "Private tool. Unauthorized access is prohibited.",
    "top.signout": "Sign out",
    "toolbar.range": "Range",
    "toolbar.tenant": "Tenant",
    "toolbar.all_tenants": "All tenants",
    "toolbar.refresh": "Refresh",
    "toolbar.export": "Export CSV",
    "range.today": "Today",
    "range.7d": "Last 7 days",
    "range.28d": "Last 28 days",
    "range.30d": "Last 30 days",
    "panel.live_orders": "Live orders",
    "panel.live_badge": "Kitchen board",
    "panel.anchors": "Anchor verification",
    "panel.anchors_badge": "On-chain",
    "panel.top_items": "Top items",
    "panel.by_category": "By category",
    "panel.by_hour": "Orders by hour",
    "panel.by_day": "Orders by day",
    "panel.payments": "Payments & tips",
    "panel.payments_badge": "Honest",
    "panel.anchor_health": "Anchor health",
    "panel.anchor_health_badge": "Moat",
    "panel.qr": "QR scans",
    "panel.qr_badge": "Flyer",
    "panel.customers": "Customer intelligence",
    "panel.customers_badge": "Insight only",
    "panel.social": "Social inbox (trial)",
    "panel.social_badge": "Human approve only",
    "panel.gbp": "Google reviews (trial)",
    "panel.gbp_badge": "Human approve only",
    "panel.support": "Support assistant",
    "panel.support_badge": "KB only",
    "support.hint":
      "Answers only from the knowledge base. Low confidence escalates to a human — never invents money or health advice.",
    "support.ask": "Ask a question",
    "support.send": "Ask",
    "support.escalate": "Escalate to human",
    "support.kb": "Knowledge base",
    "support.escalations": "Open escalations",
    "support.placeholder": "e.g. How do I change the menu?",
    "soon.title": "Coming soon (honest — not invented)",
    "lang.label": "Language",
    "lang.review_banner":
      "Some translations (Thai / Myanmar / Nepali / Arabic) need native-speaker review before relying on them with owners.",
  };

  /** Shallow copy + overrides helper */
  function pack(overrides) {
    return Object.assign({}, en, overrides);
  }

  const dict = {
    en,
    id: pack({
      "gate.title": "Konsol Orderly Foods",
      "gate.subtitle": "Khusus staf platform — bukan tool pemilik resto.",
      "gate.email": "Email kerja",
      "gate.password": "Kata sandi",
      "gate.signin": "Masuk",
      "gate.fine": "Tool privat. Akses tanpa izin dilarang.",
      "top.signout": "Keluar",
      "toolbar.range": "Rentang",
      "toolbar.tenant": "Tenant",
      "toolbar.all_tenants": "Semua tenant",
      "toolbar.refresh": "Muat ulang",
      "toolbar.export": "Ekspor CSV",
      "range.today": "Hari ini",
      "range.7d": "7 hari terakhir",
      "range.28d": "28 hari terakhir",
      "range.30d": "30 hari terakhir",
      "panel.live_orders": "Pesanan live",
      "panel.live_badge": "Dapur",
      "panel.anchors": "Verifikasi Anchor",
      "panel.anchors_badge": "On-chain",
      "panel.top_items": "Item teratas",
      "panel.by_category": "Per kategori",
      "panel.by_hour": "Pesanan per jam",
      "panel.by_day": "Pesanan per hari",
      "panel.payments": "Pembayaran & tip",
      "panel.payments_badge": "Jujur",
      "panel.anchor_health": "Kesehatan Anchor",
      "panel.anchor_health_badge": "Moat",
      "panel.qr": "Scan QR",
      "panel.qr_badge": "Flyer",
      "panel.customers": "Intel pelanggan",
      "panel.customers_badge": "Insight saja",
      "panel.social": "Inbox sosial (uji coba)",
      "panel.social_badge": "Setujui manusia",
      "panel.gbp": "Ulasan Google (uji coba)",
      "panel.gbp_badge": "Setujui manusia",
      "panel.support": "Asisten dukungan",
      "panel.support_badge": "Hanya KB",
      "support.hint":
        "Jawaban hanya dari knowledge base. Keyakinan rendah → eskalasi ke manusia — tidak mengarang angka uang atau saran kesehatan.",
      "support.ask": "Ajukan pertanyaan",
      "support.send": "Tanya",
      "support.escalate": "Eskalasi ke manusia",
      "support.kb": "Knowledge base",
      "support.escalations": "Eskalasi terbuka",
      "support.placeholder": "mis. Bagaimana cara ubah menu?",
      "soon.title": "Segera hadir (jujur — tidak dikarang)",
      "lang.label": "Bahasa",
      "lang.review_banner":
        "Beberapa terjemahan (Thai / Myanmar / Nepal / Arab) perlu review penutur asli sebelum dipakai pemilik.",
    }),
    es: pack({
      "gate.title": "Consola Orderly Foods",
      "gate.subtitle": "Solo personal de plataforma — no es herramienta del dueño.",
      "gate.email": "Correo de trabajo",
      "gate.password": "Contraseña",
      "gate.signin": "Iniciar sesión",
      "gate.fine": "Herramienta privada. Acceso no autorizado prohibido.",
      "top.signout": "Cerrar sesión",
      "toolbar.range": "Rango",
      "toolbar.tenant": "Tenant",
      "toolbar.all_tenants": "Todos los tenants",
      "toolbar.refresh": "Actualizar",
      "toolbar.export": "Exportar CSV",
      "range.today": "Hoy",
      "range.7d": "Últimos 7 días",
      "range.28d": "Últimos 28 días",
      "range.30d": "Últimos 30 días",
      "panel.live_orders": "Pedidos en vivo",
      "panel.live_badge": "Cocina",
      "panel.anchors": "Verificación Anchor",
      "panel.top_items": "Artículos top",
      "panel.by_category": "Por categoría",
      "panel.by_hour": "Pedidos por hora",
      "panel.by_day": "Pedidos por día",
      "panel.payments": "Pagos y propinas",
      "panel.anchor_health": "Salud de Anchor",
      "panel.qr": "Escaneos QR",
      "panel.customers": "Inteligencia de clientes",
      "panel.social": "Bandeja social (prueba)",
      "panel.social_badge": "Aprobación humana",
      "panel.support": "Asistente de soporte",
      "panel.support_badge": "Solo KB",
      "support.hint":
        "Responde solo desde la base de conocimiento. Baja confianza → escala a un humano.",
      "support.ask": "Haz una pregunta",
      "support.send": "Preguntar",
      "support.escalate": "Escalar a humano",
      "support.kb": "Base de conocimiento",
      "support.escalations": "Escalaciones abiertas",
      "support.placeholder": "p. ej. ¿Cómo cambio el menú?",
      "soon.title": "Próximamente (honesto — no inventado)",
      "lang.label": "Idioma",
      "lang.review_banner":
        "Algunas traducciones (tailandés / birmano / nepalí / árabe) necesitan revisión de hablantes nativos.",
    }),
    zh: pack({
      "gate.title": "Orderly Foods 控制台",
      "gate.subtitle": "仅限平台员工 — 不是餐厅老板工具。",
      "gate.email": "工作邮箱",
      "gate.password": "密码",
      "gate.signin": "登录",
      "gate.fine": "内部工具。禁止未经授权访问。",
      "top.signout": "退出",
      "toolbar.range": "时间范围",
      "toolbar.tenant": "租户",
      "toolbar.all_tenants": "全部租户",
      "toolbar.refresh": "刷新",
      "toolbar.export": "导出 CSV",
      "range.today": "今天",
      "range.7d": "最近 7 天",
      "range.28d": "最近 28 天",
      "range.30d": "最近 30 天",
      "panel.live_orders": "实时订单",
      "panel.live_badge": "厨房看板",
      "panel.anchors": "Anchor 验证",
      "panel.top_items": "热销菜品",
      "panel.by_category": "按分类",
      "panel.by_hour": "按小时订单",
      "panel.by_day": "按天订单",
      "panel.payments": "支付与小费",
      "panel.anchor_health": "Anchor 健康度",
      "panel.qr": "二维码扫描",
      "panel.customers": "客户洞察",
      "panel.social": "社交收件箱（试用）",
      "panel.social_badge": "需人工批准",
      "panel.support": "支持助手",
      "panel.support_badge": "仅知识库",
      "support.hint": "仅根据知识库回答。置信度低会转人工 — 不会编造金额或健康建议。",
      "support.ask": "提问",
      "support.send": "提问",
      "support.escalate": "转人工",
      "support.kb": "知识库",
      "support.escalations": "待处理升级",
      "support.placeholder": "例如：如何修改菜单？",
      "soon.title": "即将推出（如实 — 不编造）",
      "lang.label": "语言",
      "lang.review_banner": "部分翻译（泰语/缅甸语/尼泊尔语/阿拉伯语）需母语者审校后再给业主使用。",
    }),
    vi: pack({
      "gate.title": "Bảng điều khiển Orderly Foods",
      "gate.subtitle": "Chỉ dành cho nhân viên nền tảng.",
      "gate.email": "Email công việc",
      "gate.password": "Mật khẩu",
      "gate.signin": "Đăng nhập",
      "top.signout": "Đăng xuất",
      "toolbar.range": "Khoảng thời gian",
      "toolbar.tenant": "Tenant",
      "toolbar.all_tenants": "Tất cả tenant",
      "toolbar.refresh": "Làm mới",
      "toolbar.export": "Xuất CSV",
      "panel.live_orders": "Đơn đang chạy",
      "panel.support": "Trợ lý hỗ trợ",
      "support.send": "Hỏi",
      "support.escalate": "Chuyển người",
      "lang.label": "Ngôn ngữ",
    }),
    hi: pack({
      "gate.title": "Orderly Foods कंसोल",
      "gate.subtitle": "केवल प्लेटफ़ॉर्म स्टाफ़ के लिए।",
      "gate.email": "कार्य ईमेल",
      "gate.password": "पासवर्ड",
      "gate.signin": "साइन इन",
      "top.signout": "साइन आउट",
      "toolbar.refresh": "रिफ़्रेश",
      "panel.live_orders": "लाइव ऑर्डर",
      "panel.support": "सहायता सहायक",
      "support.send": "पूछें",
      "support.escalate": "मनुष्य को भेजें",
      "lang.label": "भाषा",
    }),
    fil: pack({
      "gate.title": "Orderly Foods Console",
      "gate.subtitle": "Para sa platform staff lang — hindi tool ng may-ari.",
      "gate.email": "Work email",
      "gate.password": "Password",
      "gate.signin": "Mag-sign in",
      "top.signout": "Mag-sign out",
      "toolbar.refresh": "I-refresh",
      "panel.live_orders": "Mga live order",
      "panel.support": "Support assistant",
      "support.send": "Magtanong",
      "support.escalate": "I-escalate sa tao",
      "lang.label": "Wika",
    }),
    th: pack({
      "gate.title": "คอนโซล Orderly Foods",
      "gate.subtitle": "สำหรับพนักงานแพลตฟอร์มเท่านั้น",
      "gate.signin": "เข้าสู่ระบบ",
      "top.signout": "ออกจากระบบ",
      "toolbar.refresh": "รีเฟรช",
      "panel.live_orders": "ออเดอร์สด",
      "panel.support": "ผู้ช่วยสนับสนุน",
      "support.send": "ถาม",
      "support.escalate": "ส่งต่อเจ้าหน้าที่",
      "lang.label": "ภาษา",
      "lang.review_banner": "คำแปลภาษาไทยควรให้เจ้าของภาษาตรวจก่อนใช้งานจริง",
    }),
    my: pack({
      "gate.title": "Orderly Foods Console",
      "gate.signin": "ဝင်ရန်",
      "top.signout": "ထွက်ရန်",
      "toolbar.refresh": "ပြန်လည်စတင်",
      "panel.support": "အကူအညီ",
      "support.send": "မေးရန်",
      "lang.label": "ဘာသာစကား",
      "lang.review_banner": "မြန်မာဘာသာပြန်ကို မူရင်းစကားပြောသူ စစ်ဆေးရန် လိုအပ်သည်။",
    }),
    ne: pack({
      "gate.title": "Orderly Foods कन्सोल",
      "gate.signin": "साइन इन",
      "top.signout": "साइन आउट",
      "panel.support": "सहायता सहायक",
      "support.send": "सोध्नुहोस्",
      "lang.label": "भाषा",
      "lang.review_banner": "नेपाली अनुवाद मूलभाषी समीक्षा आवश्यक छ।",
    }),
    ar: pack({
      "gate.title": "لوحة Orderly Foods",
      "gate.subtitle": "لموظفي المنصة فقط — ليست أداة لصاحب المطعم.",
      "gate.email": "البريد الوظيفي",
      "gate.password": "كلمة المرور",
      "gate.signin": "تسجيل الدخول",
      "top.signout": "تسجيل الخروج",
      "toolbar.range": "النطاق",
      "toolbar.tenant": "المستأجر",
      "toolbar.refresh": "تحديث",
      "toolbar.export": "تصدير CSV",
      "panel.live_orders": "الطلبات المباشرة",
      "panel.support": "مساعد الدعم",
      "panel.support_badge": "قاعدة المعرفة فقط",
      "support.hint": "الإجابات من قاعدة المعرفة فقط. الثقة المنخفضة تُحوَّل إلى بشر.",
      "support.send": "اسأل",
      "support.escalate": "تصعيد لإنسان",
      "support.kb": "قاعدة المعرفة",
      "lang.label": "اللغة",
      "lang.review_banner": "ترجمة العربية تحتاج مراجعة متحدث أصلي قبل الاعتماد مع الملاك.",
    }),
  };

  const STORAGE_KEY = "orderly_dashboard_locale";

  function detect() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && dict[saved]) return saved;
    } catch (_) {}
    const nav = (navigator.language || "en").toLowerCase();
    const short = nav.split("-")[0];
    const map = { tl: "fil", fil: "fil", ms: "my", bur: "my", cmn: "zh" };
    const code = map[short] || short;
    if (dict[code]) return code;
    return "en";
  }

  let current = detect();

  function t(key) {
    const pack = dict[current] || en;
    return pack[key] || en[key] || key;
  }

  function setLocale(code) {
    if (!dict[code]) code = "en";
    current = code;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (_) {}
    apply();
  }

  function apply() {
    const meta = LOCALES.find((l) => l.code === current) || LOCALES[0];
    document.documentElement.lang = current;
    document.documentElement.dir = meta.dir;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key));
    });
    const banner = document.getElementById("i18nReviewBanner");
    if (banner) {
      const needs = meta.review === "needs_native";
      banner.style.display = needs ? "block" : "none";
      if (needs) banner.textContent = t("lang.review_banner");
    }
    const sel = document.getElementById("localeSelect");
    if (sel && sel.value !== current) sel.value = current;
  }

  function fillSelect(sel) {
    if (!sel) return;
    sel.innerHTML = LOCALES.map(
      (l) =>
        '<option value="' +
        l.code +
        '">' +
        l.label +
        (l.review === "needs_native" ? " *" : "") +
        "</option>",
    ).join("");
    sel.value = current;
  }

  global.OrderlyI18n = {
    LOCALES,
    t,
    setLocale,
    apply,
    fillSelect,
    getLocale: () => current,
  };
})(window);
