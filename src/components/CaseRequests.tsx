/**
 * قسم «الطلبات» في صفحة القضية بتصميم ناجز — بطاقات مع قائمة إجراءات (⋮).
 * «موعد المتابعة» يظهر في التقويم للطلبات التي لم يُبتّ فيها بعد.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { addDoc, collection, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Archive, EllipsisVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { formatHijri } from "../lib/calendar";
import {
  COURT_DEGREE_LABELS_AR, REQUEST_STATUS_CLASS, REQUEST_STATUS_LABELS_AR, REQUEST_TYPES,
  isOpenRequest, type CaseRequest, type CourtDegree, type RequestStatus,
} from "../lib/caseRequests";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type Draft = Omit<CaseRequest, "id" | "caseId" | "createdAt" | "updatedAt">;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CaseRequests({ caseId, caseData, requests, onChanged }: {
  caseId: string;
  caseData: any;
  requests: CaseRequest[];
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<CaseRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const blank = (): Draft => ({
    type: "", requestNumber: "", status: "SUBMITTED",
    court: caseData?.courtName || "", circuit: caseData?.courtCircle || "",
    requestDate: today(), followUpDate: "", degree: "FIRST", notes: "",
  });

  const openAdd = () => { setEditing(null); setIsOpen(true); };
  const openEdit = (r: CaseRequest) => { setEditing(r); setIsOpen(true); };

  const remove = async (r: CaseRequest) => {
    if (!confirm(`حذف «${r.type}»؟`)) return;
    try {
      await deleteDoc(doc(db, "cases", caseId, "requests", r.id));
      await onChanged();
    } catch (err) {
      console.error("Error deleting request:", err);
      alert("تعذّر حذف الطلب");
    }
  };

  const sorted = [...requests].sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1a9a45]">الطلبات</h2>
        <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90" onClick={openAdd}>
          <Plus className="ml-2 h-4 w-4" /> إضافة طلب
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد طلبات مسجلة</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((r) => <RequestCard key={r.id} r={r} onEdit={() => openEdit(r)} onDelete={() => remove(r)} />)}
        </div>
      )}

      <RequestDialog
        isOpen={isOpen}
        initial={editing ? { ...blank(), ...editing } : blank()}
        isEdit={!!editing}
        onClose={() => setIsOpen(false)}
        onSubmit={async (draft) => {
          const now = new Date().toISOString();
          if (editing) {
            await updateDoc(doc(db, "cases", caseId, "requests", editing.id), { ...draft, updatedAt: now });
          } else {
            await addDoc(collection(db, "cases", caseId, "requests"), {
              ...draft, caseId, lawyerId: caseData?.lawyerId || localStorage.getItem("lawyerId") || "",
              createdAt: now, updatedAt: now,
            });
          }
          setIsOpen(false);
          await onChanged();
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 items-baseline">
      <dt className="text-sm text-[#1a9a45]">{label}</dt>
      <dd className="text-sm text-gray-900 truncate">{children}</dd>
    </div>
  );
}

function RequestCard({ r, onEdit, onDelete }: { r: CaseRequest; onEdit: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const followUpDue = isOpenRequest(r) && r.followUpDate;

  return (
    <div className="flex flex-col bg-white rounded-lg border-2 border-[#bfe3d6] transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-md bg-[#1a9a45] text-white flex items-center justify-center">
            <Archive size={16} />
          </span>
          <h3 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">{r.type || "طلب"}</h3>
        </div>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="إجراءات الطلب"
            className="h-8 w-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100">
            <EllipsisVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-9 z-10 w-32 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
              <button onClick={() => { setMenuOpen(false); onEdit(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Pencil size={14} /> تعديل
              </button>
              <button onClick={() => { setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 size={14} /> حذف
              </button>
            </div>
          )}
        </div>
      </div>

      <dl className="px-4 py-3 space-y-2 flex-1">
        <Row label="رقم الطلب">{r.requestNumber || "-"}</Row>
        <Row label="حالة الطلب">
          <span className={REQUEST_STATUS_CLASS[r.status] || ""}>{REQUEST_STATUS_LABELS_AR[r.status] || r.status}</span>
        </Row>
        <Row label="المحكمة">{r.court || "-"}</Row>
        <Row label="الدائرة">{r.circuit || "-"}</Row>
        {followUpDue && <Row label="موعد المتابعة"><span className="font-bold text-amber-700">{formatHijri(r.followUpDate)}</span></Row>}
      </dl>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">
        <span>تاريخ الطلب {formatHijri(r.requestDate)}</span>
        <span className="text-[#1a9a45]/70">{COURT_DEGREE_LABELS_AR[r.degree] || ""}</span>
      </div>
    </div>
  );
}

function RequestDialog({ isOpen, initial, isEdit, onClose, onSubmit }: {
  isOpen: boolean;
  initial: Draft;
  isEdit: boolean;
  onClose: () => void;
  onSubmit: (d: Draft) => Promise<void>;
}) {
  const [form, setForm] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (isOpen) setForm(initial); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const label = "text-sm font-bold text-[#133B2E]";
  const select = "w-full h-9 px-3 rounded-md border border-gray-300 text-sm bg-white";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ ...form, type: form.type.trim(), requestNumber: form.requestNumber.trim() });
    } catch (err: any) {
      console.error("Error saving request:", err);
      alert("تعذّر حفظ الطلب: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">{isEdit ? "تعديل الطلب" : "إضافة طلب"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-2">
            <label className={label}>نوع الطلب *</label>
            <Input required list="request-types" value={form.type} onChange={(e) => set("type", e.target.value)}
              placeholder="اختر من القائمة أو اكتب نوعاً آخر" />
            <datalist id="request-types">
              {REQUEST_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={label}>رقم الطلب</label>
              <Input value={form.requestNumber} onChange={(e) => set("requestNumber", e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className={label}>حالة الطلب</label>
              <select className={select} value={form.status} onChange={(e) => set("status", e.target.value as RequestStatus)}>
                {(Object.keys(REQUEST_STATUS_LABELS_AR) as RequestStatus[]).map((s) => (
                  <option key={s} value={s}>{REQUEST_STATUS_LABELS_AR[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className={label}>المحكمة</label>
              <Input value={form.court} onChange={(e) => set("court", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>الدائرة</label>
              <Input value={form.circuit} onChange={(e) => set("circuit", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>تاريخ الطلب *</label>
              <Input type="date" required value={form.requestDate} onChange={(e) => set("requestDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>موعد المتابعة / الرد</label>
              <Input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>الدرجة</label>
              <select className={select} value={form.degree} onChange={(e) => set("degree", e.target.value as CourtDegree)}>
                {(Object.keys(COURT_DEGREE_LABELS_AR) as CourtDegree[]).map((d) => (
                  <option key={d} value={d}>{COURT_DEGREE_LABELS_AR[d]}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-1">تاريخ الطلب يظهر في التقويم، وموعد المتابعة يظهر كذلك ما دام الطلب مقدَّماً أو قيد الدراسة.</p>

          <div className="space-y-2">
            <label className={label}>ملاحظات</label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {isEdit ? "حفظ التعديلات" : "إضافة الطلب"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
