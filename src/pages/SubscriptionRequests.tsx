import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Clock, RefreshCw, User, Phone, Mail, CreditCard, Loader2, X, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db } from "../lib/firebase";
import {
  collection, getDocs, doc, updateDoc, query, where, orderBy, limit
} from "firebase/firestore";

type Request = {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: string;
  planName: string;
  billing: "monthly" | "annual";
  amount: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  approvedAt?: string;
  linkedUserId?: string;
  subscriptionExpiry?: string;
};

function getDaysRemaining(expiry?: string): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ expiry }: { expiry?: string }) {
  const days = getDaysRemaining(expiry);
  if (days === null) return null;
  if (days <= 0)  return <span className="text-xs font-bold text-red-500">منتهي</span>;
  if (days <= 7)  return <span className="text-xs font-bold text-orange-500">⚠️ {days} أيام</span>;
  if (days <= 30) return <span className="text-xs font-bold text-yellow-600">🕐 {days} يوم</span>;
  return <span className="text-xs font-bold text-green-600">✅ {days} يوم</span>;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "قيد الانتظار", color: "bg-yellow-100 text-yellow-700", icon: <Clock size={14} /> },
  approved: { label: "تم التفعيل",   color: "bg-green-100 text-green-700",  icon: <CheckCircle2 size={14} /> },
  rejected: { label: "مرفوض",        color: "bg-red-100 text-red-700",      icon: <XCircle size={14} /> },
};

const PLAN_COLORS: Record<string, string> = {
  BASIC:        "bg-gray-100 text-gray-700",
  PROFESSIONAL: "bg-yellow-100 text-yellow-700",
  PREMIUM:      "bg-blue-100 text-blue-700",
};

export default function SubscriptionRequests() {
  const [requests, setRequests]       = useState<Request[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [approveModal, setApproveModal] = useState<Request | null>(null);
  const [approveEmail, setApproveEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "subscriptionRequests"), orderBy("createdAt", "desc"))
      );
      setRequests(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (err: any) {
      alert("فشل تحميل الطلبات: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async () => {
    if (!approveModal) return;
    setIsProcessing(true);
    try {
      const email = approveEmail.trim() || approveModal.email;

      // Find user by email
      const usersSnap = await getDocs(
        query(collection(db, "users"), where("email", "==", email), limit(1))
      );
      if (usersSnap.empty) throw new Error("المستخدم غير موجود في قاعدة البيانات — تأكد من الإيميل");

      const userRef  = usersSnap.docs[0].ref;
      const months   = approveModal.billing === "annual" ? 12 : 1;
      const expiry   = new Date();
      expiry.setMonth(expiry.getMonth() + months);

      await updateDoc(userRef, {
        plan:                 approveModal.plan,
        subscriptionExpiry:   expiry.toISOString(),
        subscriptionBilling:  approveModal.billing,
      });

      await updateDoc(doc(db, "subscriptionRequests", approveModal.id), {
        status:     "approved",
        approvedAt: new Date().toISOString(),
        linkedUserId: usersSnap.docs[0].id,
      });

      setRequests(prev => prev.map(r => r.id === approveModal.id ? { ...r, status: "approved" } : r));
      setApproveModal(null);
      setApproveEmail("");
      alert(`✅ تم تفعيل الاشتراك حتى: ${expiry.toLocaleDateString("ar-EG")}`);
    } catch (err: any) {
      alert("خطأ: " + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("هل تريد رفض هذا الطلب؟")) return;
    try {
      await updateDoc(doc(db, "subscriptionRequests", id), {
        status:     "rejected",
        rejectedAt: new Date().toISOString(),
      });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "rejected" } : r));
    } catch (err: any) {
      alert("فشل الرفض: " + err?.message);
    }
  };

  const filtered     = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="font-['Tajawal']" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#0A192F]">طلبات الاشتراك</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-orange-600 font-bold mt-1">⚠️ {pendingCount} طلب ينتظر الموافقة</p>
          )}
        </div>
        <button onClick={fetchRequests} className="flex items-center gap-2 text-sm text-[#0A192F] hover:text-[#D4AF37] transition">
          <RefreshCw size={16} /> تحديث
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["pending", "all", "approved", "rejected"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition ${filter === f ? "bg-[#0A192F] text-[#D4AF37]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {f === "all" ? "الكل" : f === "pending" ? "قيد الانتظار" : f === "approved" ? "مفعّل" : "مرفوض"}
            {f === "pending" && pendingCount > 0 && (
              <span className="mr-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={32} className="animate-spin text-[#0A192F]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-bold">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(req => {
            const status = STATUS_LABELS[req.status];
            return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <h3 className="font-black text-[#0A192F] text-lg">{req.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                        {status.icon} {status.label}
                      </span>
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${PLAN_COLORS[req.plan] || "bg-gray-100"}`}>
                        {req.planName}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600">
                      <span className="flex items-center gap-2"><Phone size={14} className="text-[#D4AF37]" />{req.phone}</span>
                      <span className="flex items-center gap-2"><Mail size={14} className="text-[#D4AF37]" />{req.email}</span>
                      <span className="flex items-center gap-2"><CreditCard size={14} className="text-[#D4AF37]" />{req.amount} ج.م / {req.billing === "monthly" ? "شهر" : "سنة"}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 flex-wrap">
                      <p className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleString("ar-EG")}</p>
                      {req.status === "approved" && req.subscriptionExpiry && (
                        <span className="flex items-center gap-2 text-xs text-gray-500 border border-gray-100 rounded-full px-3 py-1 bg-gray-50">
                          <Clock size={12} />
                          ينتهي: {new Date(req.subscriptionExpiry).toLocaleDateString("ar-EG")}
                          <ExpiryBadge expiry={req.subscriptionExpiry} />
                        </span>
                      )}
                    </div>
                  </div>

                  {req.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setApproveModal(req); setApproveEmail(req.email); }}
                        className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
                        <CheckCircle2 size={16} /> تفعيل
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-600 text-sm font-bold px-4 py-2 rounded-xl transition">
                        <XCircle size={16} /> رفض
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Approve Modal */}
      <AnimatePresence>
        {approveModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-[#0A192F]">تفعيل الاشتراك</h2>
                <button onClick={() => setApproveModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 mb-6 space-y-2 text-sm">
                <p className="flex items-center gap-2"><User size={14} className="text-[#D4AF37]" /><strong>{approveModal.name}</strong></p>
                <p className="flex items-center gap-2"><CreditCard size={14} className="text-[#D4AF37]" />{approveModal.planName} — {approveModal.amount} ج.م</p>
              </div>
              <div className="mb-6">
                <label className="text-sm font-bold text-gray-700 block mb-2">البريد الإلكتروني للحساب في النظام</label>
                <input
                  value={approveEmail}
                  onChange={e => setApproveEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#0A192F]"
                />
                <p className="text-xs text-gray-400 mt-2">تأكد أن البريد مطابق للحساب الموجود في النظام</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleApprove} disabled={isProcessing}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-black py-3 rounded-2xl transition flex items-center justify-center gap-2">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  تفعيل الاشتراك
                </button>
                <button onClick={() => setApproveModal(null)}
                  className="px-6 bg-gray-100 text-gray-700 font-bold py-3 rounded-2xl hover:bg-gray-200 transition">
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
