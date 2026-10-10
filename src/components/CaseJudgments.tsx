/**
 * قسم «الأحكام» — كل حكم بطاقة (نهائي / غير نهائي) برقم الصك وتاريخه، ومرفقات متعددة.
 *
 * الأحكام تُحفظ في `cases/{id}.judgments`. الحقل القديم `finalJudgment` (حكم واحد)
 * يبقى مُزامَناً مع آخر حكم نهائي لأن تقرير الحالة يقرأ منه، وfileUrl/fileName
 * لكل حكم يبقيان مساويين لأول مرفق لنفس السبب.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Eye, Gavel, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { formatGregorian } from "../lib/calendar";
import { COURT_DEGREE_LABELS_AR, type CourtDegree } from "../lib/caseRequests";
import {
  AttachmentChips, AttachmentPicker, AttachmentSearch, attachmentsOf, matchesAttachmentSearch, uploadNewFiles,
  type Attachment, type PendingFile,
} from "./AttachmentPicker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export interface CaseJudgment {
  id: string;
  isFinal: boolean;
  /** رقم الصك */
  deedNumber: string;
  /** تاريخ صك الحكم YYYY-MM-DD */
  judgmentDate: string;
  court: string;
  circuit: string;
  degree: CourtDegree;
  /** انتهاء المدة الاعتراضية — للحكم غير النهائي. YYYY-MM-DD أو فارغ */
  objectionDeadline: string;
  ruling: string;
  details: string;
  /** أول مرفق — للتوافق مع finalJudgment وتقرير الحالة */
  fileUrl: string;
  fileName: string;
  attachments?: Attachment[];
}

/** الأحكام المحفوظة، أو الحكم القديم المفرد محوَّلاً إلى القائمة */
export function judgmentsOf(c: any): CaseJudgment[] {
  if (Array.isArray(c?.judgments)) return c.judgments;
  const f = c?.finalJudgment;
  if (!f) return [];
  return [{
    id: "legacy", isFinal: true, deedNumber: "", judgmentDate: f.judgmentDate || "",
    court: c?.courtName || "", circuit: c?.courtCircle || "", degree: "FIRST", objectionDeadline: "",
    ruling: f.judgmentRuling || "", details: f.judgmentDetails || "",
    fileUrl: f.fileUrl || "", fileName: f.fileName || "",
  }];
}

/** شكل `finalJudgment` القديم من آخر حكم نهائي — أو null إن لم يوجد */
export function legacyFinalJudgment(list: CaseJudgment[]) {
  const latest = list
    .filter((j) => j.isFinal)
    .sort((a, b) => (b.judgmentDate || "").localeCompare(a.judgmentDate || ""))[0];
  if (!latest) return null;
  return {
    judgmentDate: latest.judgmentDate,
    judgmentRuling: latest.ruling,
    judgmentDetails: latest.details,
    fileUrl: latest.fileUrl,
    fileName: latest.fileName,
    updatedAt: new Date().toISOString(),
  };
}

const newId = () => Math.random().toString(36).slice(2, 10);

const addDaysTo = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[#1a9a45]">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 truncate">{children}</dd>
    </div>
  );
}

export default function CaseJudgments({ caseData, onSave, onAnalyze }: {
  caseData: any;
  onSave: (list: CaseJudgment[]) => Promise<void>;
  onAnalyze: (j: CaseJudgment) => void;
}) {
  const judgments = judgmentsOf(caseData);
  const [editing, setEditing] = useState<CaseJudgment | null>(null);
  const [viewing, setViewing] = useState<CaseJudgment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");

  const blank = (): CaseJudgment => ({
    id: newId(), isFinal: false, deedNumber: "", judgmentDate: "",
    court: caseData?.courtName || "", circuit: caseData?.courtCircle || "", degree: "FIRST",
    objectionDeadline: "", ruling: "", details: "", fileUrl: "", fileName: "", attachments: [],
  });

  const remove = async (j: CaseJudgment) => {
    if (!confirm(`حذف الحكم${j.deedNumber ? ` رقم ${j.deedNumber}` : ""}؟`)) return;
    try {
      await onSave(judgments.filter((x) => x.id !== j.id));
    } catch {
      alert("تعذّر حذف الحكم");
    }
  };

  const sorted = [...judgments].sort((a, b) => (b.judgmentDate || "").localeCompare(a.judgmentDate || ""));
  const shown = sorted.filter((j) => matchesAttachmentSearch(attachmentsOf(j), search));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[#1a9a45]">الأحكام</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sorted.length > 0 && <AttachmentSearch value={search} onChange={setSearch} />}
          <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90"
            onClick={() => { setEditing(null); setIsFormOpen(true); }}>
            <Plus className="ml-2 h-4 w-4" /> إضافة حكم
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لم يصدر حكم بعد</p>
      ) : shown.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد مرفقات تطابق «{search}»</p>
      ) : (
        <div className="space-y-3">
          {shown.map((j) => (
            <JudgmentCard key={j.id} j={j} search={search}
              onView={() => setViewing(j)}
              onEdit={() => { setEditing(j); setIsFormOpen(true); }}
              onDelete={() => remove(j)} />
          ))}
        </div>
      )}

      <JudgmentForm
        isOpen={isFormOpen}
        initial={editing
          ? { ...editing, court: editing.court || caseData?.courtName || "", circuit: editing.circuit || caseData?.courtCircle || "" }
          : blank()}
        isEdit={!!editing}
        onClose={() => setIsFormOpen(false)}
        onSubmit={async (j) => {
          const exists = judgments.some((x) => x.id === j.id);
          await onSave(exists ? judgments.map((x) => (x.id === j.id ? j : x)) : [...judgments, j]);
          setIsFormOpen(false);
        }}
      />

      <JudgmentDetails j={viewing} onClose={() => setViewing(null)} onAnalyze={onAnalyze} />
    </div>
  );
}

