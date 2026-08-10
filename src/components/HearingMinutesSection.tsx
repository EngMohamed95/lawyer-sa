import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "./ui/button";

interface MinutesFile {
  id: string;
  url: string;
  name: string;
  uploadedAt: string;
}

interface HearingMinutesSectionProps {
  hearing: any;
  onUpdated: (patch: Partial<{ minutesFiles: MinutesFile[] }>) => Promise<void>;
}

export default function HearingMinutesSection({ hearing, onUpdated }: HearingMinutesSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const minutesFiles: MinutesFile[] = hearing.minutesFiles || [];
  // الملف القديم من نموذج إضافة/تعديل الجلسة — يُعرض ضمن نفس القائمة إن وُجد ولم يُنقل بعد
  const legacyFile: MinutesFile | null =
    hearing.minutesFileUrl && !minutesFiles.some((f) => f.url === hearing.minutesFileUrl)
      ? {
          id: "legacy",
          url: hearing.minutesFileUrl,
          name: hearing.minutesFileName || "محضر الضبط",
          uploadedAt: hearing.createdAt || "",
        }
      : null;

  const allFiles = legacyFile ? [legacyFile, ...minutesFiles] : minutesFiles;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/upload.php", { method: "POST", body: fd });
      if (!res.ok) throw new Error("فشل رفع الملف");
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      const newFile: MinutesFile = {
        id: crypto.randomUUID(),
        url: json.fileUrl,
        name: file.name,
        uploadedAt: new Date().toISOString(),
      };
      await onUpdated({ minutesFiles: [...minutesFiles, newFile] });
    } catch (err: any) {
      console.error(err);
      setError("تعذّر رفع الملف: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async (id: string) => {
    if (id === "legacy") return; // الملف القديم مرتبط بحقول الجلسة الأصلية، لا يُحذف من هنا
    await onUpdated({ minutesFiles: minutesFiles.filter((f) => f.id !== id) });
  };

  return (
    <div className="space-y-3" dir="rtl">
      {hearing.minutesText && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50/60 border border-gray-100 rounded-2xl p-4">
          {hearing.minutesText}
        </p>
      )}

      {allFiles.length === 0 ? (
        <p className="text-sm text-gray-400">لا توجد محاضر ضبط مرفوعة لهذه الجلسة بعد</p>
      ) : (
        <div className="space-y-2">
          {allFiles.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                <a href={f.url} target="_blank" rel="noreferrer" download className="text-sm text-blue-700 hover:underline truncate">
                  {f.name}
                </a>
              </div>
              {f.id !== "legacy" && (
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  className="text-gray-400 hover:text-red-600 shrink-0"
                  title="إزالة من القائمة"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="border-gray-200 text-gray-700 hover:bg-gray-50"
      >
        {uploading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}
        {uploading ? "جاري الرفع..." : "رفع محضر جديد"}
      </Button>
    </div>
  );
}
