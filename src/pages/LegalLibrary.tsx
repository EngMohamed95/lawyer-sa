import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Search, Copy, Printer, Check, Plus, Pencil, Trash2, Lock,
  ExternalLink, Loader2, ScrollText, Gavel, FileText, Crown, AlertTriangle,
  Upload, Download, Paperclip, X, FileType2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { useAuthSession } from "../lib/useAuthSession";
import {
  EMPTY_LIBRARY_ITEM, LIBRARY_FILE_ACCEPT, LIBRARY_LIMITS, LIBRARY_TYPES, LIBRARY_TYPE_PLURALS,
  addLibraryItem, deleteLibraryFile, deleteLibraryItem, downloadLibraryFile, fetchLibraryFile,
  formatFileSize, libraryFileKind, updateLibraryItem, uploadLibraryFile, validateLibraryFile,
  watchMyLibrary,
  type LibraryFile, type LibraryItem, type LibraryItemInput, type LibraryItemType,
} from "../lib/legalLibrary";

const TYPE_ORDER: LibraryItemType[] = ["REGULATION", "DECISION", "CIRCULAR", "ROYAL_ORDER"];

const TYPE_STYLE: Record<LibraryItemType, { icon: React.ReactNode; badge: string }> = {
  REGULATION: { icon: <BookOpen size={20} />, badge: "border-blue-200 text-blue-700 bg-blue-50/60" },
  DECISION: { icon: <Gavel size={20} />, badge: "border-emerald-200 text-emerald-700 bg-emerald-50/60" },
  CIRCULAR: { icon: <ScrollText size={20} />, badge: "border-violet-200 text-violet-700 bg-violet-50/60" },
  ROYAL_ORDER: { icon: <Crown size={20} />, badge: "border-amber-200 text-amber-700 bg-amber-50/60" },
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function highlightText(text: string, search: string): React.ReactNode {
  const term = search.trim();
  if (!term) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-yellow-100 text-gray-900 font-bold px-0.5 rounded">{part}</mark>
      : part,
  );
}

