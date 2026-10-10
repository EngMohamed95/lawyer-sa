/**
 * قسم «الطلبات» في صفحة القضية بتصميم ناجز — بطاقات مع قائمة إجراءات (⋮).
 * «موعد المتابعة» يظهر في التقويم للطلبات التي لم يُبتّ فيها بعد.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { addDoc, collection, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Archive, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AttachmentChips, AttachmentPicker, AttachmentSearch, matchesAttachmentSearch, uploadNewFiles, type PendingFile,
} from "./AttachmentPicker";
import { db } from "../lib/firebase";
import { formatGregorian } from "../lib/calendar";
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
    requestDate: today(), followUpDate: "", degree: "FIRST", notes: "", attachments: [],
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

  const [search, setSearch] = useState("");
  const sorted = [...requests].sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));
  const shown = sorted.filter((r) => matchesAttachmentSearch(r.attachments ?? [], search));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#1a9a45]">الطلبات</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sorted.length > 0 && <AttachmentSearch value={search} onChange={setSearch} />}
          <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90" onClick={openAdd}>
            <Plus className="ml-2 h-4 w-4" /> إضافة طلب
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد طلبات مسجلة</p>
      ) : shown.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد مرفقات تطابق «{search}»</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => <RequestCard key={r.id} r={r} search={search} onEdit={() => openEdit(r)} onDelete={() => remove(r)} />)}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#1a9a45]">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 truncate">{children}</dd>
    </div>
  );
}

function RequestCard({ r, search, onEdit, onDelete }: { r: CaseRequest; search: string; onEdit: () => void; onDelete: () => void }) {
  const followUpDue = isOpenRequest(r) && r.followUpDate;
  const files = r.attachments ?? [];

  return (
    <div className="bg-white rounded-xl border border-[#bfe3d6] border-r-[5px] border-r-[#1a9a45] transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-8 w-8 shrink-0 rounded-md bg-[#1a9a45] text-white flex items-center justify-center">
            <Archive size={16} />
          </span>
          <h3 className="text-base font-bold text-gray-900 leading-snug truncate">{r.type || "طلب"}</h3>
          <span className={`shrink-0 rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-bold ${REQUEST_STATUS_CLASS[r.status] || ""}`}>
            {REQUEST_STATUS_LABELS_AR[r.status] || r.status}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-200 text-sm font-bold text-[#133B2E] hover:bg-gray-50 transition">
            <Pencil size={14} /> تعديل
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-red-100 text-sm font-bold text-red-600 hover:bg-red-50 transition">
            <Trash2 size={14} /> حذف
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2.5 px-4 py-3">
        <Field label="رقم الطلب"><span dir="ltr">{r.requestNumber || "-"}</span></Field>
        <Field label="تاريخ الطلب">{formatGregorian(r.requestDate)}</Field>
        <Field label="الدرجة">{COURT_DEGREE_LABELS_AR[r.degree] || "-"}</Field>
        <Field label="موعد المتابعة">
          {followUpDue ? <span className="font-bold text-amber-700">{formatGregorian(r.followUpDate)}</span> : "-"}
        </Field>
      </dl>

      {(r.notes || files.length > 0) && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-2.5">
          {r.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap"><span className="text-gray-400">ملاحظات: </span>{r.notes}</p>}
          <AttachmentChips files={files} highlight={search} />
        </div>
      )}
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
  // ملفات مختارة لم تُرفع بعد — تُرفع عند الحفظ
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);

  useEffect(() => { if (isOpen) { setForm(initial); setNewFiles([]); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const label = "text-sm font-bold text-[#133B2E]";
  const select = "w-full h-9 px-3 rounded-md border border-gray-300 text-sm bg-white";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        ...form, type: form.type.trim(), requestNumber: form.requestNumber.trim(),
        attachments: await uploadNewFiles(form.attachments ?? [], newFiles),
      });
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

          <AttachmentPicker
            label="مرفقات الطلب"
            hint="لا توجد مرفقات — أرفق صحيفة الطلب أو المستندات المؤيدة."
            existing={form.attachments ?? []}
            onExistingChange={(files) => set("attachments", files)}
            newFiles={newFiles}
            onNewFilesChange={setNewFiles}
          />

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {saving && newFiles.length ? "جاري رفع المرفقات..." : isEdit ? "حفظ التعديلات" : "إضافة الطلب"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
