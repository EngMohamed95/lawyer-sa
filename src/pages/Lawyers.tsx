import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Calendar, AlertTriangle, CheckCircle, Clock, XCircle, KeyRound, Eye, EyeOff, AtSign } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { collection, getDocs, query, where, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, firebaseConfig } from "../lib/firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

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

  const [newLawyer, setNewLawyer] = useState({
    name: "", email: "", password: "", phone: "", officeName: "",
    plan: "BASIC", billing: "monthly",
  });

  const fetchLawyers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "LAWYER")));
      setLawyers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  // Summary stats
  const expired   = lawyers.filter(l => (getDaysRemaining(l.subscriptionExpiry) ?? 1) <= 0).length;
  const expiring  = lawyers.filter(l => { const d = getDaysRemaining(l.subscriptionExpiry); return d !== null && d > 0 && d <= 7; }).length;
  const active    = lawyers.filter(l => (getDaysRemaining(l.subscriptionExpiry) ?? 0) > 7).length;

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
        const res = await fetch(`/api/users/${credLawyer.id}/password`, {
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
        const res = await fetch(`/api/users/${credLawyer.id}/email`, {
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
    <div className="space-y-6 font-['Tajawal']" dir="rtl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0A192F]">إدارة المشتركين</h1>
          <p className="text-gray-500 mt-1 text-sm">متابعة الاشتراكات والتجديدات</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-[#D4AF37] px-6 py-5 rounded-2xl font-bold">
          <Plus className="ml-2 h-4 w-4" /> إضافة مشترك جديد
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-green-600">{active}</p>
          <p className="text-xs font-bold text-green-500 mt-1">اشتراك نشط</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-yellow-600">{expiring}</p>
          <p className="text-xs font-bold text-yellow-500 mt-1">قارب الانتهاء</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-red-600">{expired}</p>
          <p className="text-xs font-bold text-red-500 mt-1">اشتراك منتهي</p>
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 font-bold">ترتيب حسب:</span>
        <button onClick={() => setSortBy("expiry")}
          className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${sortBy === "expiry" ? "bg-[#0A192F] text-[#D4AF37]" : "bg-gray-100 text-gray-600"}`}>
          أقرب انتهاء
        </button>
        <button onClick={() => setSortBy("name")}
          className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${sortBy === "name" ? "bg-[#0A192F] text-[#D4AF37]" : "bg-gray-100 text-gray-600"}`}>
          الاسم
        </button>
        <button onClick={fetchLawyers} className="mr-auto flex items-center gap-1 text-sm text-gray-500 hover:text-[#0A192F]">
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {/* Table */}
      <Card className="shadow-sm border-gray-100">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#0A192F]">المحامي</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">الباقة</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">المتبقي</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">تاريخ الانتهاء</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden lg:table-cell">النوع</TableHead>
                <TableHead className="text-center font-bold text-[#0A192F]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-400">جاري التحميل...</TableCell></TableRow>
              ) : sorted.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-400">لا يوجد مشتركين</TableCell></TableRow>
              ) : sorted.map(lawyer => {
                const days     = getDaysRemaining(lawyer.subscriptionExpiry);
                const rowBg    = days !== null && days <= 0 ? "bg-red-50/50" : days !== null && days <= 7 ? "bg-orange-50/50" : "";
                const planInfo = PLANS.find(p => p.id === lawyer.plan);
                return (
                  <TableRow key={lawyer.id} className={`hover:bg-gray-50 transition-colors ${rowBg}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#0A192F] rounded-full flex items-center justify-center text-[#D4AF37] font-black text-sm">
                          {(lawyer.name || "?").charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-[#0A192F] text-sm">{lawyer.name}</p>
                          <p className="text-xs text-gray-400">{lawyer.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge className={planInfo?.color || "bg-gray-100 text-gray-600"}>
                        {planInfo?.name || "غير محدد"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <SubscriptionBadge expiry={lawyer.subscriptionExpiry} billing={lawyer.subscriptionBilling} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {lawyer.subscriptionExpiry ? (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar size={12} />
                          {new Date(lawyer.subscriptionExpiry).toLocaleDateString("ar-EG")}
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-gray-500">
                        {lawyer.subscriptionBilling === "annual" ? "سنوي" : lawyer.subscriptionBilling === "monthly" ? "شهري" : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button onClick={() => { setRenewLawyer(lawyer); setRenewMonths(lawyer.subscriptionBilling === "annual" ? 12 : 1); }}
                          className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
                          <RefreshCw size={12} /> تجديد
                        </button>
                        <button onClick={() => { setCredLawyer(lawyer); setCredForm({ email: "", password: "" }); setShowPass(false); }}
                          className="flex items-center gap-1 bg-[#D4AF37] hover:bg-[#B8962E] text-[#0A192F] text-xs font-bold px-3 py-1.5 rounded-xl transition">
                          <KeyRound size={12} /> بيانات الدخول
                        </button>
                        <button onClick={() => setEditingLawyer(lawyer)}
                          className="flex items-center gap-1 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold px-3 py-1.5 rounded-xl transition">
                          <Edit size={12} /> تعديل
                        </button>
                        <button onClick={() => handleDeleteLawyer(lawyer.id)}
                          className="flex items-center gap-1 border border-red-200 text-red-500 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ========== RENEW MODAL ========== */}
      {renewLawyer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8">
            <h2 className="text-xl font-black text-[#0A192F] mb-2">تجديد الاشتراك</h2>
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
                    className={`p-3 rounded-2xl border-2 text-center transition ${renewMonths === opt.months ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="font-black text-[#0A192F] text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{opt.price.toLocaleString()} ج.م</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm">
              <p className="text-gray-600">سينتهي الاشتراك الجديد في:</p>
              <p className="font-black text-[#0A192F] text-lg mt-1">
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
            <div className="p-5 bg-[#D4AF37] flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-[#0A192F]">تغيير بيانات الدخول</h2>
                <p className="text-xs text-[#0A192F]/70 mt-0.5">{credLawyer.name} — {credLawyer.email}</p>
              </div>
              <button onClick={() => setCredLawyer(null)} className="text-[#0A192F]/60 hover:text-[#0A192F] text-xl font-bold">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Email field */}
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <AtSign size={15} className="text-[#D4AF37]" /> البريد الإلكتروني الجديد
                </label>
                <input
                  type="email"
                  value={credForm.email}
                  onChange={e => setCredForm({ ...credForm, email: e.target.value })}
                  placeholder={credLawyer.email}
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
                />
                <p className="text-xs text-gray-400">اترك فارغاً لعدم التغيير</p>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <KeyRound size={15} className="text-[#D4AF37]" /> كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={credForm.password}
                    onChange={e => setCredForm({ ...credForm, password: e.target.value })}
                    placeholder="6 أحرف على الأقل"
                    className="w-full pr-4 pl-12 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
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
                  className="flex-1 bg-[#0A192F] hover:bg-[#0A192F]/90 text-[#D4AF37] font-black py-3 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
                >
                  {credLoading
                    ? <><span className="w-4 h-4 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" /> جاري التحديث...</>
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
            <div className="p-5 bg-[#0A192F] text-white flex justify-between items-center">
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
                      className={`p-3 rounded-2xl border-2 text-center transition ${newLawyer.plan === p.id ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-gray-200"}`}>
                      <p className="font-bold text-[#0A192F] text-xs">{p.name}</p>
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
                      className={`p-3 rounded-2xl border-2 text-center transition ${newLawyer.billing === opt.val ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-gray-200"}`}>
                      <p className="font-bold text-sm text-[#0A192F]">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={actionLoading}
                className="w-full bg-[#0A192F] text-[#D4AF37] font-black py-5 rounded-2xl">
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
                <select className="w-full p-2 border rounded-xl text-sm" value={editingLawyer.plan} onChange={e => setEditingLawyer({ ...editingLawyer, plan: e.target.value })}>
                  {PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600">الحالة</label>
                <select className="w-full p-2 border rounded-xl text-sm" value={editingLawyer.status} onChange={e => setEditingLawyer({ ...editingLawyer, status: e.target.value })}>
                  <option value="ACTIVE">نشط</option>
                  <option value="DISABLED">معطل</option>
                </select>
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
