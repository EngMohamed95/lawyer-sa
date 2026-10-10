/**
 * قسم نصّي بمرفقات داخل «موضوع الدعوى» — يُستخدم لأسانيد الدعوى وطلبات الدعوى.
 * يُحفظ في حقل واحد بالقضية: { text, attachments: [{ name, url }] }.
 * المرفقات تُرفع عبر upload.php مثل بقية ملفات القضية.
 */

import { useEffect, useRef, useState } from "react";
import { File, Loader2, Paperclip, Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export interface ClaimAttachment {
  name: string;
  url: string;
}

export interface ClaimSectionValue {
  text: string;
  attachments: ClaimAttachment[];
}

export const claimSectionOf = (v: any): ClaimSectionValue => ({
  text: typeof v?.text === "string" ? v.text : "",
  attachments: Array.isArray(v?.attachments) ? v.attachments : [],
});

/** يرفع ملفاً عبر upload.php ويرجع اسمه ورابطه — مشترك مع مرفقات الطلبات */
export async function uploadFile(file: File): Promise<ClaimAttachment> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/upload.php", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`فشل رفع ${file.name}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return { name: file.name, url: json.fileUrl };
}

export default function CaseClaimSection({ title, placeholder, emptyText, value, onSave }: {
  title: string;
  placeholder: string;
  emptyText: string;
  value: ClaimSectionValue;
  onSave: (v: ClaimSectionValue) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value.text);
  const [busy, setBusy] = useState<"" | "save" | "upload">("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setText(value.text); }, [value.text, editing]);

  const saveText = async () => {
    setBusy("save");
    try {
      await onSave({ ...value, text: text.trim() });
      setEditing(false);
    } catch {
      alert(`تعذّر حفظ ${title}`);
    } finally {
      setBusy("");
    }
  };

  // الرفع بالتتابع — وما رُفع قبل أي فشل يُحفظ ولا يضيع
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    const uploaded: ClaimAttachment[] = [];
    try {
      for (const f of Array.from(files)) uploaded.push(await uploadFile(f));
    } catch (err: any) {
      alert("تعذّر رفع بعض الملفات: " + (err?.message || ""));
    }
    try {
      if (uploaded.length) await onSave({ ...value, attachments: [...value.attachments, ...uploaded] });
    } catch {
      alert("تعذّر حفظ المرفقات");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeFile = async (a: ClaimAttachment) => {
    if (!confirm(`حذف المرفق "${a.name}"؟`)) return;
    try {
      await onSave({ ...value, attachments: value.attachments.filter((x) => x.url !== a.url) });
    } catch {
      alert("تعذّر حذف المرفق");
    }
  };

  return (
    <Card className="shadow-sm md:col-span-2">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex gap-2">
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => fileInput.current?.click()}>
            {busy === "upload" ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Paperclip className="ml-1.5 h-4 w-4" />}
            إرفاق ملفات
          </Button>
          {!editing && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setEditing(true)}>
              <Pencil className="ml-1.5 h-4 w-4" /> {value.text ? "تعديل" : "إضافة"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="leading-relaxed" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={busy === "save"} onClick={() => { setText(value.text); setEditing(false); }}>إلغاء</Button>
              <Button size="sm" disabled={busy === "save"} onClick={saveText} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
                {busy === "save" ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Save className="ml-1.5 h-4 w-4" />} حفظ
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100 font-medium">
            {value.text || emptyText}
          </p>
        )}

        {value.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.attachments.map((a) => (
              <span key={a.url} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1.5 pr-2.5 pl-1.5 text-sm">
                <File size={14} className="shrink-0 text-green-600" />
                <a href={a.url} target="_blank" rel="noreferrer" className="truncate font-medium text-blue-600 hover:underline">{a.name}</a>
                <button onClick={() => removeFile(a)} aria-label={`حذف ${a.name}`} title="حذف المرفق"
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
