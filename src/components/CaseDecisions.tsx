/**
 * قسم «القرارات» — قرارات المحكمة أثناء نظر الدعوى (تأجيل، ندب خبير، إحالة...).
 * تُحفظ في `cases/{id}.decisions` بنفس أسلوب الأحكام، ولكل قرار مرفقات متعددة.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { formatGregorian } from "../lib/calendar";
import {
  AttachmentChips, AttachmentPicker, AttachmentSearch, attachmentsOf, matchesAttachmentSearch, uploadNewFiles,
  type Attachment, type PendingFile,
} from "./AttachmentPicker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export interface CaseDecision {
  id: string;
  /** رقم القرار */
  decisionNumber: string;
  /** تاريخ القرار YYYY-MM-DD */
  decisionDate: string;
  court: string;
  circuit: string;
  /** نص القرار */
  text: string;
  notes: string;
  attachments?: Attachment[];
  /** الحقل القديم لملف واحد — يُقرأ عبر attachmentsOf */
  fileUrl?: string;
  fileName?: string;
}

export const decisionsOf = (c: any): CaseDecision[] => (Array.isArray(c?.decisions) ? c.decisions : []);

const newId = () => Math.random().toString(36).slice(2, 10);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#1a9a45]">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 truncate">{children}</dd>
    </div>
  );
}

export default function CaseDecisions({ caseData, onSave, title = "القرارات" }: {
  caseData: any;
  onSave: (list: CaseDecision[]) => Promise<void>;
  /** «قرارات التنفيذ» في طلبات التنفيذ */
  title?: string;
}) {
  const decisions = decisionsOf(caseData);
  const [editing, setEditing] = useState<CaseDecision | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");

  const blank = (): CaseDecision => ({
    id: newId(), decisionNumber: "", decisionDate: "",
    court: caseData?.courtName || "", circuit: caseData?.courtCircle || "",
    text: "", notes: "", attachments: [],
  });

  const remove = async (d: CaseDecision) => {
    if (!confirm(`حذف القرار${d.decisionNumber ? ` رقم ${d.decisionNumber}` : ""}؟`)) return;
    try {
      await onSave(decisions.filter((x) => x.id !== d.id));
    } catch {
      alert("تعذّر حذف القرار");
    }
  };

  const sorted = [...decisions].sort((a, b) => (b.decisionDate || "").localeCompare(a.decisionDate || ""));
  const shown = sorted.filter((d) => matchesAttachmentSearch(attachmentsOf(d), search));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#1a9a45]">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sorted.length > 0 && <AttachmentSearch value={search} onChange={setSearch} />}
          <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90"
            onClick={() => { setEditing(null); setIsFormOpen(true); }}>
            <Plus className="ml-2 h-4 w-4" /> إضافة قرار
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد قرارات مسجلة</p>
      ) : shown.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد مرفقات تطابق «{search}»</p>
      ) : (
        <div className="space-y-3">
          {shown.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-[#bfe3d6] border-r-[5px] border-r-indigo-500 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-8 w-8 shrink-0 rounded-md bg-indigo-500 text-white flex items-center justify-center">
                    <ScrollText size={16} />
                  </span>
                  <h3 className="text-base font-bold text-gray-900 truncate">
                    قرار{d.decisionNumber ? <span dir="ltr"> {d.decisionNumber}</span> : ""}
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => { setEditing(d); setIsFormOpen(true); }}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-200 text-sm font-bold text-[#133B2E] hover:bg-gray-50 transition">
                    <Pencil size={14} /> تعديل
                  </button>
                  <button onClick={() => remove(d)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-red-100 text-sm font-bold text-red-600 hover:bg-red-50 transition">
                    <Trash2 size={14} /> حذف
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2.5 px-4 py-3">
                <Field label="رقم القرار"><span dir="ltr">{d.decisionNumber || "-"}</span></Field>
                <Field label="تاريخ القرار">{formatGregorian(d.decisionDate)}</Field>
                <Field label="المحكمة">{d.court || "-"}</Field>
                <Field label="الدائرة">{d.circuit || "-"}</Field>
              </dl>

              <div className="space-y-2 border-t border-gray-100 px-4 py-2.5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{d.text}</p>
                {d.notes && <p className="whitespace-pre-wrap text-sm text-gray-600"><span className="text-gray-400">ملاحظات: </span>{d.notes}</p>}
                <AttachmentChips files={attachmentsOf(d)} highlight={search} />
              </div>
            </div>
          ))}
        </div>
      )}

      <DecisionForm
        isOpen={isFormOpen}
        initial={editing
          ? { ...editing, court: editing.court || caseData?.courtName || "", circuit: editing.circuit || caseData?.courtCircle || "" }
          : blank()}
        isEdit={!!editing}
        onClose={() => setIsFormOpen(false)}
        onSubmit={async (d) => {
          const exists = decisions.some((x) => x.id === d.id);
          await onSave(exists ? decisions.map((x) => (x.id === d.id ? d : x)) : [...decisions, d]);
          setIsFormOpen(false);
        }}
      />
    </div>
  );
}

