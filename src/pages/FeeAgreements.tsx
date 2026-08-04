/**
 * اتفاقيات الأتعاب — الوثيقة §1.9.
 *
 * الاتفاقية تحدّد كيف تُحتسب الأتعاب (مقطوع · بالساعة · شهري · نسبة · مراحل)،
 * والفواتير تُصدر استناداً إليها. المبلغ المتفق عليه يُشتق من النموذج
 * لا يُكتب يدوياً حتى لا يتناقض الحقل مع النموذج المختار.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Handshake, Plus, Search, ShieldAlert, RefreshCw, AlertTriangle, Scale,
  X, Trash2, Save, CheckCircle2, Ban,
} from "lucide-react";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { excludeDeleted, softDelete } from "../lib/softDelete";
import { fetchCaseOptions, fetchClientOptions, type CaseOption, type ClientOption } from "../lib/links";
import {
  AGREEMENT_STATUS_COLORS, AGREEMENT_STATUS_LABELS_AR, FEE_MODEL_LABELS_AR,
  agreementProgress, canCreateInvoice, computeAgreedTotal, nextNumber,
  type AgreementStatus, type FeeAgreement, type FeeModel, type Milestone,
} from "../lib/billing";

const money = (n: unknown) =>
  (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FeeAgreements() {
  const perms = usePermissions();
  const canView = perms.can("invoice.manage");
  const canManage = canCreateInvoice(perms.role);

  const [rows, setRows] = useState<FeeAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "fee_agreements"), where("lawyerId", "==", perms.lawyerId)),
      );
      setRows(
        excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeeAgreement, "id">) })))
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
      );
    } catch (err) {
      console.error("Error fetching fee agreements:", err);
      setError("تعذّر تحميل اتفاقيات الأتعاب. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  const setStatus = async (a: FeeAgreement, status: AgreementStatus) => {
    setBusy(a.id);
    try {
      await updateDoc(doc(db, "fee_agreements", a.id), { status, updatedAt: new Date().toISOString() });
      await writeAudit({
        action: "UPDATE", entity: "invoice", entityId: a.id,
        entityLabel: `${a.agreementNumber} — ${a.clientName ?? ""}`,
        before: { الحالة: AGREEMENT_STATUS_LABELS_AR[a.status] },
        after: { الحالة: AGREEMENT_STATUS_LABELS_AR[status] },
      });
      await load();
    } catch (err) {
      console.error(err);
      setError("تعذّر تحديث حالة الاتفاقية.");
    } finally { setBusy(null); }
  };

  const remove = async (a: FeeAgreement) => {
    if (!confirm(`ستنتقل الاتفاقية «${a.agreementNumber}» إلى سلة المحذوفات. متابعة؟`)) return;
    setBusy(a.id);
    try {
      await softDelete({
        path: ["fee_agreements", a.id], entity: "invoice",
        label: `${a.agreementNumber} — ${a.clientName ?? ""}`,
      });
      await load();
    } finally { setBusy(null); }
  };

  const summary = useMemo(() => {
    const live = rows.filter((r) => r.status !== "TERMINATED");
    return {
      agreed: live.reduce((s, r) => s + (Number(r.totalAgreed) || 0), 0),
      collected: live.reduce((s, r) => s + (Number(r.totalCollected) || 0), 0),
      active: rows.filter((r) => r.status === "ACTIVE").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.agreementNumber?.toLowerCase().includes(term) ||
      (r.clientName ?? "").toLowerCase().includes(term) ||
      (r.caseTitle ?? "").toLowerCase().includes(term));
  }, [rows, search]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية الوصول لاتفاقيات الأتعاب</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      {isAddOpen && (
        <AddFeeAgreementModal onClose={() => setIsAddOpen(false)} onDone={async () => { setIsAddOpen(false); await load(); }} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">اتفاقيات الأتعاب</h1>
          <p className="text-gray-500 mt-1 text-sm">
            نموذج احتساب الأتعاب لكل عميل — {rows.length} اتفاقية · {summary.active} سارية
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {canManage && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <Plus className="ml-2 h-4 w-4" /> اتفاقية جديدة
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          ["إجمالي المتفق عليه", summary.agreed, "text-[#133B2E]"],
          ["المحصَّل", summary.collected, "text-green-600"],
          ["المتبقي", Math.max(0, summary.agreed - summary.collected), "text-amber-600"],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">{label as string}</p>
            <p className={`text-xl font-black mt-1 ${cls as string}`}>
              {money(value)} <span className="text-xs font-normal text-gray-400">{currency}</span>
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {rows.length > 3 && (
        <div className="relative sm:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرقم أو العميل..."
            className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-[#133B2E] bg-white" />
        </div>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Handshake className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">
            الاتفاقيات <span className="text-sm font-normal text-gray-400">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
              <Handshake size={32} className="text-gray-300" />
              <p className="font-medium text-gray-500">
                {rows.length === 0 ? "لا توجد اتفاقيات أتعاب بعد" : "لا نتائج مطابقة"}
              </p>
              {rows.length === 0 && canManage && <p className="text-xs">اضغط «اتفاقية جديدة» لإضافة أول اتفاقية</p>}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((a) => {
                const p = agreementProgress(a);
                return (
                  <li key={a.id} className="p-4 hover:bg-gray-50/50">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400" dir="ltr">{a.agreementNumber}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${AGREEMENT_STATUS_COLORS[a.status]}`}>
                            {AGREEMENT_STATUS_LABELS_AR[a.status]}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                            {FEE_MODEL_LABELS_AR[a.model]}
                          </span>
                        </div>
                        <p className="font-bold text-[#133B2E] mt-1">{a.clientName || "بلا عميل"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {a.model === "HOURLY" && a.hourlyRate ? `${money(a.hourlyRate)} ${a.currency}/ساعة` : ""}
                          {a.model === "RETAINER" && a.retainerMonthly ? `${money(a.retainerMonthly)} ${a.currency}/شهر` : ""}
                          {a.model === "CONTINGENCY" && a.contingencyPercent ? `${a.contingencyPercent}% من المحكوم به` : ""}
                          {p.agreed > 0 ? `${a.model === "FIXED" || a.model === "MILESTONE" ? "" : " · "}متفق عليه ${money(p.agreed)} ${a.currency}` : ""}
                          {p.collected > 0 ? ` · محصَّل ${money(p.collected)}` : ""}
                        </p>

                        {p.agreed > 0 && (
                          <div className="mt-2 h-1.5 w-full max-w-sm bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#D4AF37] rounded-full transition-all" style={{ width: `${p.percent}%` }} />
                          </div>
                        )}

                        {a.caseId && (
                          <Link to={`/app/cases/${a.caseId}`}
                            className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition">
                            <Scale size={12} />
                            {a.caseNumber ? `${a.caseNumber} — ` : ""}{a.caseTitle || "القضية المرتبطة"}
                          </Link>
                        )}

                        {(a.milestones?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {a.milestones!.map((m, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600">
                                {m.title}: {money(m.amount)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 flex-wrap shrink-0">
                          {a.status === "DRAFT" && (
                            <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => setStatus(a, "ACTIVE")}
                              className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                              <CheckCircle2 size={13} className="ml-1" /> تفعيل
                            </Button>
                          )}
                          {a.status === "ACTIVE" && (
                            <>
                              <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => setStatus(a, "COMPLETED")}
                                className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 text-xs">
                                إنهاء
                              </Button>
                              <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => setStatus(a, "TERMINATED")}
                                className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs">
                                <Ban size={13} className="ml-1" /> فسخ
                              </Button>
                            </>
                          )}
                          {a.status === "DRAFT" && (
                            <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => remove(a)}
                              className="rounded-xl text-red-600 hover:bg-red-50" title="حذف الاتفاقية">
                              <Trash2 size={15} />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ────────────────────────── نموذج الإضافة ────────────────────────── */

function AddFeeAgreementModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const perms = usePermissions();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const currency = localStorage.getItem("sys_currency") || "SAR";

  const [form, setForm] = useState({
    clientId: "", caseId: "", model: "FIXED" as FeeModel,
    fixedAmount: "", hourlyRate: "", retainerMonthly: "", contingencyPercent: "",
    startDate: new Date().toISOString().slice(0, 10), endDate: "", notes: "",
  });
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: "", amount: 0, dueDate: null, status: "PENDING" },
  ]);

  useEffect(() => {
    if (!perms.lawyerId) return;
    const lawyerId = perms.lawyerId;
    void (async () => {
      const [cl, cs] = await Promise.all([fetchClientOptions(lawyerId), fetchCaseOptions(lawyerId)]);
      setClients(cl);
      setCases(cs);
    })();
  }, [perms.lawyerId]);

  const casesForClient = form.clientId ? cases.filter((c) => c.clientId === form.clientId) : cases;

  const agreed = computeAgreedTotal({
    model: form.model,
    fixedAmount: Number(form.fixedAmount),
    retainerMonthly: Number(form.retainerMonthly),
    milestones,
    startDate: form.startDate,
    endDate: form.endDate,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId) { setErr("اختر العميل"); return; }
    if (form.model === "FIXED" && !(Number(form.fixedAmount) > 0)) { setErr("أدخل المبلغ المقطوع"); return; }
    if (form.model === "HOURLY" && !(Number(form.hourlyRate) > 0)) { setErr("أدخل سعر الساعة"); return; }
    if (form.model === "RETAINER" && !(Number(form.retainerMonthly) > 0)) { setErr("أدخل الأتعاب الشهرية"); return; }
    if (form.model === "CONTINGENCY" && !(Number(form.contingencyPercent) > 0)) { setErr("أدخل النسبة"); return; }
    if (form.model === "MILESTONE" && milestones.filter((m) => m.title.trim()).length === 0) {
      setErr("أضف مرحلة واحدة على الأقل"); return;
    }
    if (form.endDate && form.endDate < form.startDate) { setErr("تاريخ الانتهاء بعد تاريخ البداية"); return; }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }

    setBusy(true);
    setErr("");
    try {
      const lawyerId = perms.lawyerId;
      const agreementNumber = await nextNumber(lawyerId, "fee_agreements");
      const client = clients.find((c) => c.id === form.clientId);
      const linkedCase = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;
      const now = new Date().toISOString();
      const cleanMilestones = form.model === "MILESTONE"
        ? milestones.filter((m) => m.title.trim()).map((m) => ({
            title: m.title.trim(), amount: Number(m.amount) || 0,
            dueDate: m.dueDate || null, status: "PENDING" as const, invoiceId: null,
          }))
        : [];

      await addDoc(collection(db, "fee_agreements"), {
        lawyerId,
        agreementNumber,
        clientId: form.clientId,
        clientName: client?.label ?? null,
        caseId: form.caseId || null,
        caseTitle: linkedCase?.label ?? null,
        caseNumber: linkedCase?.caseNumber || null,
        contractId: null,
        model: form.model,
        fixedAmount: form.model === "FIXED" ? Number(form.fixedAmount) || 0 : null,
        hourlyRate: form.model === "HOURLY" || form.model === "MIXED" ? Number(form.hourlyRate) || 0 : null,
        retainerMonthly: form.model === "RETAINER" || form.model === "MIXED" ? Number(form.retainerMonthly) || 0 : null,
        contingencyPercent: form.model === "CONTINGENCY" || form.model === "MIXED" ? Number(form.contingencyPercent) || 0 : null,
        milestones: cleanMilestones,
        totalAgreed: agreed,
        totalInvoiced: 0,
        totalCollected: 0,
        currency,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: "DRAFT",
        notes: form.notes || null,
        createdAt: now,
        createdBy: perms.userId,
        updatedAt: now,
        deletedAt: null,
      });

      await writeAudit({
        action: "CREATE", entity: "invoice", entityId: null,
        entityLabel: `${agreementNumber} — ${client?.label ?? ""}`,
        after: {
          النموذج: FEE_MODEL_LABELS_AR[form.model],
          "المتفق عليه": agreed,
          القضية: linkedCase?.label ?? "غير مرتبطة",
        },
      });

      onDone();
    } catch (e2) {
      console.error(e2);
      setErr("تعذّر حفظ الاتفاقية. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";
  const needs = (m: FeeModel[]) => m.includes(form.model);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <Handshake size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">اتفاقية أتعاب جديدة</h2>
              <p className="text-xs text-[#D4AF37]">تُحفظ كمسودة ثم تُفعَّل — الفواتير تُصدر استناداً إليها</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-6 md:p-8 space-y-5">
          {err && (
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" /> <span>{err}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">العميل *</label>
              <select required value={form.clientId} className={field}
                onChange={(e) => setForm({ ...form, clientId: e.target.value, caseId: "" })}>
                <option value="">— اختر العميل —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                القضية <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select value={form.caseId} className={field}
                onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
                <option value="">— اتفاقية عامة —</option>
                {casesForClient.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-gray-700">نموذج الأتعاب *</label>
              <select value={form.model} className={field}
                onChange={(e) => setForm({ ...form, model: e.target.value as FeeModel })}>
                {Object.entries(FEE_MODEL_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {needs(["FIXED", "MIXED"]) && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">المبلغ المقطوع ({currency})</label>
                <input type="number" min="0" step="0.01" value={form.fixedAmount} className={field}
                  onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })} />
              </div>
            )}
            {needs(["HOURLY", "MIXED"]) && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">سعر الساعة ({currency})</label>
                <input type="number" min="0" step="0.01" value={form.hourlyRate} className={field}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
              </div>
            )}
            {needs(["RETAINER", "MIXED"]) && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">الأتعاب الشهرية ({currency})</label>
                <input type="number" min="0" step="0.01" value={form.retainerMonthly} className={field}
                  onChange={(e) => setForm({ ...form, retainerMonthly: e.target.value })} />
              </div>
            )}
            {needs(["CONTINGENCY", "MIXED"]) && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">النسبة من المحكوم به (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={form.contingencyPercent} className={field}
                  onChange={(e) => setForm({ ...form, contingencyPercent: e.target.value })} />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ البداية</label>
              <input type="date" value={form.startDate} className={field}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">تاريخ الانتهاء</label>
              <input type="date" value={form.endDate} className={field}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          {form.model === "MILESTONE" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-gray-700">المراحل *</label>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setMilestones((p) => [...p, { title: "", amount: 0, dueDate: null, status: "PENDING" }])}
                  className="rounded-xl border-gray-200 text-[#133B2E]">
                  <Plus size={14} className="ml-1" /> مرحلة
                </Button>
              </div>
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-bold text-gray-600">
                  <div className="col-span-6">المرحلة</div>
                  <div className="col-span-3">المبلغ</div>
                  <div className="col-span-3">الاستحقاق</div>
                </div>
                {milestones.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t border-gray-100">
                    <input value={m.title} placeholder="مثال: عند رفع الدعوى"
                      onChange={(e) => setMilestones((p) => p.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                      className="col-span-6 px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                    <input type="number" min="0" step="0.01" value={m.amount}
                      onChange={(e) => setMilestones((p) => p.map((x, idx) => idx === i ? { ...x, amount: Number(e.target.value) } : x))}
                      className="col-span-3 px-2 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                    <div className="col-span-3 flex items-center gap-1">
                      <input type="date" value={m.dueDate ?? ""}
                        onChange={(e) => setMilestones((p) => p.map((x, idx) => idx === i ? { ...x, dueDate: e.target.value || null } : x))}
                        className="flex-1 px-2 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#133B2E]" />
                      {milestones.length > 1 && (
                        <button type="button" title="حذف المرحلة"
                          onClick={() => setMilestones((p) => p.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:bg-red-50 rounded p-1">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">المبلغ المتفق عليه</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {agreed > 0 ? "يُحتسب تلقائياً من النموذج المختار" : "غير محدّد مسبقاً في هذا النموذج — يتحدّد عند الفوترة"}
              </p>
            </div>
            <p className="font-black text-xl text-[#D4AF37]">{money(agreed)} {currency}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">ملاحظات</label>
            <input value={form.notes} className={field} placeholder="شروط إضافية..."
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" />
              {busy ? "جاري الحفظ..." : "حفظ كمسودة"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}
              className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50">
              إلغاء
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