function JudgmentCard({ j, search, onView, onEdit, onDelete }: {
  j: CaseJudgment; search: string; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const accent = j.isFinal ? "border-r-[#1a9a45]" : "border-r-[#5fb8c2]";
  return (
    <div className={`bg-white rounded-xl border border-[#bfe3d6] border-r-[5px] ${accent} transition hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-8 w-8 shrink-0 rounded-md bg-[#1a9a45] text-white flex items-center justify-center">
            <Gavel size={16} className="-scale-x-100" />
          </span>
          <h3 className="text-base font-bold text-gray-900 truncate">حكم {j.isFinal ? "نهائي" : "غير نهائي"}</h3>
          {!j.isFinal && j.objectionDeadline && (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
              <AlertCircle size={12} /> قابل للاعتراض حتى {formatGregorian(j.objectionDeadline)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onView}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-200 text-sm font-bold text-[#1a9a45] hover:bg-green-50 transition">
            <Eye size={14} /> المنطوق
          </button>
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

      <dl className="grid grid-cols-2 lg:grid-cols-5 gap-x-5 gap-y-2.5 px-4 py-3">
        <Field label="رقم الصك"><span dir="ltr">{j.deedNumber || "-"}</span></Field>
        <Field label="تاريخ الحكم">{formatGregorian(j.judgmentDate)}</Field>
        <Field label="المحكمة">{j.court || "-"}</Field>
        <Field label="الدائرة">{j.circuit || "-"}</Field>
        <Field label="الدرجة">{COURT_DEGREE_LABELS_AR[j.degree] || "-"}</Field>
      </dl>

      <div className="space-y-2 border-t border-gray-100 px-4 py-2.5">
        {j.ruling && <p className="line-clamp-2 text-sm leading-relaxed text-gray-800 font-serif">{j.ruling}</p>}
        <AttachmentChips files={attachmentsOf(j)} highlight={search} />
      </div>
    </div>
  );
}

function JudgmentDetails({ j, onClose, onAnalyze }: {
  j: CaseJudgment | null; onClose: () => void; onAnalyze: (j: CaseJudgment) => void;
}) {
  return (
    <Dialog open={!!j} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
        {j && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#133B2E] flex items-center gap-2">
                <Gavel size={20} className="text-[#1a9a45]" />
                حكم {j.isFinal ? "نهائي" : "غير نهائي"}{j.deedNumber ? ` — صك ${j.deedNumber}` : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3 text-gray-700">
                <p><span className="text-gray-500">تاريخ الحكم: </span>{formatGregorian(j.judgmentDate)}</p>
                <p><span className="text-gray-500">الدرجة: </span>{COURT_DEGREE_LABELS_AR[j.degree]}</p>
                <p><span className="text-gray-500">المحكمة: </span>{j.court || "-"}</p>
                <p><span className="text-gray-500">الدائرة: </span>{j.circuit || "-"}</p>
                {!j.isFinal && j.objectionDeadline && (
                  <p className="col-span-2 text-amber-700 font-bold">انتهاء المدة الاعتراضية: {formatGregorian(j.objectionDeadline)}</p>
                )}
              </div>
              <AttachmentChips files={attachmentsOf(j)} />
              <div className="space-y-1.5">
                <p className="font-bold text-gray-500">منطوق الحكم</p>
                <p className="whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg border border-gray-100 p-3 font-serif">{j.ruling || "—"}</p>
              </div>
              {j.details && (
                <div className="space-y-1.5">
                  <p className="font-bold text-gray-500">أسباب وتفاصيل الحكم</p>
                  <p className="whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg border border-gray-100 p-3">{j.details}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-green-300 text-green-800 hover:bg-green-50"
                onClick={() => { onAnalyze(j); onClose(); }}>
                <Sparkles className="ml-1 h-3.5 w-3.5 text-green-600" /> تحليل بالـ AI
              </Button>
              <Button variant="outline" onClick={onClose}>إغلاق</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function JudgmentForm({ isOpen, initial, isEdit, onClose, onSubmit }: {
  isOpen: boolean;
  initial: CaseJudgment;
  isEdit: boolean;
  onClose: () => void;
  onSubmit: (j: CaseJudgment) => Promise<void>;
}) {
  const [form, setForm] = useState<CaseJudgment>(initial);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initial);
    setFiles(attachmentsOf(initial));
    setNewFiles([]);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof CaseJudgment>(k: K, v: CaseJudgment[K]) => setForm((f) => ({ ...f, [k]: v }));

  // المدة الاعتراضية الافتراضية ٣٠ يوماً من تاريخ الصك — قابلة للتعديل
  const setDate = (date: string) => setForm((f) => ({
    ...f, judgmentDate: date,
    objectionDeadline: !f.isFinal && (!f.objectionDeadline || f.objectionDeadline === addDaysTo(f.judgmentDate, 30))
      ? addDaysTo(date, 30) : f.objectionDeadline,
  }));

  const label = "text-sm font-bold text-[#133B2E]";
  const select = "w-full h-9 px-3 rounded-md border border-gray-300 text-sm bg-white";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const attachments = await uploadNewFiles(files, newFiles);
      await onSubmit({
        ...form, attachments,
        fileUrl: attachments[0]?.url || "", fileName: attachments[0]?.fileName || attachments[0]?.name || "",
        deedNumber: form.deedNumber.trim(),
        objectionDeadline: form.isFinal ? "" : form.objectionDeadline,
      });
    } catch (err: any) {
      console.error("Error saving judgment:", err);
      alert("تعذّر حفظ الحكم: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">{isEdit ? "تعديل الحكم" : "إضافة حكم"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="flex gap-2">
            {[false, true].map((final) => (
              <button type="button" key={String(final)} onClick={() => set("isFinal", final)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition ${
                  form.isFinal === final ? "border-[#1a9a45] bg-green-50 text-[#1a9a45]" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}>
                {final ? "نهائي" : "غير نهائي"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={label}>رقم الصك</label>
              <Input value={form.deedNumber} onChange={(e) => set("deedNumber", e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className={label}>تاريخ الحكم *</label>
              <Input type="date" required value={form.judgmentDate} onChange={(e) => setDate(e.target.value)} />
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
            <div className="space-y-2">
              <label className={label}>الدرجة</label>
              <select className={select} value={form.degree} onChange={(e) => set("degree", e.target.value as CourtDegree)}>
                {(Object.keys(COURT_DEGREE_LABELS_AR) as CourtDegree[]).map((d) => (
                  <option key={d} value={d}>{COURT_DEGREE_LABELS_AR[d]}</option>
                ))}
              </select>
            </div>
            {!form.isFinal && (
              <div className="space-y-2">
                <label className={label}>انتهاء المدة الاعتراضية</label>
                <Input type="date" value={form.objectionDeadline} onChange={(e) => set("objectionDeadline", e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className={label}>منطوق الحكم *</label>
            <Textarea required rows={4} className="font-serif leading-relaxed" value={form.ruling}
              onChange={(e) => set("ruling", e.target.value)} placeholder="اكتب منطوق الحكم كما ورد في الصك..." />
          </div>
          <div className="space-y-2">
            <label className={label}>أسباب وتفاصيل الحكم (اختياري)</label>
            <Textarea rows={3} value={form.details} onChange={(e) => set("details", e.target.value)} />
          </div>

          <AttachmentPicker
            label="مرفقات الحكم"
            hint="لا توجد مرفقات — أرفق صك الحكم والمستندات المتعلقة به."
            existing={files}
            onExistingChange={setFiles}
            newFiles={newFiles}
            onNewFilesChange={setNewFiles}
          />

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {saving && newFiles.length ? "جاري رفع المرفقات..." : isEdit ? "حفظ التعديلات" : "إضافة الحكم"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
