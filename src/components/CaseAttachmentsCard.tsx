/**
 * مرفقات القضية/الطلب — قائمة مرقّمة بالتسلسل، لكل مرفق اسم وتاريخ.
 * تُحفظ في `cases/{id}.attachments` وتُدار من نافذة واحدة (إضافة، إعادة تسمية، حذف).
 */

import { useState } from "react";
import { File, Loader2, Paperclip } from "lucide-react";
import { formatGregorian } from "../lib/calendar";
import { AttachmentPicker, AttachmentSearch, attachmentsOf, matchesAttachmentSearch, uploadNewFiles, type Attachment, type PendingFile } from "./AttachmentPicker";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

export default function CaseAttachmentsCard({ caseData, title = "مرفقات الطلب", onSave }: {
  caseData: any;
  title?: string;
  onSave: (attachments: Attachment[]) => Promise<void>;
}) {
  const files = attachmentsOf(caseData);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const openEditor = () => { setDraft(files); setPending([]); setOpen(true); };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(await uploadNewFiles(draft, pending));
      setOpen(false);
    } catch (err: any) {
      alert("تعذّر حفظ المرفقات: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="shadow-sm md:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <CardTitle className="text-lg">{title} <span className="text-sm font-normal text-gray-400">({files.length})</span></CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {files.length > 2 && <AttachmentSearch value={search} onChange={setSearch} />}
          <Button size="sm" variant="outline" onClick={openEditor}>
            <Paperclip className="ml-1.5 h-4 w-4" /> {files.length ? "إدارة المرفقات" : "إضافة مرفقات"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">لا توجد مرفقات بعد.</p>
        ) : (
          <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {files.map((f, i) => ({ f, i })).filter(({ f }) => matchesAttachmentSearch([f], search)).map(({ f, i }) => (
              <li key={f.url} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#133B2E] text-xs font-bold text-[#D4AF37]">{i + 1}</span>
                <File size={16} className="shrink-0 text-green-600" />
                <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-bold text-blue-700 hover:underline">{f.name}</a>
                <span className="shrink-0 text-sm text-gray-500">{f.date ? formatGregorian(f.date) : "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#133B2E]">{title}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <AttachmentPicker
              label="المرفقات (مرقّمة بالتسلسل)"
              hint="لا توجد مرفقات — اضغط «إرفاق ملفات»."
              existing={draft}
              onExistingChange={setDraft}
              newFiles={pending}
              onNewFilesChange={setPending}
              numbered
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={saving} onClick={save} className="bg-[#133B2E] text-white hover:bg-[#133B2E]/90">
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {saving && pending.length ? "جاري رفع المرفقات..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
