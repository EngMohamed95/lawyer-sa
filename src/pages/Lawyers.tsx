import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, KeyRound, Eye, EyeOff, AtSign, Ban, Briefcase, Building2, Search, Users, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, firebaseConfig } from "../lib/firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { apiUrl } from "../lib/apiBase";

const PLANS = [
  { id: "BASIC",        name: "الأساسية",     price: "200 ج.م",  color: "bg-gray-100 text-gray-700" },
  { id: "PROFESSIONAL", name: "الاحترافية",   price: "500 ج.م",  color: "bg-purple-100 text-purple-700" },
  { id: "PREMIUM",      name: "الشركات",      price: "1000 ج.م", color: "bg-amber-100 text-amber-700" },
];

function getDaysRemaining(expiry?: string): number | null {
  if (!expiry) return null;
  const diff = new Date(expiry).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function SubscriptionBadge({ expiry, billing }: { expiry?: string; billing?: string }) {
  const days = getDaysRemaining(expiry);

  if (days === null) {
    return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><XCircle size={12} /> غير محدد</span>;
  }
  if (days <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">
        <XCircle size={12} /> منتهي
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-50 text-red-500 px-2 py-1 rounded-full">
        <AlertTriangle size={12} /> {days} أيام فقط!
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-yellow-50 text-yellow-600 px-2 py-1 rounded-full">
        <Clock size={12} /> {days} يوم
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-50 text-green-600 px-2 py-1 rounded-full">
      <CheckCircle size={12} /> {days} يوم
    </span>
  );
}

type LawyerFilter = "ALL" | "ACTIVE" | "DISABLED" | "EXPIRING" | "EXPIRED";

const FILTERS: { id: LawyerFilter; label: string; icon: React.ReactNode; on: string; off: string }[] = [
  { id: "ALL",      label: "الكل",          icon: null,                     on: "border-[#273c75] bg-[#273c75] text-white",  off: "border-slate-200 text-slate-600 hover:bg-slate-50" },
  { id: "ACTIVE",   label: "نشط فقط",       icon: <CheckCircle size={13} />, on: "border-emerald-600 bg-emerald-600 text-white", off: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
  { id: "DISABLED", label: "معطل فقط",      icon: <Ban size={13} />,         on: "border-red-600 bg-red-600 text-white",         off: "border-red-200 text-red-600 hover:bg-red-50" },
  { id: "EXPIRING", label: "قارب الانتهاء", icon: <Clock size={13} />,       on: "border-amber-500 bg-amber-500 text-white",     off: "border-amber-200 text-amber-700 hover:bg-amber-50" },
  { id: "EXPIRED",  label: "اشتراك منتهي",  icon: <XCircle size={13} />,     on: "border-slate-600 bg-slate-600 text-white",     off: "border-slate-200 text-slate-600 hover:bg-slate-50" },
];

function matchesFilter(l: any, f: LawyerFilter): boolean {
  const days = getDaysRemaining(l.subscriptionExpiry);
  if (f === "ACTIVE") return l.status !== "DISABLED";
  if (f === "DISABLED") return l.status === "DISABLED";
  if (f === "EXPIRING") return days !== null && days > 0 && days <= 7;
  if (f === "EXPIRED") return days !== null && days <= 0;
  return true;
}

/** أدوار فريق المكتب — تُحسب في عمود «الفريق» */
const NON_TEAM_ROLES = new Set(["LAWYER", "SUPER_ADMIN", "CLIENT"]);

export default function Lawyers() {
  const [lawyers, setLawyers]             = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLawyer, setEditingLawyer] = useState<any>(null);
  const [renewLawyer, setRenewLawyer]     = useState<any>(null);
  const [credLawyer, setCredLawyer]       = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [renewMonths, setRenewMonths]     = useState(1);
  const [credForm, setCredForm]           = useState({ email: "", password: "" });
  const [showPass, setShowPass]           = useState(false);
  const [credLoading, setCredLoading]     = useState(false);
  const [sortBy, setSortBy]               = useState<"expiry" | "name">("expiry");
  const [search, setSearch]               = useState("");
  const [filter, setFilter]               = useState<LawyerFilter>("ALL");
  const [statusBusyId, setStatusBusyId]   = useState<string | null>(null);
  // حجم نشاط كل مكتب: العملاء والقضايا وأعضاء الفريق
  const [counts, setCounts]               = useState<Record<string, { clients: number; cases: number; team: number }>>({});

  const [newLawyer, setNewLawyer] = useState({
    name: "", email: "", password: "", phone: "", officeName: "",
    plan: "BASIC", billing: "monthly",
  });

  const fetchLawyers = async () => {
    setLoading(true);
    try {
      const [usersSnap, casesSnap, clientsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "cases")).catch(() => null),
        getDocs(collection(db, "clients")).catch(() => null),
      ]);
      const next: Record<string, { clients: number; cases: number; team: number }> = {};
      const bump = (id: unknown, key: "clients" | "cases" | "team") => {
        if (typeof id !== "string" || !id) return;
        next[id] = next[id] || { clients: 0, cases: 0, team: 0 };
        next[id][key]++;
      };
      const all = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      all.forEach(u => { if (!NON_TEAM_ROLES.has(u.role)) bump(u.lawyerId, "team"); });
      casesSnap?.docs.forEach(d => bump(d.data().lawyerId, "cases"));
      clientsSnap?.docs.forEach(d => bump(d.data().lawyerId, "clients"));
      setCounts(next);
      setLawyers(all.filter(u => u.role === "LAWYER"));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLawyers(); }, []);

  // Sort lawyers
  const sorted = [...lawyers].sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    const da = getDaysRemaining(a.subscriptionExpiry) ?? 99999;
    const db_ = getDaysRemaining(b.subscriptionExpiry) ?? 99999;
    return da - db_;
  });

  // البحث والتصفية
  const q = search.trim().toLowerCase();
  const visible = sorted.filter(l => matchesFilter(l, filter) && (!q ||
    [l.name, l.officeName, l.email, l.phone].some(v => String(v || "").toLowerCase().includes(q))));

  // الإحصاءات
  const disabledCount = lawyers.filter(l => l.status === "DISABLED").length;
  const activeCount   = lawyers.length - disabledCount;
  const totalCases    = lawyers.reduce((s, l) => s + (counts[l.id]?.cases || 0), 0);

  /** تفعيل/تعطيل الحساب — المكتب المعطّل لا يستطيع مالكه ولا فريقه تسجيل الدخول */
  const toggleStatus = async (lawyer: any) => {
    const disabling = lawyer.status !== "DISABLED";
    if (disabling && !confirm(`تعطيل حساب «${lawyer.officeName || lawyer.name}»؟ لن يتمكن المحامي ولا فريق مكتبه من تسجيل الدخول حتى إعادة التفعيل.`)) return;
    setStatusBusyId(lawyer.id);
    try {
      const status = disabling ? "DISABLED" : "ACTIVE";
      await updateDoc(doc(db, "users", lawyer.id), { status });
      setLawyers(prev => prev.map(l => (l.id === lawyer.id ? { ...l, status } : l)));
    } catch (err: any) { alert("خطأ: " + err.message); }
    finally { setStatusBusyId(null); }
  };

  const handleAddLawyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const secondaryApp  = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const cred          = await createUserWithEmailAndPassword(secondaryAuth, newLawyer.email, newLawyer.password);
      const uid           = cred.user.uid;

      const months = newLawyer.billing === "annual" ? 12 : 1;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);

      await setDoc(doc(db, "users", uid), {
        name:                 newLawyer.name,
        email:                newLawyer.email,
        phone:                newLawyer.phone,
        officeName:           newLawyer.officeName,
        plan:                 newLawyer.plan,
        role:                 "LAWYER",
        status:               "ACTIVE",
        subscriptionBilling:  newLawyer.billing,
        subscriptionExpiry:   expiry.toISOString(),
        createdAt:            new Date().toISOString(),
      });

      await deleteApp(secondaryApp);
      setIsAddModalOpen(false);
      setNewLawyer({ name: "", email: "", password: "", phone: "", officeName: "", plan: "BASIC", billing: "monthly" });
      fetchLawyers();
      alert(`✅ تم إنشاء الحساب. الاشتراك يمتد حتى ${expiry.toLocaleDateString("ar-EG")}`);
    } catch (err: any) {
      alert("خطأ: " + err.message);
    } finally { setActionLoading(false); }
  };

  const handleUpdateLawyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "users", editingLawyer.id), {
        name:       editingLawyer.name,
        phone:      editingLawyer.phone,
        officeName: editingLawyer.officeName,
        plan:       editingLawyer.plan,
        status:     editingLawyer.status,
      });
      setEditingLawyer(null);
      fetchLawyers();
    } catch (err: any) { alert("خطأ: " + err.message); }
    finally { setActionLoading(false); }
  };

  const handleRenew = async () => {
    if (!renewLawyer) return;
    setActionLoading(true);
    try {
      const current = renewLawyer.subscriptionExpiry
        ? new Date(Math.max(Date.now(), new Date(renewLawyer.subscriptionExpiry).getTime()))
        : new Date();
      current.setMonth(current.getMonth() + renewMonths);

      await updateDoc(doc(db, "users", renewLawyer.id), {
        subscriptionExpiry:  current.toISOString(),
        subscriptionBilling: renewMonths >= 12 ? "annual" : "monthly",
      });

      setRenewLawyer(null);
      setRenewMonths(1);
      fetchLawyers();
      alert(`✅ تم تجديد الاشتراك حتى ${current.toLocaleDateString("ar-EG")}`);
    } catch (err: any) { alert("خطأ: " + err.message); }
    finally { setActionLoading(false); }
  };

  const handleChangeCredentials = async () => {
    if (!credLawyer) return;
    if (!credForm.email && !credForm.password) {
      alert("أدخل الإيميل الجديد أو كلمة المرور الجديدة على الأقل");
      return;
    }
    if (credForm.password && credForm.password.length < 6) {
      alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setCredLoading(true);
    const errors: string[] = [];
    try {
      if (credForm.password) {
        const res = await fetch(apiUrl(`/api/users/${credLawyer.id}/password`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: credForm.password }),
        });
        if (!res.ok) {
          const d = await res.json();
          errors.push("كلمة المرور: " + (d.error || "فشل"));
        }
      }
      if (credForm.email) {
        const res = await fetch(apiUrl(`/api/users/${credLawyer.id}/email`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: credForm.email }),
        });
        if (!res.ok) {
          const d = await res.json();
          errors.push("الإيميل: " + (d.error || "فشل"));
        }
      }
      if (errors.length > 0) {
        alert("حدث خطأ:\n" + errors.join("\n"));
      } else {
        alert("✅ تم التحديث بنجاح");
        setCredLawyer(null);
        setCredForm({ email: "", password: "" });
        fetchLawyers();
      }
    } catch {
      alert("تعذر الاتصال بالخادم");
    } finally {
      setCredLoading(false);
    }
  };

  const handleDeleteLawyer = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المحامي؟")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      fetchLawyers();
    } catch (err: any) { alert("خطأ: " + err.message); }
  };

  return (
    <div className="space-y-6 font-['Tajawal'] text-[#192a56]" dir="rtl">

      {/* الترويسة */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-l from-[#192a56] to-[#273c75] p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10"><Building2 size={26} /></span>
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">سجل المحامين والمكاتب المشتركة</h1>
            <p className="mt-1 text-sm text-white/70">استعرض جميع حسابات المكاتب المسجلة في المنصة، تابع حجم نشاطها واشتراكاتها، وفعّل أو أوقف الحسابات.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={fetchLawyers} disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#192a56] transition hover:bg-blue-50 disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث البيانات
          </button>
          <button type="button" onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20">
            <Plus size={16} /> إضافة مشترك جديد
          </button>
        </div>
      </div>

      {/* البطاقات */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "إجمالي المشتركين", value: lawyers.length, icon: <Users size={22} />, iconClass: "bg-indigo-100/70 text-indigo-600" },
          { title: "الحسابات النشطة", value: activeCount, icon: <CheckCircle size={22} />, iconClass: "bg-emerald-100/70 text-emerald-600" },
          { title: "الحسابات المعطلة", value: disabledCount, icon: <Ban size={22} />, iconClass: "bg-red-100/70 text-red-600" },
          { title: "إجمالي القضايا المسجلة", value: totalCases, icon: <Briefcase size={22} />, iconClass: "bg-cyan-100/70 text-cyan-600" },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-md transition-all hover:shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-400">{c.title}</p>
                <p className="text-3xl font-bold tracking-tight">{c.value.toLocaleString("en-US")}</p>
              </div>
              <span className={`flex shrink-0 items-center justify-center rounded-2xl p-3.5 ${c.iconClass}`}>{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* البحث والتصفية */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-md lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="bg-slate-50 pr-9"
            placeholder="ابحث باسم المحامي، المكتب، البريد الإلكتروني، أو رقم الهاتف..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const count = lawyers.filter((l) => matchesFilter(l, f.id)).length;
            const on = filter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${on ? f.on : f.off}`}>
                {f.icon} {f.label} ({count})
              </button>
            );
          })}
          <span className="mx-1 hidden h-6 w-px bg-slate-200 lg:block" />
          <button type="button" onClick={() => setSortBy(sortBy === "expiry" ? "name" : "expiry")}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <ArrowUpDown size={13} /> {sortBy === "expiry" ? "الترتيب: أقرب انتهاء" : "الترتيب: الاسم"}
          </button>
        </div>
      </div>

      {/* الجدول */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#192a56]">المحامي</TableHead>
                <TableHead className="text-right font-bold text-[#192a56]">الباقة / الاشتراك</TableHead>
                <TableHead className="text-right font-bold text-[#192a56] hidden md:table-cell">بيانات التواصل</TableHead>
                <TableHead className="text-center font-bold text-[#192a56] hidden lg:table-cell">العملاء</TableHead>
                <TableHead className="text-center font-bold text-[#192a56] hidden lg:table-cell">القضايا</TableHead>
                <TableHead className="text-center font-bold text-[#192a56] hidden lg:table-cell">الفريق</TableHead>
                <TableHead className="text-right font-bold text-[#192a56]">المتبقي</TableHead>
                <TableHead className="text-center font-bold text-[#192a56]">حالة الحساب</TableHead>
                <TableHead className="text-center font-bold text-[#192a56]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">جاري التحميل...</TableCell></TableRow>
              ) : visible.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">{lawyers.length ? "لا توجد نتائج مطابقة" : "لا يوجد مشتركين"}</TableCell></TableRow>
              ) : visible.map(lawyer => {
                const days     = getDaysRemaining(lawyer.subscriptionExpiry);
                const planInfo = PLANS.find(p => p.id === lawyer.plan);
                const disabled = lawyer.status === "DISABLED";
                const c        = counts[lawyer.id] || { clients: 0, cases: 0, team: 0 };
                return (
                  <TableRow key={lawyer.id} className={`hover:bg-slate-50 transition-colors ${disabled ? "bg-slate-50/70" : days !== null && days <= 0 ? "bg-red-50/40" : ""}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#273c75] text-sm font-black text-white">
                          {(lawyer.name || "?").charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#192a56]">{lawyer.name || "—"}</p>
                          <p className="truncate text-xs text-slate-500">{lawyer.officeName || "بدون اسم مكتب"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={planInfo?.color || "bg-gray-100 text-gray-600"}>{planInfo?.name || "غير محدد"}</Badge>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {lawyer.subscriptionBilling === "annual" ? "سنوي" : lawyer.subscriptionBilling === "monthly" ? "شهري" : "—"}
                        {lawyer.subscriptionExpiry ? ` • ينتهي ${new Date(lawyer.subscriptionExpiry).toLocaleDateString("ar-EG-u-nu-latn")}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm text-[#192a56]" dir="ltr" style={{ textAlign: "right" }}>{lawyer.email || "—"}</p>
                      <p className="text-xs text-slate-400" dir="ltr" style={{ textAlign: "right" }}>{lawyer.phone || "بدون هاتف"}</p>
                    </TableCell>
                    {[c.clients, c.cases, c.team].map((n, i) => (
                      <TableCell key={i} className="hidden text-center lg:table-cell">
                        <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold tabular-nums ${["border-blue-200 text-blue-700", "border-amber-200 text-amber-700", "border-emerald-200 text-emerald-700"][i]}`}>{n}</span>
                      </TableCell>
                    ))}
                    <TableCell>
                      <SubscriptionBadge expiry={lawyer.subscriptionExpiry} billing={lawyer.subscriptionBilling} />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${disabled ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                        {disabled ? <Ban size={12} /> : <CheckCircle size={12} />} {disabled ? "معطل" : "نشط"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button onClick={() => toggleStatus(lawyer)} disabled={statusBusyId === lawyer.id}
                          className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${disabled ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
                          {disabled ? <CheckCircle size={12} /> : <Ban size={12} />} {disabled ? "تفعيل" : "تعطيل"}
                        </button>
                        <button onClick={() => { setRenewLawyer(lawyer); setRenewMonths(lawyer.subscriptionBilling === "annual" ? 12 : 1); }}
                          className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
                          <RefreshCw size={12} /> تجديد
                        </button>
                        <button onClick={() => { setCredLawyer(lawyer); setCredForm({ email: "", password: "" }); setShowPass(false); }} title="بيانات الدخول"
                          className="flex items-center gap-1 border border-slate-200 text-[#273c75] hover:bg-slate-50 text-xs font-bold px-2.5 py-1.5 rounded-xl transition">
                          <KeyRound size={12} />
                        </button>
                        <button onClick={() => setEditingLawyer(lawyer)} title="تعديل"
                          className="flex items-center gap-1 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold px-2.5 py-1.5 rounded-xl transition">
                          <Edit size={12} />
                        </button>
                        <button onClick={() => handleDeleteLawyer(lawyer.id)} title="حذف"
                          className="flex items-center gap-1 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-bold px-2.5 py-1.5 rounded-xl transition">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ========== RENEW MODAL ========== */}
      {renewLawyer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8">
            <h2 className="text-xl font-black text-[#192a56] mb-2">تجديد الاشتراك</h2>
            <p className="text-sm text-gray-500 mb-6">
              المحامي: <strong>{renewLawyer.name}</strong> — الباقة: <strong>{PLANS.find(p => p.id === renewLawyer.plan)?.name}</strong>
            </p>

            {renewLawyer.subscriptionExpiry && (
              <div className={`rounded-2xl p-4 mb-6 text-sm font-bold ${
                (getDaysRemaining(renewLawyer.subscriptionExpiry) ?? 1) <= 0
                  ? "bg-red-50 text-red-600"
                  : "bg-yellow-50 text-yellow-700"
              }`}>
                <p>الاشتراك الحالي ينتهي: {new Date(renewLawyer.subscriptionExpiry).toLocaleDateString("ar-EG")}</p>
                <p className="font-normal text-xs mt-1">التجديد سيُضاف فوق التاريخ الحالي</p>
              </div>
            )}

            <div className="mb-6">
              <label className="text-sm font-bold text-gray-700 block mb-3">مدة التجديد</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { months: 1,  label: "شهر",    price: renewLawyer.plan === "BASIC" ? 200 : renewLawyer.plan === "PROFESSIONAL" ? 500 : 1000 },
                  { months: 6,  label: "6 أشهر", price: renewLawyer.plan === "BASIC" ? 1200 : renewLawyer.plan === "PROFESSIONAL" ? 3000 : 6000 },
                  { months: 12, label: "سنة",    price: renewLawyer.plan === "BASIC" ? 2000 : renewLawyer.plan === "PROFESSIONAL" ? 5000 : 10000 },
                ].map(opt => (
                  <button key={opt.months} onClick={() => setRenewMonths(opt.months)}
                    className={`p-3 rounded-2xl border-2 text-center transition ${renewMonths === opt.months ? "border-[#273c75] bg-[#273c75]/10" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="font-black text-[#192a56] text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{opt.price.toLocaleString()} ج.م</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm">
              <p className="text-gray-600">سينتهي الاشتراك الجديد في:</p>
              <p className="font-black text-[#192a56] text-lg mt-1">
                {(() => {
                  const base = renewLawyer.subscriptionExpiry
                    ? new Date(Math.max(Date.now(), new Date(renewLawyer.subscriptionExpiry).getTime()))
                    : new Date();
                  base.setMonth(base.getMonth() + renewMonths);
                  return base.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
                })()}
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleRenew} disabled={actionLoading}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-black py-3 rounded-2xl transition">
                {actionLoading ? "جاري التجديد..." : "✅ تأكيد التجديد"}
              </button>
              <button onClick={() => setRenewLawyer(null)}
                className="px-6 bg-gray-100 text-gray-700 font-bold py-3 rounded-2xl hover:bg-gray-200 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== CHANGE CREDENTIALS MODAL ========== */}
      {credLawyer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#273c75] flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-[#192a56]">تغيير بيانات الدخول</h2>
                <p className="text-xs text-[#192a56]/70 mt-0.5">{credLawyer.name} — {credLawyer.email}</p>
              </div>
              <button onClick={() => setCredLawyer(null)} className="text-[#192a56]/60 hover:text-[#192a56] text-xl font-bold">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Email field */}
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <AtSign size={15} className="text-[#273c75]" /> البريد الإلكتروني الجديد
                </label>
                <input
                  type="email"
                  value={credForm.email}
                  onChange={e => setCredForm({ ...credForm, email: e.target.value })}
                  placeholder={credLawyer.email}
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-[#273c75] focus:ring-2 focus:ring-[#273c75]/20"
                />
                <p className="text-xs text-gray-400">اترك فارغاً لعدم التغيير</p>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <KeyRound size={15} className="text-[#273c75]" /> كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={credForm.password}
                    onChange={e => setCredForm({ ...credForm, password: e.target.value })}
                    placeholder="6 أحرف على الأقل"
                    className="w-full pr-4 pl-12 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-[#273c75] focus:ring-2 focus:ring-[#273c75]/20"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400">اترك فارغاً لعدم التغيير</p>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-700 font-bold">
                ⚠️ تغيير الإيميل سيؤثر على تسجيل دخول المستخدم — تأكد من إبلاغه بالبيانات الجديدة
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleChangeCredentials}
                  disabled={credLoading}
                  className="flex-1 bg-[#192a56] hover:bg-[#192a56]/90 text-[#273c75] font-black py-3 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
                >
                  {credLoading
                    ? <><span className="w-4 h-4 border-2 border-[#273c75]/30 border-t-[#273c75] rounded-full animate-spin" /> جاري التحديث...</>
                    : <><KeyRound size={15} /> حفظ التغييرات</>}
                </button>
                <button onClick={() => setCredLawyer(null)}
                  className="px-5 bg-gray-100 text-gray-700 font-bold py-3 rounded-2xl hover:bg-gray-200 transition text-sm">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADD MODAL ========== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#192a56] text-white flex justify-between items-center">
              <h2 className="text-lg font-black">إضافة مشترك جديد</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddLawyer} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-bold text-gray-600">اسم المحامي *</label>
                  <Input required value={newLawyer.name} onChange={e => setNewLawyer({ ...newLawyer, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">البريد الإلكتروني *</label>
                  <Input type="email" required value={newLawyer.email} onChange={e => setNewLawyer({ ...newLawyer, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">كلمة المرور *</label>
                  <Input type="password" required value={newLawyer.password} onChange={e => setNewLawyer({ ...newLawyer, password: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">اسم المكتب</label>
                  <Input value={newLawyer.officeName} onChange={e => setNewLawyer({ ...newLawyer, officeName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">رقم الهاتف</label>
                  <Input value={newLawyer.phone} onChange={e => setNewLawyer({ ...newLawyer, phone: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">الباقة</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLANS.map(p => (
                    <button type="button" key={p.id} onClick={() => setNewLawyer({ ...newLawyer, plan: p.id })}
                      className={`p-3 rounded-2xl border-2 text-center transition ${newLawyer.plan === p.id ? "border-[#273c75] bg-[#273c75]/10" : "border-gray-200"}`}>
                      <p className="font-bold text-[#192a56] text-xs">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.price}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">نوع الاشتراك</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: "monthly", label: "شهري",  sub: "يمتد شهر واحد" },
                    { val: "annual",  label: "سنوي",   sub: "يمتد 12 شهر" },
                  ].map(opt => (
                    <button type="button" key={opt.val} onClick={() => setNewLawyer({ ...newLawyer, billing: opt.val })}
                      className={`p-3 rounded-2xl border-2 text-center transition ${newLawyer.billing === opt.val ? "border-[#273c75] bg-[#273c75]/10" : "border-gray-200"}`}>
                      <p className="font-bold text-sm text-[#192a56]">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={actionLoading}
                className="w-full bg-[#192a56] text-[#273c75] font-black py-5 rounded-2xl">
                {actionLoading ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ========== EDIT MODAL ========== */}
      {editingLawyer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 bg-blue-600 text-white flex justify-between items-center">
              <h2 className="text-lg font-black">تعديل بيانات المشترك</h2>
              <button onClick={() => setEditingLawyer(null)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleUpdateLawyer} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">الاسم</label>
                <Input required value={editingLawyer.name} onChange={e => setEditingLawyer({ ...editingLawyer, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">الهاتف</label>
                  <Input value={editingLawyer.phone} onChange={e => setEditingLawyer({ ...editingLawyer, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600">المكتب</label>
                  <Input value={editingLawyer.officeName} onChange={e => setEditingLawyer({ ...editingLawyer, officeName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">الباقة</label>
                <SearchableSelect className="w-full p-2 border rounded-xl text-sm" value={editingLawyer.plan} onChange={e => setEditingLawyer({ ...editingLawyer, plan: e.target.value })}>
                  {PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">الحالة</label>
                <SearchableSelect className="w-full p-2 border rounded-xl text-sm" value={editingLawyer.status} onChange={e => setEditingLawyer({ ...editingLawyer, status: e.target.value })}>
                  <option value="ACTIVE">نشط</option>
                  <option value="DISABLED">معطل</option>
                </SearchableSelect>
              </div>
              <Button type="submit" disabled={actionLoading} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl">
                {actionLoading ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
