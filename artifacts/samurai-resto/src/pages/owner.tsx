import { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, ShoppingBag, Clock, RefreshCw, LogOut, Wifi, WifiOff, DollarSign, Users, CheckCircle2, ChefHat, Download, Mail, Phone, Building2, UserCheck, ImagePlus, ImageOff, Search, Pencil, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { IMAGE_MAP } from "@/components/MenuItemCard";
import { useTenant } from "@/lib/tenant";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  orderType: string;
  total: number;
  status: string;
  paymentTiming?: string;
  paymentStatus?: string;
  createdAt: string;
  subtotal: number;
  tax: number;
}

interface IntegrationsStatus {
  square: { configured: boolean; webPayments: boolean; environment: string };
  doordash: { configured: boolean };
  branchlesspay: { configured: boolean };
  owner: { configured: boolean };
}

interface Stats {
  todayCount: number;
  todaySales: number;
  avgTicket: number;
  todayOrders: Order[];
  recentOrders: Order[];
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
}

interface MenuItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  imageUrl: string | null;
  available: boolean;
  featured: boolean;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending:    { label: "Pending",    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  preparing:  { label: "Preparing", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  ready:      { label: "Ready",     className: "bg-green-500/20 text-green-400 border-green-500/30" },
  completed:  { label: "Done",      className: "bg-muted text-muted-foreground border-border" },
  cancelled:  { label: "Cancelled", className: "bg-red-500/20 text-red-400 border-red-500/30" },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ══ PIN Screen ══ */
function PinScreen({ onSuccess }: { onSuccess: (pin: string) => void }) {
  const { brandName } = useTenant();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/owner/stats?pin=${encodeURIComponent(pin)}`);
      if (res.ok) { onSuccess(pin); }
      else { setError("Wrong PIN. Try again."); setPin(""); }
    } catch {
      setError("Cannot connect to server.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ChefHat className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-serif text-3xl text-foreground">Owner Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">{brandName}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && check()}
              placeholder="Enter owner PIN"
              className="w-full h-12 bg-background border border-border rounded-lg px-4 text-foreground text-center text-xl tracking-widest focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            {error && <p className="text-destructive text-sm mt-2 text-center">{error}</p>}
          </div>
          <Button onClick={check} disabled={loading || pin.length < 4} className="w-full h-12 bg-primary hover:bg-primary/90 text-white">
            {loading ? "Checking…" : "Enter Dashboard"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Lupa PIN? Hubungi admin sistem untuk reset.
        </p>
      </div>
    </div>
  );
}

/* ══ Menu Manager (photo upload + edit details) ══ */
interface MenuCategory {
  id: string;
  name: string;
}

function EditMenuItemForm({
  item, categories, pin, onSaved, onCancel,
}: {
  item: MenuItem;
  categories: MenuCategory[];
  pin: string;
  onSaved: (updated: MenuItem) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName]               = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice]             = useState(String(item.price));
  const [category, setCategory]       = useState(item.category);
  const [available, setAvailable]     = useState(item.available);
  const [featured, setFeatured]       = useState(item.featured);
  const [saving, setSaving]           = useState(false);

  const handleSave = async () => {
    const parsedPrice = parseFloat(price);
    if (!name.trim()) {
      toast({ title: "Nama tidak boleh kosong", variant: "destructive" });
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toast({ title: "Harga tidak valid", description: "Masukkan angka harga yang benar.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/owner/menu/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          name: name.trim(),
          description: description.trim() || null,
          price: parsedPrice,
          category,
          available,
          featured,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal menyimpan perubahan");
      }
      const updated = await res.json();
      onSaved(updated);
      toast({ title: "Perubahan tersimpan", description: `"${updated.name}" berhasil diperbarui.` });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: err instanceof Error ? err.message : "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-4 bg-background/60 border-t border-border space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Nama Menu</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Harga (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Deskripsi</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          placeholder="Deskripsi menu (opsional)"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Kategori</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-5 h-9">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} className="accent-primary" />
            Tersedia
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} className="accent-primary" />
            Menu Unggulan
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-white">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="h-8 text-xs">
          Batal
        </Button>
      </div>
    </div>
  );
}

function MenuItemRow({
  item, categories, pin, onUpdated,
}: {
  item: MenuItem;
  categories: MenuCategory[];
  pin: string;
  onUpdated: (updated: MenuItem) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing]     = useState(false);

  const preview = item.imageUrl || IMAGE_MAP[item.name];
  const previewSrc = item.imageUrl
    ? (item.imageUrl.startsWith("http") ? item.imageUrl : `${API_BASE}${item.imageUrl}`)
    : preview;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "File tidak valid", description: "Pilih file gambar (JPG, PNG, atau WEBP).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File terlalu besar", description: "Maksimal ukuran foto 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API_BASE}/api/owner/menu/items/${item.id}/image?pin=${encodeURIComponent(pin)}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload gagal");
      }
      const updated = await res.json();
      onUpdated(updated);
      toast({ title: "Foto tersimpan", description: `Foto untuk "${item.name}" berhasil diperbarui.` });
    } catch (err) {
      toast({ title: "Gagal upload", description: err instanceof Error ? err.message : "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="px-6 py-3 flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
          {previewSrc ? (
            <img src={previewSrc} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.category} · ${item.price.toFixed(2)}
            {!item.available && <span className="text-destructive"> · Tidak tersedia</span>}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 h-8 text-xs font-semibold shrink-0"
        >
          {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {uploading ? "Mengupload…" : item.imageUrl ? "Ganti Foto" : "Upload Foto"}
        </Button>
        <Button
          size="sm"
          variant={editing ? "secondary" : "outline"}
          onClick={() => setEditing(v => !v)}
          className="gap-1.5 h-8 text-xs font-semibold shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          {editing ? "Tutup" : "Edit"}
        </Button>
      </div>
      {editing && (
        <EditMenuItemForm
          item={item}
          categories={categories}
          pin={pin}
          onCancel={() => setEditing(false)}
          onSaved={updated => { onUpdated(updated); setEditing(false); }}
        />
      )}
    </div>
  );
}

function MenuManager({ pin }: { pin: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes] = await Promise.all([
        fetch(`${API_BASE}/api/menu/items`),
        fetch(`${API_BASE}/api/menu/categories`),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const missingCount = items.filter(i => !i.imageUrl && !IMAGE_MAP[i.name]).length;

  const filtered = items
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()))
    .filter(i => !onlyMissing || (!i.imageUrl && !IMAGE_MAP[i.name]));

  const handleUpdated = (updated: MenuItem) => {
    setItems(prev => prev.map(i => (i.id === updated.id ? { ...i, ...updated } : i)));
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap">
        <ImagePlus className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-xl text-foreground">Kelola Menu</h2>
        <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
          {items.length} item
        </span>
        {missingCount > 0 && (
          <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold px-2.5 py-1 rounded-full">
            {missingCount} belum ada foto
          </span>
        )}
      </div>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama menu atau kategori…"
            className="w-full h-9 bg-background border border-border rounded-lg pl-9 pr-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="accent-primary" />
          Hanya yang belum ada foto
        </label>
      </div>

      {loading ? (
        <div className="py-10 text-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-muted-foreground text-sm">Tidak ada menu yang cocok.</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[560px] overflow-y-auto">
          {filtered.map(item => (
            <MenuItemRow key={item.id} item={item} categories={categories} pin={pin} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ══ Ganti PIN ══ */
function ChangePinCard({ onPinChanged }: { onPinChanged: (newPin: string) => void }) {
  const { toast } = useToast();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin]         = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving]         = useState(false);

  const handleChangePin = async () => {
    if (!currentPin) {
      toast({ title: "Masukkan PIN saat ini", variant: "destructive" });
      return;
    }
    if (newPin.length < 4) {
      toast({ title: "PIN baru terlalu pendek", description: "Minimal 4 karakter.", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "Konfirmasi PIN tidak cocok", description: "PIN baru dan konfirmasi harus sama.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/owner/settings/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengganti PIN");
      }
      onPinChanged(newPin);
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
      toast({ title: "PIN berhasil diganti", description: "Gunakan PIN baru untuk login berikutnya." });
    } catch (err) {
      toast({ title: "Gagal mengganti PIN", description: err instanceof Error ? err.message : "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-xl text-foreground">Ganti PIN Owner</h2>
      </div>
      <div className="px-6 py-4 grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">PIN Saat Ini</label>
          <input
            type="password"
            value={currentPin}
            onChange={e => setCurrentPin(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">PIN Baru</label>
          <input
            type="password"
            value={newPin}
            onChange={e => setNewPin(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Konfirmasi PIN Baru</label>
          <input
            type="password"
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value)}
            className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="px-6 pb-5 flex items-center gap-2">
        <Button size="sm" onClick={handleChangePin} disabled={saving} className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-white gap-1.5">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
          {saving ? "Menyimpan…" : "Ganti PIN"}
        </Button>
        <p className="text-xs text-muted-foreground">Berlaku langsung setelah disimpan — kamu tidak perlu logout.</p>
      </div>
    </div>
  );
}

/* ══ Dashboard ══ */
function Dashboard({ pin, onLogout, onPinChanged }: { pin: string; onLogout: () => void; onPinChanged: (newPin: string) => void }) {
  const { tenant } = useTenant();
  const tenantSlug = tenant?.tenantId ?? "tenant";
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [updatingId, setUpdatingId]   = useState<string | null>(null);

  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [custLoading, setCustLoading]     = useState(false);
  const [custExpanded, setCustExpanded]   = useState(false);
  const [exporting, setExporting]         = useState(false);
  const [integrations, setIntegrations]   = useState<IntegrationsStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, intRes] = await Promise.all([
        fetch(`${API_BASE}/api/owner/stats?pin=${encodeURIComponent(pin)}`),
        fetch(`${API_BASE}/api/owner/integrations?pin=${encodeURIComponent(pin)}`),
      ]);
      if (statsRes.ok) { setStats(await statsRes.json()); setLastRefresh(new Date()); }
      if (intRes.ok) { setIntegrations(await intRes.json()); }
    } finally { setLoading(false); }
  }, [pin]);

  const loadCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/owner/customers?pin=${encodeURIComponent(pin)}`);
      if (res.ok) { const data = await res.json(); setCustomers(data.customers ?? []); }
    } finally { setCustLoading(false); }
  }, [pin]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/owner/customers/export?pin=${encodeURIComponent(pin)}`);
      if (!res.ok) return;
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      const filename = `${tenantSlug}-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  useEffect(() => { load(); loadCustomers(); }, [load, loadCustomers]);

  /* Auto-refresh every 30s */
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const updateStatus = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    try {
      await fetch(`${API_BASE}/api/owner/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, status }),
      });
      await load();
    } finally { setUpdatingId(null); }
  };

  const nextStatus: Record<string, string> = {
    pending: "preparing", preparing: "ready", ready: "completed",
  };

  const todayOrders  = stats?.todayOrders  ?? [];
  const recentOrders = stats?.recentOrders ?? [];

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="bg-accent border-b border-border px-4 py-4 sticky top-0 z-40">
        <div className="container mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl text-accent-foreground">📊 Owner Dashboard</h1>
            <p className="text-xs text-accent-foreground/50">
              Updated {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={load} disabled={loading} className="text-accent-foreground/60 hover:text-accent-foreground">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-accent-foreground/60 hover:text-accent-foreground gap-1.5">
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 mt-8 space-y-8">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: <DollarSign className="h-5 w-5" />,
              label: "Today's Sales",
              value: `$${(stats?.todaySales ?? 0).toFixed(2)}`,
              color: "text-green-400",
              bg: "bg-green-500/10",
            },
            {
              icon: <ShoppingBag className="h-5 w-5" />,
              label: "Today's Orders",
              value: String(stats?.todayCount ?? 0),
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: <TrendingUp className="h-5 w-5" />,
              label: "Avg. Ticket",
              value: `$${(stats?.avgTicket ?? 0).toFixed(2)}`,
              color: "text-secondary",
              bg: "bg-secondary/10",
            },
            {
              icon: <Users className="h-5 w-5" />,
              label: "Active Orders",
              value: String(todayOrders.filter(o => o.status === "pending" || o.status === "preparing").length),
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-2xl p-5">
              <div className={`${card.bg} ${card.color} w-9 h-9 rounded-xl flex items-center justify-center mb-3`}>
                {card.icon}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
              <p className={`font-serif text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── Connection Status ── */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-serif text-lg text-foreground mb-4">Integration Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                name: "Square POS",
                ok: integrations?.square.configured ?? false,
                note: integrations?.square.configured
                  ? `Connected · ${integrations.square.environment}${integrations.square.webPayments ? " · Web Pay" : ""}`
                  : "Set SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID",
              },
              {
                name: "DoorDash",
                ok: integrations?.doordash.configured ?? false,
                note: integrations?.doordash.configured ? "Connected" : "Set DOORDASH_* env vars",
              },
              {
                name: "BP Audit",
                ok: integrations?.branchlesspay.configured ?? false,
                note: integrations?.branchlesspay.configured ? "Connected" : "Set BP_* env vars",
              },
            ].map(int => (
              <div key={int.name} className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                {int.ok
                  ? <Wifi className="h-4 w-4 text-green-500" />
                  : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-semibold text-foreground">{int.name}</p>
                  <p className="text-xs text-muted-foreground">{int.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Today's Order Queue ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl text-foreground">Today's Orders</h2>
            <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
              {todayOrders.length} orders
            </span>
          </div>

          {todayOrders.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground">No orders today yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Orders will appear here as they come in.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todayOrders.map(order => {
                const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                const next = nextStatus[order.status];
                return (
                  <div key={order.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold text-foreground">#{order.id.substring(0, 6).toUpperCase()}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusStyle.className}`}>
                          {statusStyle.label}
                        </span>
                        {order.paymentStatus === "paid" ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-green-500/10 text-green-500 border-green-500/30">Paid</span>
                        ) : order.paymentStatus === "unpaid" ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/30">Unpaid</span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">{fmtTime(order.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground font-medium truncate">{order.customerName}</p>
                      <p className="text-xs text-muted-foreground">{order.customerPhone} · {order.orderType === "pickup" ? "🥡 Pickup" : "🛵 Delivery"}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-primary text-lg">${order.total.toFixed(2)}</span>
                      {next && (
                        <Button
                          size="sm"
                          onClick={() => updateStatus(order.id, next)}
                          disabled={updatingId === order.id}
                          className="bg-primary/10 hover:bg-primary hover:text-white text-primary border border-primary/30 text-xs h-8"
                        >
                          {updatingId === order.id ? "…" : `→ ${STATUS_STYLES[next]?.label}`}
                        </Button>
                      )}
                      {order.status === "completed" && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recent Orders (all time) ── */}
        {recentOrders.length > todayOrders.length && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h2 className="font-serif text-xl text-foreground">Recent Orders</h2>
            </div>
            <div className="divide-y divide-border">
              {recentOrders.filter(o => !todayOrders.find(t => t.id === o.id)).slice(0, 10).map(order => {
                const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                return (
                  <div key={order.id} className="px-6 py-3 flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground min-w-[4.5rem]">#{order.id.substring(0, 6).toUpperCase()}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusStyle.className}`}>{statusStyle.label}</span>
                    <span className="text-sm text-foreground font-medium flex-1 truncate">{order.customerName}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(order.createdAt)}</span>
                    <span className="font-semibold text-foreground">${order.total.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Menu Manager ── */}
        <MenuManager pin={pin} />

        {/* ── Ganti PIN ── */}
        <ChangePinCard onPinChanged={onPinChanged} />

        {/* ── Customer Database ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap">
            <UserCheck className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl text-foreground">Customer Database</h2>
            <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
              {customers.length} registered
            </span>
            <Button
              onClick={handleExport}
              disabled={exporting || customers.length === 0}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8 text-xs font-semibold"
            >
              {exporting
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </Button>
          </div>

          {/* Summary cards */}
          <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-border">
            {[
              {
                label: "Total Registered",
                value: customers.length,
                icon: <Users className="h-4 w-4" />,
                color: "text-primary", bg: "bg-primary/10",
              },
              {
                label: "Cities Covered",
                value: new Set(customers.map(c => c.city.trim().toLowerCase())).size || 0,
                icon: <Building2 className="h-4 w-4" />,
                color: "text-secondary", bg: "bg-secondary/10",
              },
              {
                label: "Repeat Customers",
                value: customers.filter(c => c.totalOrders > 1).length,
                icon: <CheckCircle2 className="h-4 w-4" />,
                color: "text-green-400", bg: "bg-green-500/10",
              },
            ].map(card => (
              <div key={card.label} className="text-center">
                <div className={`${card.bg} ${card.color} w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2`}>
                  {card.icon}
                </div>
                <p className={`font-serif text-xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Customer list */}
          {custLoading ? (
            <div className="py-10 text-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></div>
          ) : customers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground text-sm">No registered customers yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Customers who sign up via "My Account" will appear here.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {(custExpanded ? customers : customers.slice(0, 8)).map(c => (
                  <div key={c.id} className="px-6 py-3 flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />{c.phone}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[160px]">
                          <Mail className="h-3 w-3" />{c.email}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />{c.city}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">${c.totalSpent.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{c.totalOrders} order{c.totalOrders !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
              {customers.length > 8 && (
                <div className="px-6 py-3 border-t border-border">
                  <button
                    onClick={() => setCustExpanded(v => !v)}
                    className="text-xs text-primary hover:underline underline-offset-2 font-semibold"
                  >
                    {custExpanded ? "Show less ↑" : `Show all ${customers.length} customers ↓`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

/* ══ Page ══ */
export default function OwnerPage() {
  const stored = sessionStorage.getItem("ownerPin");
  const [pin, setPin] = useState<string | null>(stored);

  const handleLogin  = (p: string) => { sessionStorage.setItem("ownerPin", p); setPin(p); };
  const handleLogout = () => { sessionStorage.removeItem("ownerPin"); setPin(null); };
  const handlePinChanged = (newPin: string) => { sessionStorage.setItem("ownerPin", newPin); setPin(newPin); };

  if (!pin) return <PinScreen onSuccess={handleLogin} />;
  return <Dashboard pin={pin} onLogout={handleLogout} onPinChanged={handlePinChanged} />;
}
