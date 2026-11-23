/**
 * مدير المنصة: نقل ملفات المكاتب القديمة من مجلد uploads/ العام إلى التخزين المشفّر.
 * آمن للتكرار — الملف المنقول ما ينتقل مرتين، والأصل ما ينحذف إلا بعد التأكد من النسخة المشفرة.
 */

import { useState } from "react";
import { Lock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { migrateLegacyUploads, type LegacyMigrationResult } from "../lib/files";

type Result = Awaited<ReturnType<typeof migrateLegacyUploads>>;

export default function LegacyFilesMigrationCard({ className = "" }: { className?: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<LegacyMigrationResult | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (!confirm("نقل كل ملفات المكاتب القديمة إلى التخزين المشفّر؟ الروابط في القضايا تتحدث تلقائياً، والأصل يُحذف بعد التأكد من كل نسخة.")) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      setResult(await migrateLegacyUploads(setProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إكمال النقل. أعد المحاولة — النقل يكمل من حيث توقف.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Lock size={20} className="text-emerald-600" /> تأمين ملفات المكاتب القديمة</h2>
          <p className="mt-1 text-sm text-gray-600">ينقل الملفات المرفوعة قبل التشفير (مجلد uploads العام) إلى التخزين المشفّر، ويحدّث روابطها، ثم يقفل المجلد.</p>
        </div>
        <button type="button" onClick={() => void run()} disabled={running}
          className="flex shrink-0 items-center gap-2 self-start rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60">
          {running ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} {running ? "جارٍ النقل…" : "ابدأ النقل والتشفير"}
        </button>
      </div>
      {running && progress && (
        <p className="mt-3 text-sm text-gray-600">فُحص {progress.scanned} مستند · نُقل {progress.filesMigrated} ملف · حُدّث {progress.docsUpdated} مستند</p>
      )}
      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div>
            اكتمل: نُقل وشُفّر {result.filesMigrated} ملف، وحُدّث {result.docsUpdated} مستند، وحُذف {result.deleted} أصل بعد التأكد منه، وأُقفل مجلد uploads.
            {result.missing > 0 && <div className="text-amber-700">{result.missing} رابط لملف غير موجود على السيرفر (ظل كما هو).</div>}
            {result.keptUnverified > 0 && <div className="text-red-700">{result.keptUnverified} ملف ما تأكدنا من نسخته المشفرة فما حُذف أصله — أعد التشغيل.</div>}
            {result.unreferencedLocked > 0 && <div className="text-gray-500">{result.unreferencedLocked} ملف قديم لا يذكره أي مستند — بقي في المجلد المقفل.</div>}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16} /> {error}</div>
      )}
    </div>
  );
}
