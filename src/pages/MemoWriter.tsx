/**
 * صفحة «كتابة مذكرة» المستقلة — مذكرات عامة غير مرتبطة بقضية.
 * نفس نموذج تبويب المذكرات في صفحة القضية (الموضوع، النوع، مختصر المطلوب،
 * المرفقات، المحرر والمساعد الذكي)، وتُحفظ في مجموعة general_memos
 * المعزولة بـ lawyerId، مع سجل بالمذكرات المحفوظة في الصفحة نفسها.
 * مذكرات القضايا تبقى في تبويب المذكرات داخل كل قضية.
 */

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, FilePlus, FileSignature, Info, Loader2, Pencil, Printer, Save, Trash2 } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import RichTextEditor from "../components/RichTextEditor";
import MemoAiPanel, { MemoAttachmentsField, type AiAttachment } from "../components/MemoAiPanel";
import { db } from "../lib/firebase";
import { usePermissions } from "../lib/usePermissions";
import { useOfficeSettings } from "../lib/officeSettings";
import { renderMemoLetterheadHeader, renderMemoLetterheadFooter, printMemoDocument } from "../lib/letterhead";
import { buildMemoPrompt, MEMO_TYPE_LABELS } from "../lib/memoPrompt";

const COLLECTION = "general_memos";

interface GeneralMemo {
  id: string;
  title: string;
  content: string;
  type: string;
  brief?: string;
  lawyerId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
}

const selectClass =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ar-EG") : "");