function metaLine(item: LibraryItemInput): string {
  return [
    item.number && `رقم ${item.number}`,
    item.issueDate && `بتاريخ ${item.issueDate}`,
    item.issuer && `صادر عن ${item.issuer}`,
  ].filter(Boolean).join(" · ");
}

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function FileChip({ file }: { file: LibraryFile }) {
  const kind = libraryFileKind(file);
  const color = kind === "pdf" ? "text-red-600 bg-red-50 border-red-100" : "text-blue-700 bg-blue-50 border-blue-100";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold border rounded-lg px-2 py-1 max-w-full ${color}`}>
      <FileType2 size={13} className="shrink-0" />
      <span className="truncate" dir="auto">{file.name}</span>
      <span className="opacity-70 shrink-0">· {formatFileSize(file.size)}</span>
    </span>
  );
}

/** عرض الملف داخل الصفحة: PDF عبر عارض المتصفح، و Word (.docx) بتحويله إلى HTML */
function FileViewer({ file, onDownload }: { file: LibraryFile; onDownload: () => void }) {
  const kind = libraryFileKind(file);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unsupported">(
    kind === "doc" || kind === "other" ? "unsupported" : "loading",
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "pdf" && kind !== "docx") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setState("loading");
    (async () => {
      try {
        const blob = await fetchLibraryFile(file);
        if (cancelled) return;
        if (kind === "pdf") {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
          setPdfUrl(objectUrl);
        } else {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          if (cancelled) return;
          setDocHtml(result.value);
        }
        setState("ready");
      } catch (err) {
        console.error("تعذّر عرض الملف:", err);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading") {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
        <Loader2 className="animate-spin" size={28} /> جارٍ تحميل الملف...
      </div>
    );
  }
  if (state === "unsupported" || state === "error") {
    return (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 text-center text-gray-500 text-sm px-6">
        <FileType2 size={42} className="text-gray-300" />
        <span className="font-bold">
          {state === "error"
            ? "تعذّر عرض الملف هنا."
            : "لا يمكن عرض ملفات Word القديمة (.doc) داخل الصفحة."}
        </span>
        <span>يمكنك تحميله وفتحه على جهازك.</span>
        <Button onClick={onDownload} className="bg-navy hover:bg-navy/90 text-white font-bold gap-1.5">
          <Download size={15} /> تحميل الملف
        </Button>
      </div>
    );
  }
  if (kind === "pdf" && pdfUrl) {
    return <iframe src={pdfUrl} title={file.name} className="w-full h-full min-h-[60vh] border-0 bg-white" />;
  }
  // HTML المحوَّل من Word يُعرض في إطار معزول بلا سكربتات
  return (
    <iframe
      sandbox=""
      title={file.name}
      className="w-full h-full min-h-[60vh] border-0 bg-white"
      srcDoc={`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
        body{font-family:'IBM Plex Sans Arabic','Tajawal',Arial,sans-serif;line-height:1.9;color:#1f2937;padding:24px 32px;max-width:900px;margin:auto}
        img{max-width:100%} table{border-collapse:collapse} td,th{border:1px solid #ddd;padding:4px 8px}
      </style></head><body>${docHtml ?? ""}</body></html>`}
    />
  );
}

export default function LegalLibrary() {
  const session = useAuthSession();
  const uid = session.user?.uid ?? null;

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"ALL" | LibraryItemType>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [reading, setReading] = useState<LibraryItem | null>(null);
  const [readerView, setReaderView] = useState<"file" | "text">("file");
  const [readerSearch, setReaderSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LibraryItemInput>(EMPTY_LIBRARY_ITEM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** ملف جديد اختاره المستخدم ولم يُرفع بعد */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** الملف المحفوظ لحظة فتح نافذة التعديل — هو وحده المرشّح للحذف عند الاستبدال */
  const [originalFile, setOriginalFile] = useState<LibraryFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  useEffect(() => {
    if (session.state === "checking") return;
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return watchMyLibrary(
      uid,
      (next) => {
        setItems(next);
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        console.error("تعذّر تحميل المكتبة القانونية:", err);
        setLoadError("تعذّر تحميل مكتبتك. تحقق من الاتصال ثم أعد المحاولة.");
        setLoading(false);
      },
    );
  }, [uid, session.state]);

  // إبقاء نافذة القراءة متزامنة مع آخر نسخة بعد التعديل
  useEffect(() => {
    if (!reading) return;
    const fresh = items.find((i) => i.id === reading.id);
    if (!fresh) setReading(null);
    else if (fresh !== reading) setReading(fresh);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length };
    for (const t of TYPE_ORDER) c[t] = items.filter((i) => i.type === t).length;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab !== "ALL" && item.type !== activeTab) return false;
      if (!q) return true;
      return [item.title, item.number, item.issuer, item.issueDate, item.summary, item.content, item.file?.name]
        .some((f) => (f || "").toLowerCase().includes(q));
    });
  }, [items, activeTab, searchQuery]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_LIBRARY_ITEM, type: activeTab === "ALL" ? "REGULATION" : activeTab });
    setOriginalFile(null);
    setPendingFile(null);
    setUploadProgress(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (item: LibraryItem) => {
    setEditingId(item.id);
    setForm({
      type: item.type, title: item.title, number: item.number, issueDate: item.issueDate,
      issuer: item.issuer, summary: item.summary, content: item.content, sourceUrl: item.sourceUrl,
      file: item.file ?? null,
    });
    setOriginalFile(item.file ?? null);
    setPendingFile(null);
    setUploadProgress(null);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    if (!form.title.trim()) {
      setFormError("العنوان مطلوب.");
      return;
    }
    if (form.sourceUrl.trim() && !isSafeUrl(form.sourceUrl)) {
      setFormError("رابط المصدر يجب أن يبدأ بـ https:// أو http://");
      return;
    }
    setSaving(true);
    setFormError(null);
    const previousFile = editingId ? originalFile : null;
    let uploaded: LibraryFile | null = null;
    try {
      if (pendingFile) {
        setUploadProgress(0);
        uploaded = await uploadLibraryFile(uid, pendingFile, setUploadProgress);
      }
      const payload: LibraryItemInput = { ...form, file: uploaded ?? form.file };
      if (editingId) await updateLibraryItem(editingId, payload);
      else await addLibraryItem(uid, payload);
      // الملف القديم استُبدل أو أُزيل — نحذفه من التخزين
      if (previousFile && previousFile.path !== payload.file?.path) {
        deleteLibraryFile(previousFile).catch((err) => console.warn("تعذّر حذف الملف القديم:", err));
      }
      setFormOpen(false);
    } catch (err) {
      console.error("تعذّر حفظ المادة في المكتبة:", err);
      if (uploaded) deleteLibraryFile(uploaded).catch(() => undefined);
      setFormError(
        pendingFile && !uploaded
          ? "تعذّر رفع الملف. تحقق من الاتصال ثم أعد المحاولة."
          : "تعذّر الحفظ. تحقق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const handlePickFile = (file: File | undefined) => {
    if (!file) return;
    const error = validateLibraryFile(file);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setPendingFile(file);
    if (!form.title.trim()) {
      setForm((f) => ({ ...f, title: file.name.replace(/\.[^.]+$/, "").slice(0, LIBRARY_LIMITS.title) }));
    }
  };

  const handleDownload = async (file: LibraryFile) => {
    setDownloadingPath(file.path);
    try {
      await downloadLibraryFile(file);
    } catch (err) {
      console.error("تعذّر تحميل الملف:", err);
      alert("تعذّر تحميل الملف. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setDownloadingPath(null);
    }
  };

  const openReader = (item: LibraryItem) => {
    setReading(item);
    setReaderSearch("");
    setReaderView(item.file ? "file" : "text");
  };

  const handleDelete = async (item: LibraryItem) => {
    if (!confirm(`هل أنت متأكد من حذف "${item.title}" من مكتبتك؟ لا يمكن التراجع عن الحذف.`)) return;
    setDeletingId(item.id);
    try {
      await deleteLibraryItem(item);
      if (reading?.id === item.id) setReading(null);
    } catch (err) {
      console.error("تعذّر حذف المادة:", err);
      alert("تعذّر الحذف. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = (item: LibraryItem) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const meta = metaLine(item);
    w.document.write(`
      <html dir="rtl">
        <head>
          <title>${escapeHtml(item.title)}</title>
          <style>
            body { font-family: 'IBM Plex Sans Arabic', 'Tajawal', sans-serif; padding: 40px; line-height: 1.9; color: #192a56; }
            h1 { text-align: center; border-bottom: 3px solid #273c75; padding-bottom: 12px; }
            .meta { text-align: center; color: #555; font-size: 11pt; }
            .summary { background: #f6f7fb; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 11pt; }
            .content { white-space: pre-wrap; text-align: justify; font-size: 12pt; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(LIBRARY_TYPES[item.type])}: ${escapeHtml(item.title)}</h1>
          ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
          ${item.summary ? `<div class="summary">${escapeHtml(item.summary)}</div>` : ""}
          <div class="content">${escapeHtml(item.content || "")}</div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const tabs: { id: "ALL" | LibraryItemType; label: string }[] = [
    { id: "ALL", label: "الكل" },
    ...TYPE_ORDER.map((t) => ({ id: t, label: LIBRARY_TYPE_PLURALS[t] })),
  ];

  const readerHasMatch =
    !readerSearch.trim() ||
    (reading?.content || "").toLowerCase().includes(readerSearch.trim().toLowerCase());

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans_Arabic']" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight">مكتبتي القانونية</h1>
          <p className="text-gray-500 mt-1 text-sm">
            محفظتك الخاصة من الأنظمة والقرارات والتعاميم والأوامر السامية
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-bold">
            <Lock size={14} />
            <span>خاصة بك — لا يطّلع عليها أي مستخدم آخر</span>
          </div>
          <Button
            onClick={openAdd}
            disabled={!uid}
            className="bg-navy hover:bg-navy/90 text-white font-bold gap-1.5"
          >
            <Plus size={16} /> إضافة إلى مكتبتي
          </Button>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="relative md:col-span-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="ابحث بالعنوان أو الرقم أو الجهة أو النص..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-4 pr-10 py-2 border border-gray-200 rounded-xl text-sm bg-surface shadow-3xs"
          />
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2 justify-start md:justify-end">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-3xs border flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "bg-navy text-white border-edge"
                  : "bg-surface text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-gray-100"}`}>
                {counts[tab.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 flex justify-center text-gray-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : loadError ? (
        <div className="py-10 text-center text-red-600 font-bold bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center gap-2">
          <AlertTriangle size={28} />
          <span>{loadError}</span>
        </div>
      ) : !uid ? (
        <div className="py-16 text-center text-gray-500 font-bold bg-surface rounded-2xl border border-gray-100">
          يجب تسجيل الدخول لعرض مكتبتك.
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center bg-surface rounded-2xl border border-dashed border-gray-200 flex flex-col items-center gap-3">
          <BookOpen size={48} className="text-gray-300" />
          <span className="font-bold text-ink">مكتبتك فارغة</span>
          <span className="text-sm text-gray-500 max-w-md">
            أضف الأنظمة والقرارات والتعاميم والأوامر السامية التي تحتاجها في عملك، وستجدها هنا وحدك متى احتجتها.
          </span>
          <Button onClick={openAdd} className="bg-navy hover:bg-navy/90 text-white font-bold gap-1.5 mt-2">
            <Plus size={16} /> أضف أول مادة
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400 font-bold bg-surface rounded-2xl border border-gray-100 flex flex-col items-center gap-3">
          <Search size={40} className="opacity-30" />
          <span>لا توجد نتائج تطابق البحث</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((item) => {
            const style = TYPE_STYLE[item.type] ?? TYPE_STYLE.REGULATION;
            const meta = metaLine(item);
            return (
              <Card key={item.id} className="shadow-xs border-gray-200/80 hover:shadow-md transition-all duration-300 bg-surface flex flex-col justify-between group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-navy group-hover:text-white transition-colors duration-300">
                      {style.icon}
                    </div>
                    <Badge variant="outline" className={`font-bold text-[11px] ${style.badge}`}>
                      {LIBRARY_TYPES[item.type]}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-black text-ink mt-3 break-words">
                    {highlightText(item.title, searchQuery)}
                  </CardTitle>
                  {meta && <p className="text-[11px] text-gray-500 font-semibold mt-1">{meta}</p>}
                  {item.summary && (
                    <CardDescription className="text-gray-500 text-xs leading-relaxed mt-2 line-clamp-3">
                      {item.summary}
                    </CardDescription>
                  )}
                  {item.file && <div className="mt-3"><FileChip file={item.file} /></div>}
                </CardHeader>

                <CardContent className="pt-3 pb-4 flex gap-2 border-t border-gray-50 bg-gray-50/30 px-6 justify-between items-center rounded-b-2xl">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="text-gray-500 hover:text-ink" onClick={() => openEdit(item)} title="تعديل">
                      <Pencil size={15} />
                    </Button>
                    {item.file ? (
                      <Button
                        variant="ghost" size="sm" className="text-gray-500 hover:text-ink"
                        onClick={() => handleDownload(item.file!)}
                        disabled={downloadingPath === item.file.path}
                        title="تحميل الملف وحفظه على جهازك"
                      >
                        {downloadingPath === item.file.path ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-gray-500 hover:text-ink" onClick={() => handlePrint(item)} title="طباعة">
                        <Printer size={15} />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      title="حذف"
                    >
                      {deletingId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="bg-navy hover:bg-navy/90 text-white font-bold text-xs gap-1 shadow-sm px-4"
                    onClick={() => openReader(item)}
                  >
                    <FileText size={14} /> {item.file ? "فتح" : "قراءة"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reader */}
      <Dialog open={reading !== null} onOpenChange={(open) => { if (!open) setReading(null); }}>
        {reading && (
          <DialogContent className="w-[95vw] sm:max-w-[90vw] md:max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden font-['IBM_Plex_Sans_Arabic']" dir="rtl">
            <div className="p-6 border-b bg-gray-50/50 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                <div className="min-w-0">
                  <Badge variant="outline" className={`font-bold text-[11px] mb-2 ${TYPE_STYLE[reading.type]?.badge ?? ""}`}>
                    {LIBRARY_TYPES[reading.type]}
                  </Badge>
                  <DialogTitle className="text-xl font-black text-ink break-words">{reading.title}</DialogTitle>
                  <DialogDescription className="text-xs text-gray-500 mt-1">
                    {metaLine(reading) || "بدون بيانات إصدار"}
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {reading.sourceUrl && isSafeUrl(reading.sourceUrl) && (
                    <a href={reading.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="border-gray-200 text-ink">
                        <ExternalLink size={14} className="ml-1" /> المصدر
                      </Button>
                    </a>
                  )}
                  {reading.file && (
                    <Button
                      size="sm"
                      className="bg-navy hover:bg-navy/90 text-white font-bold"
                      onClick={() => handleDownload(reading.file!)}
                      disabled={downloadingPath === reading.file.path}
                    >
                      {downloadingPath === reading.file.path
                        ? <Loader2 size={14} className="ml-1 animate-spin" />
                        : <Download size={14} className="ml-1" />} تحميل الملف
                    </Button>
                  )}
                  {reading.content && (
                    <Button variant="outline" size="sm" className="border-gray-200 text-ink" onClick={() => handleCopy(reading.content)}>
                      {copied ? <Check size={14} className="ml-1 text-green-600" /> : <Copy size={14} className="ml-1" />} نسخ النص
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="border-gray-200 text-ink" onClick={() => handlePrint(reading)}>
                    <Printer size={14} className="ml-1" /> طباعة
                  </Button>
                </div>
              </div>
              {reading.file && (reading.content || reading.summary) && (
                <div className="flex gap-2">
                  {(["file", "text"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setReaderView(v)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                        readerView === v ? "bg-navy text-white border-edge" : "bg-surface text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {v === "file" ? "الملف" : "النص والملخص"}
                    </button>
                  ))}
                </div>
              )}
              {reading.content && (!reading.file || readerView === "text") && (
                <div className="relative w-full md:w-80">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <Input
                    type="text"
                    placeholder="ابحث داخل النص..."
                    value={readerSearch}
                    onChange={(e) => setReaderSearch(e.target.value)}
                    className="pl-3 pr-8 py-1.5 h-8 border border-gray-200 rounded-lg text-xs bg-surface"
                  />
                </div>
              )}
            </div>

            {/* العارض يبقى مُركّباً عند التبديل للنص حتى لا يُعاد تنزيل الملف */}
            {reading.file && (
              <div className={`flex-1 overflow-hidden ${readerView === "file" ? "" : "hidden"}`}>
                <FileViewer key={reading.file.path} file={reading.file} onDownload={() => handleDownload(reading.file!)} />
              </div>
            )}
            {reading.file && readerView === "file" ? null : (
            <div className="flex-1 p-6 overflow-y-auto space-y-5">
              {reading.summary && (
                <div className="text-sm text-gray-700 bg-amber-50/50 border border-amber-100 rounded-lg px-4 py-3 leading-relaxed">
                  <span className="font-bold text-amber-800 block mb-1 text-xs">الملخص</span>
                  {reading.summary}
                </div>
              )}
              {reading.content ? (
                <>
                  <div className="text-sm leading-loose text-gray-800 text-justify whitespace-pre-wrap break-words">
                    {highlightText(reading.content, readerSearch)}
                  </div>
                  {!readerHasMatch && (
                    <div className="text-center py-6 text-gray-400 text-xs font-bold">
                      لا يوجد تطابق للعبارة المبحوث عنها داخل هذا النص.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-gray-400 text-sm">
                  لم يُضف نص لهذه المادة بعد.{" "}
                  <button className="text-blue-600 font-bold underline" onClick={() => openEdit(reading)}>أضف النص</button>
                </div>
              )}
            </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {/* Add / Edit */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open); }}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-ink">
              {editingId ? "تعديل المادة" : "إضافة إلى مكتبتي"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              ارفع ملفاً أو الصق النص أو كليهما — ما تضيفه هنا يظهر لك وحدك.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">النوع *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TYPE_ORDER.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition ${
                      form.type === t
                        ? "bg-navy text-white border-edge"
                        : "bg-surface text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {LIBRARY_TYPES[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">الملف (PDF أو Word — حتى ٥٠ ميجابايت)</label>
              {pendingFile || form.file ? (
                <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip size={16} className="text-gray-500 shrink-0" />
                    <span className="text-sm font-bold text-ink truncate" dir="auto">
                      {pendingFile?.name ?? form.file?.name}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatFileSize(pendingFile?.size ?? form.file?.size ?? 0)}
                    </span>
                    {pendingFile && <Badge variant="outline" className="text-[10px] shrink-0">جديد</Badge>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <label className="text-xs font-bold text-blue-600 hover:underline cursor-pointer px-2">
                      استبدال
                      <input
                        type="file"
                        accept={LIBRARY_FILE_ACCEPT}
                        className="hidden"
                        disabled={saving}
                        onChange={(e) => { handlePickFile(e.target.files?.[0]); e.target.value = ""; }}
                      />
                    </label>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="text-gray-500 hover:text-red-600 h-7 w-7 p-0"
                      disabled={saving}
                      title="إزالة الملف"
                      onClick={() => { setPendingFile(null); setForm({ ...form, file: null }); }}
                    >
                      <X size={15} />
                    </Button>
                  </div>
                </div>
              ) : (
                <label
                  className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl px-4 py-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handlePickFile(e.dataTransfer.files?.[0]); }}
                >
                  <Upload size={22} className="text-gray-400" />
                  <span className="text-sm font-bold text-ink">اسحب الملف هنا أو اضغط للاختيار</span>
                  <span className="text-xs text-gray-500">كتاب PDF أو مستند Word (.pdf، .docx، .doc)</span>
                  <input
                    type="file"
                    accept={LIBRARY_FILE_ACCEPT}
                    className="hidden"
                    disabled={saving}
                    onChange={(e) => { handlePickFile(e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
              )}
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-navy transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500 font-bold">جارٍ رفع الملف... {uploadProgress}%</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">العنوان *</label>
              <Input
                required
                maxLength={LIBRARY_LIMITS.title}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.type === "REGULATION" ? "مثال: نظام المعاملات المدنية" : "عنوان المادة"}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-ink">الرقم</label>
                <Input
                  maxLength={LIBRARY_LIMITS.number}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="مثال: م/١٩١"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-ink">تاريخ الإصدار</label>
                <Input
                  maxLength={LIBRARY_LIMITS.issueDate}
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                  placeholder="مثال: ١٤٤٤/١١/٢٩هـ"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-ink">جهة الإصدار</label>
                <Input
                  maxLength={LIBRARY_LIMITS.issuer}
                  value={form.issuer}
                  onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                  placeholder="مثال: وزارة العدل"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">ملخص</label>
              <Textarea
                maxLength={LIBRARY_LIMITS.summary}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="نبذة مختصرة عن المادة ومجال تطبيقها"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">النص الكامل (اختياري)</label>
              <Textarea
                maxLength={LIBRARY_LIMITS.content}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="الصق نص النظام أو القرار أو التعميم هنا"
                rows={10}
                className="leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-ink">رابط المصدر</label>
              <Input
                type="url"
                dir="ltr"
                maxLength={LIBRARY_LIMITS.sourceUrl}
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                placeholder="https://laws.boe.gov.sa/..."
              />
            </div>

            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 font-bold">
                {formError}
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" className="bg-navy hover:bg-navy/90 text-white font-bold gap-1.5" disabled={saving}>
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? "حفظ التعديلات" : "إضافة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
