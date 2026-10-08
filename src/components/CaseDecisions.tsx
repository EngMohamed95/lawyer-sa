/**
 * قسم «القرارات» — قرارات المحكمة أثناء نظر الدعوى (تأجيل، ندب خبير، إحالة...).
 * تُحفظ في `cases/{id}.decisions` بنفس أسلوب الأحكام.
 */

import { useEffect, useState, type FormEvent } from "react";
import { File, Loader2, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { formatHijri } from "../lib/calendar";
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
  fileUrl: string;
  fileName: string;
}

export const decisionsOf = (c: any): CaseDecision[] => (Array.isArray(c?.decisions) ? c.decisions : []);

const newId = () => Math.random().toString(36).slice(2, 10);

export default function CaseDecisions({ caseData, onSave }: {
  caseData: any;
  onSave: (list: CaseDecision[]) => Promise<void>;
}) {
  const decisions = decisionsOf(caseData);
  const [editing, setEditing] = useState<CaseDecision | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const blank = (): CaseDecision => ({
    id: newId(), decisionNumber: "", decisionDate: "",
    court: caseData?.courtName || "", circuit: caseData?.courtCircle || "",
    text: "", notes: "", fileUrl: "", fileName: "",
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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1a9a45]">القرارات</h2>
        <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90"
          onClick={() => { setEditing(null); setIsFormOpen(true); }}>
          <Plus className="ml-2 h-4 w-4" /> إضافة قرار
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-lg">لا توجد قرارات مسجلة</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((d) => (
            <div key={d.id} className="rounded-xl border border-gray-200 border-r-[5px] border-r-[#1a9a45] bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <ScrollText size={22} className="text-[#1a9a45]" />
                  <div>
                    <p className="font-bold text-gray-900">
                      قرار{d.decisionNumber ? <span dir="ltr"> {d.decisionNumber}</span> : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatHijri(d.decisionDate)}
                      {(d.court || d.circuit) && ` — ${[d.court, d.circuit].filter(Boolean).join(" / ")}`}
                    </p>
                  </div>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-gray-200">
                  <button onClick={() => { setEditing(d); setIsFormOpen(true); }} aria-label="تعديل" title="تعديل"
                    className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-50">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(d)} aria-label="حذف" title="حذف"
                    className="border-r border-gray-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">{d.text}</p>
              {d.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600"><span className="text-gray-500">ملاحظات: </span>{d.notes}</p>}
              {d.fileName && (
                <a href={d.fileUrl} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 underline">
                  <File size={14} className="text-green-600" /> {d.fileName}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <DecisionForm
        isOpen={isFormOpen}
        initial={editing ?? blank()}
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
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (isOpen) { setForm(initial); setFile(null); } }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof CaseDecision>(k: K, v: CaseDecision[K]) => setForm((f) => ({ ...f, [k]: v }));
  const label = "text-sm font-bold text-[#133B2E]";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let { fileUrl, fileName } = form;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/upload.php", { method: "POST", body: fd });
        if (!res.ok) throw new Error("فشل رفع ملف القرار");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        fileUrl = json.fileUrl;
        fileName = file.name;
      }
      await onSubmit({ ...form, fileUrl, fileName, decisionNumber: form.decisionNumber.trim() });
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
              <Input value={form.court} onChange={(e) => set("court", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={label}>الدائرة</label>
              <Input value={form.circuit} onChange={(e) => set("circuit", e.target.value)} />
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
          <div className="space-y-2">
            <label className={label}>ملف القرار (PDF / صورة)</label>
            <Input type="file" className="bg-white" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {form.fileName && !file && <p className="text-xs text-gray-500">الملف الحالي: {form.fileName}</p>}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={saving} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {isEdit ? "حفظ التعديلات" : "إضافة القرار"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
