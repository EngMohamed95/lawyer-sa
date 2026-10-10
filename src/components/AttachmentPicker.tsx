/**
 * مرفقات متعددة لسجلات القضية (الطلبات، القرارات، الأحكام).
 * لكل مرفق اسم يكتبه المستخدم وتاريخ — ويمكن البحث فيها.
 * - AttachmentPicker: داخل نموذج الإضافة/التعديل — الملفات الجديدة تُرفع عند الحفظ عبر uploadNewFiles.
 * - AttachmentChips: عرض المرفقات المحفوظة كروابط.
 * - AttachmentSearch + matchesAttachmentSearch: البحث في المرفقات.
 */

import { useRef } from "react";
import { File, Paperclip, Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { uploadFile } from "./CaseClaimSection";
import { formatGregorian } from "../lib/calendar";

export interface Attachment {
  /** الاسم المعروض — يكتبه المستخدم (افتراضياً اسم الملف) */
  name: string;
  url: string;
  /** اسم الملف الأصلي على الجهاز */
  fileName?: string;
  /** تاريخ المستند YYYY-MM-DD */
  date?: string;
}

/** ملف مختار لم يُرفع بعد — مع اسمه وتاريخه */
export interface PendingFile {
  file: File;
  name: string;
  date: string;
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

/** المرفقات المحفوظة — مع دعم الحقل القديم المفرد fileUrl/fileName */
export function attachmentsOf(r: { attachments?: Attachment[]; fileUrl?: string; fileName?: string } | null | undefined): Attachment[] {
  if (Array.isArray(r?.attachments)) return r!.attachments;
  // Firestore يرفض undefined — كل حقل بقيمة صريحة
  return r?.fileUrl ? [{ name: r.fileName || "ملف مرفق", url: r.fileUrl, fileName: r.fileName || "", date: "" }] : [];
}

/** يرفع الملفات الجديدة بالتتابع ويُرجعها مضافة للمحفوظة */
export async function uploadNewFiles(existing: Attachment[], files: PendingFile[]): Promise<Attachment[]> {
  const uploaded: Attachment[] = [];
  for (const p of files) {
    const { url } = await uploadFile(p.file);
    uploaded.push({ name: p.name.trim() || baseName(p.file.name), url, fileName: p.file.name, date: p.date || "" });
  }
  return [...existing, ...uploaded];
}

/** هل في مرفقات السجل ما يطابق نص البحث (الاسم، اسم الملف، التاريخ)؟ */
export function matchesAttachmentSearch(files: Attachment[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return files.some((a) =>
    [a.name, a.fileName, a.date, a.date ? formatGregorian(a.date) : ""]
      .some((v) => (v || "").toLowerCase().includes(q)),
  );
}

export function AttachmentSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="ابحث في المرفقات بالاسم أو التاريخ..."
        className="h-9 w-full rounded-lg border border-gray-200 bg-white pr-9 pl-8 text-sm focus:outline-none focus:border-[#1a9a45] focus:ring-1 focus:ring-[#1a9a45]" />
      {value && (
        <button onClick={() => onChange("")} aria-label="مسح البحث"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function AttachmentChips({ files, highlight = "", numbered = false }: { files: Attachment[]; highlight?: string; numbered?: boolean }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, idx) => {
        const hit = !!highlight.trim() && matchesAttachmentSearch([f], highlight);
        return (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.fileName || f.name}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium hover:underline ${
              hit ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-blue-600 hover:bg-blue-50"
            }`}>
            {numbered ? <span className="shrink-0 font-bold text-gray-500">{idx + 1}.</span> : <File size={13} className="shrink-0 text-green-600" />}
            <span className="truncate">{f.name}</span>
            {f.date && <span className="shrink-0 text-[10px] text-gray-500">· {formatGregorian(f.date)}</span>}
          </a>
        );
      })}
    </div>
  );
}

export function AttachmentPicker({ label = "المرفقات", hint, existing, onExistingChange, newFiles, onNewFilesChange, numbered = false }: {
  label?: string;
  hint?: string;
  existing: Attachment[];
  onExistingChange: (files: Attachment[]) => void;
  newFiles: PendingFile[];
  onNewFilesChange: (files: PendingFile[]) => void;
  /** ترقيم المرفقات بالتسلسل (١، ٢، ٣...) */
  numbered?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const field = "h-8 rounded-md border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:border-[#1a9a45]";

  const editExisting = (i: number, patch: Partial<Attachment>) =>
    onExistingChange(existing.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const editNew = (i: number, patch: Partial<PendingFile>) =>
    onNewFilesChange(newFiles.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-[#133B2E]">{label}</label>
        <input ref={input} type="file" multiple className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).map((file) => ({ file, name: baseName(file.name), date: todayKey() }));
            onNewFilesChange([...newFiles, ...picked]);
            e.target.value = "";
          }} />
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
          <Paperclip className="ml-1.5 h-4 w-4" /> إرفاق ملفات
        </Button>
      </div>

      {existing.length || newFiles.length ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_9rem_1.5rem] gap-2 px-1 text-[11px] font-bold text-gray-500">
            <span>اسم المرفق</span><span>التاريخ</span><span />
          </div>
          {existing.map((a, i) => (
            <div key={a.url} className="grid grid-cols-[1fr_9rem_1.5rem] items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {numbered && <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-500">{i + 1}</span>}
                <a href={a.url} target="_blank" rel="noreferrer" title="فتح الملف" className="shrink-0 text-green-600 hover:text-green-800">
                  <File size={15} />
                </a>
                <input value={a.name} onChange={(e) => editExisting(i, { name: e.target.value })} aria-label="اسم المرفق"
                  className={`${field} min-w-0 flex-1`} />
              </div>
              <input type="date" value={a.date || ""} onChange={(e) => editExisting(i, { date: e.target.value })} aria-label="تاريخ المرفق"
                className={field} />
              <button type="button" aria-label={`إزالة ${a.name}`} title="إزالة"
                onClick={() => onExistingChange(existing.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
            </div>
          ))}
          {newFiles.map((p, i) => (
            <div key={`${p.file.name}-${i}`} className="grid grid-cols-[1fr_9rem_1.5rem] items-center gap-2 rounded-lg border border-dashed border-green-300 bg-green-50/60 p-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {numbered && <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-500">{existing.length + i + 1}</span>}
                <span title={p.file.name} className="shrink-0 text-green-600"><File size={15} /></span>
                <input value={p.name} onChange={(e) => editNew(i, { name: e.target.value })} aria-label="اسم المرفق"
                  placeholder={p.file.name} className={`${field} min-w-0 flex-1`} />
                <span className="shrink-0 text-[10px] font-bold text-green-700">جديد</span>
              </div>
              <input type="date" value={p.date} onChange={(e) => editNew(i, { date: e.target.value })} aria-label="تاريخ المرفق"
                className={field} />
              <button type="button" aria-label={`إزالة ${p.name}`} title="إزالة"
                onClick={() => onNewFilesChange(newFiles.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{hint || "لا توجد مرفقات."}</p>
      )}
    </div>
  );
}
