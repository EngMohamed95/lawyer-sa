/**
 * قسم «الأحكام» بتصميم ناجز — كل حكم بطاقة (نهائي / غير نهائي) برقم الصك وتاريخه.
 *
 * الأحكام تُحفظ في `cases/{id}.judgments`. الحقل القديم `finalJudgment` (حكم واحد)
 * يبقى مُزامَناً مع آخر حكم نهائي لأن تبويب التنفيذ وتقرير الحالة يقرآن منه.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle, EllipsisVertical, Eye, File, Gavel, Loader2, Pencil, Plus, Sparkles, Trash2,
} from "lucide-react";
import { formatHijri } from "../lib/calendar";
import { COURT_DEGREE_LABELS_AR, type CourtDegree } from "../lib/caseRequests";
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
  fileUrl: string;
  fileName: string;
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

export default function CaseJudgments({ caseData, onSave, onAnalyze }: {
  caseData: any;
  onSave: (list: CaseJudgment[]) => Promise<void>;
  onAnalyze: (j: CaseJudgment) => void;
}) {
  const judgments = judgmentsOf(caseData);
  const [editing, setEditing] = useState<CaseJudgment | null>(null);
  const [viewing, setViewing] = useState<CaseJudgment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const blank = (): CaseJudgment => ({
    id: newId(), isFinal: false, deedNumber: "", judgmentDate: "",
    court: caseData?.courtName || "", circuit: caseData?.courtCircle || "", degree: "FIRST",
    objectionDeadline: "", ruling: "", details: "", fileUrl: "", fileName: "",
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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1a9a45]">الأحكام</h2>
        <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90"
          onClick={() => { setEditing(null); setIsFormOpen(true); }}>
          <Plus className="ml-2 h-4 w-4" /> إضافة حكم
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لم يصدر حكم بعد</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((j) => (
            <JudgmentCard key={j.id} j={j}
              onView={() => setViewing(j)}
              onEdit={() => { setEditing(j); setIsFormOpen(true); }}
              onDelete={() => remove(j)} />
          ))}
        </div>
      )}

      <JudgmentForm
        isOpen={isFormOpen}
        initial={editing ?? blank()}
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 items-baseline">
      <dt className="text-sm text-[#1a9a45]">{label}</dt>
      <dd className="text-sm text-gray-900 truncate">{children}</dd>
    </div>
  );
}

function JudgmentCard({ j, onView, onEdit, onDelete }: {
  j: CaseJudgment; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const item = "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50";

  return (
    <div className={`flex flex-col bg-white rounded-lg border-2 transition hover:shadow-md ${
      j.isFinal ? "border-[#1a9a45]" : "border-[#9fd6dc]"
    }`}>
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <Gavel size={26} className="text-[#1a9a45] -scale-x-100" />
          <h3 className="text-lg font-bold text-gray-900">{j.isFinal ? "نهائي" : "غير نهائي"}</h3>
        </div>
        <div className="flex items-center gap-1">
          {!j.isFinal && (
            <span title={j.objectionDeadline ? `قابل للاعتراض حتى ${formatHijri(j.objectionDeadline)}` : "حكم غير نهائي — قابل للاعتراض"}
              className="text-gray-500">
              <AlertCircle size={20} />
            </span>
          )}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} aria-label="إجراءات الحكم"
              className="h-8 w-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100">
              <EllipsisVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-9 z-10 w-36 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                <button onClick={() => { setMenuOpen(false); onView(); }} className={`${item} text-gray-700`}>
                  <Eye size={14} /> عرض المنطوق
                </button>
                <button onClick={() => { setMenuOpen(false); onEdit(); }} className={`${item} text-gray-700`}>
                  <Pencil size={14} /> تعديل
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(); }} className={`${item} text-red-600 hover:bg-red-50`}>
                  <Trash2 size={14} /> حذف
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <button onClick={onView} className="text-right">
        <dl className="px-4 py-3 space-y-2">
          <Row label="رقم الصك">{j.deedNumber || "-"}</Row>
          <Row label="تاريخ صك الحكم">{formatHijri(j.judgmentDate)}</Row>
          <Row label="المحكمة">{j.court || "-"}</Row>
          <Row label="الدائرة">{j.circuit || "-"}</Row>
        </dl>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-xs">
        <span className="text-[#1a9a45]/80">{COURT_DEGREE_LABELS_AR[j.degree] || ""}</span>
        {!j.isFinal && j.objectionDeadline && (
          <span className="text-gray-500">
            <span className="text-[#1a9a45]">انتهاء المدة الاعتراضية</span> {formatHijri(j.objectionDeadline)}
          </span>
        )}
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
                <p><span className="text-gray-500">تاريخ الصك: </span>{formatHijri(j.judgmentDate)}</p>
                <p><span className="text-gray-500">الدرجة: </span>{COURT_DEGREE_LABELS_AR[j.degree]}</p>
                <p><span className="text-gray-500">المحكمة: </span>{j.court || "-"}</p>
                <p><span className="text-gray-500">الدائرة: </span>{j.circuit || "-"}</p>
                {!j.isFinal && j.objectionDeadline && (
                  <p className="col-span-2 text-amber-700 font-bold">انتهاء المدة الاعتراضية: {formatHijri(j.objectionDeadline)}</p>
                )}
              </div>
              {j.fileName && (
                <a href={j.fileUrl} target="_blank" rel="noreferrer" download
                  className="flex items-center gap-2 text-blue-600 underline font-semibold">
                  <File size={15} className="text-green-600" /> {j.fileName}
                </a>
              )}
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
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (isOpen) { setForm(initial); setFile(null); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let { fileUrl, fileName } = form;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع صك الحكم");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        fileUrl = json.fileUrl;
        fileName = file.name;
      }
      await onSubmit({
        ...form, fileUrl, fileName,
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
              <label className={label}>تاريخ صك الحكم *</label>
              <Input type="date" required value={form.judgmentDate} onChange={(e) => setDate(e.target.value)} />
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
          <div className="space-y-2">
            <label className={label}>ملف صك الحكم (PDF / صورة)</label>
            <Input type="file" className="bg-white" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {form.fileName && !file && <p className="text-xs text-gray-500">الملف الحالي: {form.fileName}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {isEdit ? "حفظ التعديلات" : "إضافة الحكم"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
