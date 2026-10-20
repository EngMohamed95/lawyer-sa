/**
 * سجل المدفوعات والعمليات المالية — طلبات الاشتراك (subscriptionRequests).
 * إحصاءات المبالغ، توزيعها حسب الباقة، تصفية بالفترة والحالة والباقة، تصدير CSV،
 * وتفعيل الطلبات أو رفضها.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Ban, CheckCircle2, Clock, CreditCard, Download, FileText, Filter, Loader2, Percent, Receipt, RefreshCw, Search, User, X, XCircle,
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, getDocs, doc, updateDoc, query, where, orderBy, limit } from "firebase/firestore";
import { Input } from "../components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AdminHeader, AdminModal, AdminStat, HeaderButton, adminPanel, fmtDateTime, fmtNum } from "../components/admin/AdminUi";
import { loadPlans } from "../lib/subscriptionPlans";

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

const STATUS_LABELS: Record<Request["status"], { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "قيد الانتظار",       color: "bg-amber-100 text-amber-700",     icon: <Clock size={13} /> },
  approved: { label: "مكتمل ومفعّل",       color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={13} /> },
  rejected: { label: "مرفوض",              color: "bg-red-100 text-red-600",         icon: <XCircle size={13} /> },
};

type Period = "all" | "today" | "7d" | "month" | "30d" | "year";
const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "الكل" }, { id: "today", label: "اليوم" }, { id: "7d", label: "آخر 7 أيام" },
  { id: "month", label: "هذا الشهر" }, { id: "30d", label: "آخر 30 يوماً" }, { id: "year", label: "هذا العام" },
];

function periodStart(p: Period): number {
  const now = new Date();
  if (p === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (p === "7d") return Date.now() - 7 * 86400000;
  if (p === "30d") return Date.now() - 30 * 86400000;
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (p === "year") return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
}

const money = (n: number) => `${fmtNum(Math.round(n * 100) / 100)} ج.م`;
const refOf = (r: Request) => `SUB-${r.id.slice(0, 8).toUpperCase()}`;
const selectClass = "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm";

export default function SubscriptionRequests() {
  const [requests, setRequests]       = useState<Request[]>([]);
  const [loading, setLoading]         = useState(true);
  const [approveModal, setApproveModal] = useState<Request | null>(null);
  const [approveEmail, setApproveEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [search, setSearch]     = useState("");
  const [status, setStatus]     = useState<"" | Request["status"]>("");
  const [planFilter, setPlanFilter] = useState("");
  const [period, setPeriod]     = useState<Period>("all");
  const [from, setFrom]         = useState("");
  const [to, setTo]             = useState("");

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

      // ربط الاشتراك بباقة من «باقات الاشتراك» إن وُجدت بنفس المستوى والمدة — لمتابعة الحدود
      const plans = await loadPlans().catch(() => []);
      const matched = plans.find(p => p.active && p.tier === approveModal.plan && p.billing === approveModal.billing);

      await updateDoc(userRef, {
        plan:                 approveModal.plan,
        subscriptionExpiry:   expiry.toISOString(),
        subscriptionBilling:  approveModal.billing,
        subscriptionStart:    new Date().toISOString(),
        ...(matched ? { planId: matched.id } : {}),
      });

      await updateDoc(doc(db, "subscriptionRequests", approveModal.id), {
        status:     "approved",
        approvedAt: new Date().toISOString(),
        linkedUserId: usersSnap.docs[0].id,
        subscriptionExpiry: expiry.toISOString(),
      });

      setRequests(prev => prev.map(r => r.id === approveModal.id ? { ...r, status: "approved", subscriptionExpiry: expiry.toISOString() } : r));
      setApproveModal(null);
      setApproveEmail("");
      alert(`✅ تم تفعيل الاشتراك حتى: ${expiry.toLocaleDateString("ar-EG-u-nu-latn")}`);
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

  /* ───────── الإحصاءات ───────── */
  const amountOf = (r: Request) => Number(r.amount) || 0;
  const stats = useMemo(() => {
    const by = (s: Request["status"]) => requests.filter(r => r.status === s);
    const approved = by("approved"), pending = by("pending"), rejected = by("rejected");
    return {
      total: requests.length,
      approvedSum: approved.reduce((s, r) => s + amountOf(r), 0), approvedCount: approved.length,
      pendingSum: pending.reduce((s, r) => s + amountOf(r), 0), pendingCount: pending.length,
      rejectedCount: rejected.length,
      successRate: requests.length ? Math.round((approved.length / requests.length) * 1000) / 10 : 0,
    };
  }, [requests]);

  const planBreakdown = useMemo(() => {
    const m = new Map<string, { name: string; count: number; approved: number; pending: number }>();
    requests.forEach(r => {
      const key = r.planName || r.plan || "غير محدد";
      const e = m.get(key) || { name: key, count: 0, approved: 0, pending: 0 };
      e.count++;
      if (r.status === "approved") e.approved += amountOf(r);
      if (r.status === "pending") e.pending += amountOf(r);
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [requests]);

  /* ───────── التصفية ───────── */
  const q = search.trim().toLowerCase();
  const fromT = from ? new Date(from).getTime() : 0;
  const toT = to ? new Date(to).getTime() + 86400000 : Infinity;
  const startT = periodStart(period);
  const filtered = requests.filter(r => {
    const t = new Date(r.createdAt).getTime() || 0;
    return (!status || r.status === status)
      && (!planFilter || (r.planName || r.plan) === planFilter)
      && t >= startT && t >= fromT && t < toT
      && (!q || [r.name, r.email, r.phone, r.id, refOf(r)].some(v => String(v || "").toLowerCase().includes(q)));
  });
  const filteredSum = filtered.reduce((s, r) => s + amountOf(r), 0);
  const filteredPaid = filtered.filter(r => r.status === "approved").reduce((s, r) => s + amountOf(r), 0);

  const exportCsv = () => {
    const header = ["رقم الطلب", "العميل", "البريد", "الهاتف", "الباقة", "المدة", "المبلغ (ج.م)", "الحالة", "تاريخ الطلب", "تاريخ التفعيل"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map(r => [refOf(r), r.name, r.email, r.phone, r.planName || r.plan, r.billing === "annual" ? "سنوي" : "شهري",
      amountOf(r), STATUS_LABELS[r.status]?.label || r.status, fmtDateTime(r.createdAt), r.approvedAt ? fmtDateTime(r.approvedAt) : ""]);
    const csv = "﻿" + [header, ...rows].map(row => row.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `سجل_المدفوعات_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => { setSearch(""); setStatus(""); setPlanFilter(""); setPeriod("all"); setFrom(""); setTo(""); };
  const hasFilters = !!(search || status || planFilter || period !== "all" || from || to);

  return (
    <div className="space-y-6 font-['Tajawal'] text-[#192a56]" dir="rtl">
      <AdminHeader
        icon={<Receipt size={26} />}
        title="سجل المدفوعات والعمليات المالية"
        subtitle="متابعة كافة طلبات الاشتراك والمدفوعات المنفذة على المنصة، وإحصاءات المبالغ حسب الحالة والباقة بدقة."
        actions={<>
          <HeaderButton onClick={fetchRequests} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث السجلات</HeaderButton>
          <button type="button" onClick={exportCsv} disabled={!filtered.length}
            className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50">
            <Download size={16} /> تصدير CSV
          </button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStat title="إجمالي العمليات" value={fmtNum(stats.total)} sub="طلب اشتراك مسجل" icon={<FileText size={22} />} iconClass="bg-indigo-100/70 text-indigo-600" />
        <AdminStat title="المدفوع بنجاح" value={<span className="text-emerald-600">{money(stats.approvedSum)}</span>} sub={`${fmtNum(stats.approvedCount)} عملية مفعّلة`} icon={<CheckCircle2 size={22} />} iconClass="bg-emerald-100/70 text-emerald-600" />
        <AdminStat title="قيد الانتظار" value={<span className="text-amber-600">{money(stats.pendingSum)}</span>} sub={`${fmtNum(stats.pendingCount)} عملية معلقة`} icon={<Clock size={22} />} iconClass="bg-amber-100/70 text-amber-600" />
        <AdminStat title="العمليات المرفوضة" value={<span className="text-red-600">{fmtNum(stats.rejectedCount)}</span>} sub="مرفوضة / ملغاة" icon={<Ban size={22} />} iconClass="bg-red-100/70 text-red-600" />
        <AdminStat title="نسبة النجاح" value={<span className="text-cyan-700">{stats.successRate}%</span>} sub="معدل التفعيل" icon={<Percent size={22} />} iconClass="bg-cyan-100/70 text-cyan-600" />
      </div>

      {planBreakdown.length > 0 && (
        <div className={`${adminPanel} p-5`}>
          <h2 className="mb-4 flex items-center gap-2 font-bold"><CreditCard size={18} className="text-[#273c75]" /> توزيع الإيرادات والمبالغ حسب الباقة <span className="text-xs font-normal text-slate-400">(اضغط على باقة لتصفية الجدول بها)</span></h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {planBreakdown.map(p => (
              <button key={p.name} type="button" onClick={() => setPlanFilter(planFilter === p.name ? "" : p.name)}
                className={`rounded-2xl border p-4 text-right transition hover:shadow-md ${planFilter === p.name ? "border-[#273c75] ring-2 ring-[#273c75]/20" : "border-slate-200"}`}>
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-500">{p.name}</span>
                  <span className="rounded-full bg-[#273c75] px-2.5 py-0.5 text-xs font-bold text-white">{fmtNum(p.count)} عملية</span>
                </div>
                <p className="flex justify-between text-sm"><span className="text-slate-500">المدفوع بنجاح:</span><span className="font-bold text-emerald-600">{money(p.approved)}</span></p>
                {p.pending > 0 && <p className="mt-1 flex justify-between text-xs"><span className="text-slate-500">معلق:</span><span className="font-bold text-amber-600">{money(p.pending)}</span></p>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${adminPanel} overflow-hidden`}>
        <div className="space-y-4 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">الفترة السريعة:</span>
            {PERIODS.map(p => (
              <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${period === p.id ? "border-[#273c75] bg-[#273c75] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-slate-50 pr-9" placeholder="رقم الطلب، اسم المحامي، البريد، الهاتف..." />
            </div>
            <SearchableSelect className={selectClass} value={status} onChange={e => setStatus(e.target.value as any)} aria-label="الحالة">
              <option value="">جميع الحالات</option>
              {(Object.keys(STATUS_LABELS) as Request["status"][]).map(s => <option key={s} value={s}>{STATUS_LABELS[s].label}</option>)}
            </SearchableSelect>
            <SearchableSelect className={selectClass} value={planFilter} onChange={e => setPlanFilter(e.target.value)} aria-label="الباقة">
              <option value="">جميع الباقات</option>
              {planBreakdown.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </SearchableSelect>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="من تاريخ" title="من تاريخ" />
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="إلى تاريخ" title="إلى تاريخ" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-1.5"><Filter size={14} className="text-[#273c75]" /> نتائج التصفية: <b>{fmtNum(filtered.length)}</b> عملية</span>
          <span>إجمالي المبالغ: <b>{money(filteredSum)}</b></span>
          <span>المدفوع بنجاح: <b className="text-emerald-600">{money(filteredPaid)}</b></span>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="mr-auto flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><X size={13} /> مسح التصفية</button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#273c75]" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">{requests.length ? "لا توجد عمليات مطابقة" : "لا توجد طلبات اشتراك بعد"}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-right">
                <tr>
                  {["رقم الطلب", "العميل / المحامي", "الباقة والمدة", "المبلغ", "الحالة", "تاريخ العملية", "الإجراءات"].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => {
                  const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-mono text-xs font-bold" dir="ltr">{refOf(r)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold">{r.name || "—"}</p>
                        <p className="text-xs text-slate-500" dir="ltr" style={{ textAlign: "right" }}>{r.email}</p>
                        {r.phone && <p className="text-xs text-slate-400" dir="ltr" style={{ textAlign: "right" }}>{r.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[#273c75]/30 px-2.5 py-0.5 text-xs text-[#273c75]">{r.planName || r.plan}</span>
                        <p className="mt-1 text-xs text-slate-400">{r.billing === "annual" ? "سنوي" : "شهري"}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">{money(amountOf(r))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${st.color}`}>{st.icon} {st.label}</span>
                        {r.status === "approved" && r.subscriptionExpiry && (
                          <p className="mt-1 text-[11px] text-slate-400">ينتهي: {new Date(r.subscriptionExpiry).toLocaleDateString("ar-EG-u-nu-latn")}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        {r.status === "pending" ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => { setApproveModal(r); setApproveEmail(r.email); }}
                              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                              <CheckCircle2 size={13} /> تفعيل
                            </button>
                            <button onClick={() => handleReject(r.id)}
                              className="flex items-center gap-1 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100">
                              <XCircle size={13} /> رفض
                            </button>
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approveModal && (
        <AdminModal title="تفعيل الاشتراك" onClose={() => setApproveModal(null)}>
          <div className="mb-6 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <p className="flex items-center gap-2"><User size={14} className="text-[#273c75]" /><strong>{approveModal.name}</strong></p>
            <p className="flex items-center gap-2"><CreditCard size={14} className="text-[#273c75]" />{approveModal.planName} — {money(amountOf(approveModal))} / {approveModal.billing === "annual" ? "سنة" : "شهر"}</p>
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-sm font-bold text-gray-700">البريد الإلكتروني للحساب في النظام</label>
            <input
              value={approveEmail}
              onChange={e => setApproveEmail(e.target.value)}
              placeholder="example@mail.com"
              dir="ltr"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-[#192a56] focus:outline-none"
            />
            <p className="mt-2 text-xs text-gray-400">تأكد أن البريد مطابق للحساب الموجود في النظام</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleApprove} disabled={isProcessing}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-black text-white transition hover:bg-emerald-700">
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              تفعيل الاشتراك
            </button>
            <button onClick={() => setApproveModal(null)}
              className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-700 transition hover:bg-gray-200">
              إلغاء
            </button>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