export default function MemoWriter() {
  const perms = usePermissions();
  const office = useOfficeSettings();

  const [memos, setMemos] = useState<GeneralMemo[]>([]);
  const [memosLoading, setMemosLoading] = useState(true);
  /** المذكرة المفتوحة للتعديل — null يعني مذكرة جديدة */
  const [editingId, setEditingId] = useState<string | null>(null);

  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState("LAWSUIT");
  const [memoBrief, setMemoBrief] = useState("");
  const [memoAttachments, setMemoAttachments] = useState<AiAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadMemos = async () => {
    setMemosLoading(true);
    try {
      const memosQuery = perms.role === "SUPER_ADMIN"
        ? query(collection(db, COLLECTION), limit(200))
        : query(collection(db, COLLECTION), where("lawyerId", "==", perms.lawyerId || ""), limit(200));
      const snap = await getDocs(memosQuery);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GeneralMemo);
      // الترتيب على العميل لتفادي فهرس مركّب في Firestore
      list.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      setMemos(list);
    } catch (err) {
      console.error("Error fetching general memos:", err);
      setError("تعذّر تحميل المذكرات المحفوظة.");
    } finally {
      setMemosLoading(false);
    }
  };

  useEffect(() => {
    void loadMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setMemoTitle("");
    setMemoContent("");
    setMemoType("LAWSUIT");
    setMemoBrief("");
    setMemoAttachments([]);
  };

  const isDirty = () => !!(memoTitle.trim() || memoContent.trim() || memoBrief.trim());

  const startNew = () => {
    if (isDirty() && !confirm("سيُفرَّغ النموذج الحالي دون حفظ. متابعة؟")) return;
    resetForm();
    setNotice("");
    setError("");
  };

  const openMemo = (memo: GeneralMemo) => {
    if (editingId !== memo.id && isDirty() && !confirm("سيُستبدل النموذج الحالي بهذه المذكرة دون حفظ التغييرات. متابعة؟")) return;
    setEditingId(memo.id);
    setMemoTitle(memo.title || "");
    setMemoContent(memo.content || "");
    setMemoType(memo.type || "LAWSUIT");
    setMemoBrief(memo.brief || "");
    setMemoAttachments([]);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** عنوان افتراضي حين يُدرج نص من المساعد والعنوان فارغ */
  const ensureMemoTitle = () => {
    if (!memoTitle.trim()) setMemoTitle(MEMO_TYPE_LABELS[memoType] || "مذكرة");
  };

  const canSave = !!memoTitle.trim() && !!memoContent && !saving;

  const handleSaveMemo = async (): Promise<boolean> => {
    if (!canSave) return false;
    setSaving(true);
    setError("");
    setNotice("");
    const now = new Date().toISOString();
    const fields = {
      title: memoTitle.trim(),
      content: memoContent,
      type: memoType,
      brief: memoBrief.trim(),
      updatedAt: now,
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, COLLECTION, editingId), fields);
        setNotice("تم حفظ التعديلات على المذكرة.");
      } else {
        const ref = await addDoc(collection(db, COLLECTION), {
          ...fields,
          lawyerId: perms.lawyerId || "",
          createdAt: now,
          createdBy: perms.userId ?? null,
          createdByName: localStorage.getItem("userName") ?? null,
        });
        // تبقى المذكرة مفتوحة بعد الحفظ فيستمر التعديل عليها لا على نسخة جديدة
        setEditingId(ref.id);
        setNotice("تم حفظ المذكرة في سجل المذكرات.");
      }
      await loadMemos();
      return true;
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ المذكرة. تحقق من الاتصال ثم أعد المحاولة.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const printMemo = (title: string, content: string) =>
    printMemoDocument({
      title,
      meta: `تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}`,
      contentHtml: content,
      profile: office.officeProfile,
    });

  const handleSaveAndPrint = async () => {
    const title = memoTitle;
    const content = memoContent;
    if (!(await handleSaveMemo())) return;
    printMemo(title, content);
  };

  const handleDelete = async (memo: GeneralMemo) => {
    if (!confirm(`حذف المذكرة «${memo.title}» نهائياً؟`)) return;
    setError("");
    try {
      await deleteDoc(doc(db, COLLECTION, memo.id));
      if (editingId === memo.id) resetForm();
      setMemos((list) => list.filter((m) => m.id !== memo.id));
      setNotice("تم حذف المذكرة.");
    } catch (err) {
      console.error(err);
      setError("تعذّر حذف المذكرة.");
    }
  };

  if (!perms.canCreate("memo.manage")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center font-['Tajawal']" dir="rtl">
        <h2 className="text-lg font-bold text-ink mb-2">لا تملك صلاحية كتابة المذكرات</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">كتابة مذكرة</h1>
          <p className="text-gray-500 mt-1 text-sm">مذكرات وصحف عامة غير مرتبطة بقضية — لمذكرات قضية معينة استخدم تبويب المذكرات داخل القضية</p>
        </div>
        {editingId && (
          <Button variant="outline" onClick={startNew}>
            <FilePlus className="ml-2 h-4 w-4" /> مذكرة جديدة
          </Button>
        )}
      </div>

      {notice && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold">{error}</div>
      )}

      <Card className="shadow-sm border-blue-100">
        <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
          <CardTitle className="text-blue-900 flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-blue-600" />
            {editingId ? "تعديل مذكرة محفوظة" : "كتابة مذكرة أو صحيفة جديدة"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* يمين: بيانات المذكرة والمرفقات والمساعد الذكي — يسار: صفحة المحرر بنظام الوورد (على الجوال المحرر أولاً) */}
          {/* على الشاشات العريضة يتمدد المحرر ليستوي أسفله مع أسفل المساعد الذكي */}
          <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-5 items-start lg:items-stretch">
            <div className="rounded-2xl bg-gray-100 border border-gray-200 p-3 sm:p-6 lg:order-last lg:flex lg:flex-col">
              {!office.officeProfile.name && (
                <div className="mx-auto max-w-[850px] mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <Info size={14} className="shrink-0" />
                  الترويسة تعرض بيانات افتراضية — أكمل اسم المكتب وشعاره وهواتفه من الإعدادات ← مطبوعات المكتب.
                </div>
              )}
              <div className="mx-auto w-full max-w-[850px] bg-surface shadow-md lg:flex-1 lg:flex lg:flex-col">
                <RichTextEditor
                  value={memoContent}
                  onChange={(val) => setMemoContent(val)}
                  placeholder="ابدأ الكتابة هنا..."
                  headerHtml={renderMemoLetterheadHeader(office.officeProfile)}
                  footerHtml={renderMemoLetterheadFooter(office.officeProfile)}
                  fill
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-ink">الموضوع</label>
                  <Input
                    placeholder="مثال: صحيفة دعوى تعويض، مذكرة دفاع..."
                    className="bg-gray-50"
                    value={memoTitle}
                    onChange={e => setMemoTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-ink">النوع</label>
                  <SearchableSelect className={selectClass} value={memoType} onChange={e => setMemoType(e.target.value)}>
                    <option value="LAWSUIT">صحيفة دعوى</option>
                    <option value="MEMO">مذكرة رد / دفاع</option>
                  </SearchableSelect>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-ink">مختصر المطلوب</label>
                  <textarea
                    rows={4}
                    placeholder="اكتب باختصار ما تريده من هذه المذكرة، مثل: المطالبة بباقي قيمة العقد مع التعويض عن التأخير..."
                    className="w-full resize-y rounded-md border border-input bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={memoBrief}
                    onChange={e => setMemoBrief(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-400">يعتمد عليه المساعد الذكي عند الصياغة — اذكر فيه الأطراف والوقائع المهمة.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-ink">المرفقات</label>
                  <MemoAttachmentsField attachments={memoAttachments} onChange={setMemoAttachments} />
                </div>
              </div>

              <MemoAiPanel
                caseData={null}
                memoTypeLabel={MEMO_TYPE_LABELS[memoType] || "مذكرة"}
                editorHtml={memoContent}
                brief={memoBrief}
                attachments={memoAttachments}
                onAttachmentsChange={setMemoAttachments}
                buildDraftPrompt={() => buildMemoPrompt(memoType, null, memoBrief)}
                onInsert={(html) => { ensureMemoTitle(); setMemoContent((prev) => (prev ? `${prev}\n${html}` : html)); }}
                onReplace={(html) => {
                  if (memoContent && !confirm("سيُستبدل محتوى المحرر بالكامل بهذا النص. متابعة؟")) return;
                  ensureMemoTitle();
                  setMemoContent(html);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gray-100">
            {!canSave && !saving && <span className="text-xs text-gray-500 ml-auto">اكتب الموضوع ومحتوى المذكرة لتتمكن من الحفظ.</span>}
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveAndPrint} disabled={!canSave}>
              <Download className="ml-2 h-4 w-4" /> حفظ وطباعة فورية
            </Button>
            <Button className="bg-navy hover:bg-navy/90 text-white" onClick={() => void handleSaveMemo()} disabled={!canSave}>
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              {editingId ? "حفظ التعديلات" : "حفظ المذكرة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-ink text-base">المذكرات المحفوظة</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {memosLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
            </div>
          ) : memos.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">لا توجد مذكرات محفوظة بعد.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {memos.map((memo) => {
                const ctx = { createdBy: memo.createdBy ?? undefined };
                return (
                  <li key={memo.id}
                    className={`flex flex-wrap items-center gap-3 py-3 px-2 rounded-xl ${editingId === memo.id ? "bg-blue-50" : ""}`}>
                    <button type="button" onClick={() => openMemo(memo)} className="flex-1 min-w-0 text-right">
                      <p className="font-bold text-ink truncate">{memo.title || "بلا عنوان"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {MEMO_TYPE_LABELS[memo.type] || "مذكرة"} · آخر تعديل {formatDate(memo.updatedAt)}
                        {memo.createdByName ? ` · ${memo.createdByName}` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      {perms.canUpdate("memo.manage", ctx) && (
                        <Button size="sm" variant="ghost" onClick={() => openMemo(memo)} title="فتح وتعديل">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => printMemo(memo.title, memo.content)} title="طباعة">
                        <Printer className="h-4 w-4" />
                      </Button>
                      {perms.canDelete("memo.manage", ctx) && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void handleDelete(memo)} title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