function DecisionForm({ isOpen, initial, isEdit, onClose, onSubmit }: {
  isOpen: boolean;
  initial: CaseDecision;
  isEdit: boolean;
  onClose: () => void;
  onSubmit: (d: CaseDecision) => Promise<void>;
}) {
  const [form, setForm] = useState<CaseDecision>(initial);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initial);
    setFiles(attachmentsOf(initial));
    setNewFiles([]);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof CaseDecision>(k: K, v: CaseDecision[K]) => setForm((f) => ({ ...f, [k]: v }));
  const label = "text-sm font-bold text-[#133B2E]";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const attachments = await uploadNewFiles(files, newFiles);
      // الحقل القديم المفرد يُزال — المرفقات كلها في attachments
      const { fileUrl: _u, fileName: _n, ...rest } = form;
      await onSubmit({ ...rest, attachments, decisionNumber: form.decisionNumber.trim() });
    } catch (err: any) {
      console.error("Error saving decision:", err);
      alert("تعذّر حفظ القرار: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">{isEdit ? "تعديل القرار" : "إضافة قرار"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={label}>رقم القرار</label>
              <Input value={form.decisionNumber} onChange={(e) => set("decisionNumber", e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className={label}>تاريخ القرار *</label>
              <Input type="date" required value={form.decisionDate} onChange={(e) => set("decisionDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>المحكمة</label>
              <Input value={form.court} readOnly tabIndex={-1} className="bg-gray-100 text-gray-700 cursor-not-allowed"
                title="تُسحب من بيانات القضية — عدّلها من ملف القضية" />
            </div>
            <div className="space-y-2">
              <label className={label}>الدائرة</label>
              <Input value={form.circuit} readOnly tabIndex={-1} className="bg-gray-100 text-gray-700 cursor-not-allowed"
                title="تُسحب من بيانات القضية — عدّلها من ملف القضية" />
            </div>
          </div>
          <div className="space-y-2">
            <label className={label}>نص القرار *</label>
            <Textarea required rows={4} value={form.text} onChange={(e) => set("text", e.target.value)}
              placeholder="مثال: قررت الدائرة تأجيل نظر الدعوى وندب خبير..." />
          </div>
          <div className="space-y-2">
            <label className={label}>ملاحظات (اختياري)</label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <AttachmentPicker
            label="مرفقات القرار"
            hint="لا توجد مرفقات — أرفق صورة القرار أو المستندات المتعلقة به."
            existing={files}
            onExistingChange={setFiles}
            newFiles={newFiles}
            onNewFilesChange={setNewFiles}
          />

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {saving && newFiles.length ? "جاري رفع المرفقات..." : isEdit ? "حفظ التعديلات" : "إضافة القرار"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
