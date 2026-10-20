/**
 * صفحة «كتابة مذكرة» المستقلة — نفس نموذج تبويب المذكرات في صفحة القضية
 * (الموضوع، النوع، مختصر المطلوب، المرفقات، المحرر والمساعد الذكي)،
 * مع اختيار القضية التي تُحفظ المذكرة تبعها. المذكرة المحفوظة تظهر في
 * تبويب المذكرات بتلك القضية وتمرّ بدورة الاعتماد نفسها.
 */

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Download, FileSignature, Info, Loader2, Plus, Save } from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import RichTextEditor from "../components/RichTextEditor";
import { AddCaseModal } from "../components/AddCaseModal";
import MemoAiPanel, { MemoAttachmentsField, type AiAttachment } from "../components/MemoAiPanel";
import { db } from "../lib/firebase";
import { visibleCasesQuery } from "../lib/caseAccess";
import { usePermissions } from "../lib/usePermissions";
import { useOfficeSettings } from "../lib/officeSettings";
import { renderMemoLetterheadHeader, renderMemoLetterheadFooter } from "../lib/letterhead";
import { buildMemoPrompt, MEMO_TYPE_LABELS } from "../lib/memoPrompt";
import type { MemoStatus } from "../lib/memoWorkflow";

interface CaseOption {
  id: string;
  title?: string;
  caseNumber?: string;
  [key: string]: any;
}

const selectClass =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function MemoWriter() {
  const perms = usePermissions();
  const office = useOfficeSettings();
  const [searchParams] = useSearchParams();

  const [cases, setCases] = useState<CaseOption[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [caseId, setCaseId] = useState(searchParams.get("caseId") || "");
  // بيانات القضية المختارة مع العميل — يحتاجها المساعد الذكي كما في صفحة القضية
  const [caseData, setCaseData] = useState<any>(null);

  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState("LAWSUIT");
  const [memoBrief, setMemoBrief] = useState("");
  const [memoAttachments, setMemoAttachments] = useState<AiAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null);

  const [isAddCaseOpen, setIsAddCaseOpen] = useState(false);

  const loadCases = async () => {
    setCasesLoading(true);
    try {
      const casesQuery = perms.role === "SUPER_ADMIN"
        ? query(collection(db, "cases"), limit(200))
        : visibleCasesQuery(perms.lawyerId || "", limit(200));
      const snap = await getDocs(casesQuery);
      setCases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching cases:", err);
      setError("تعذّر تحميل القضايا.");
    } finally {
      setCasesLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selected = cases.find((c) => c.id === caseId);
    if (!selected) { setCaseData(null); return; }
    let cancelled = false;
    (async () => {
      let client: any = { fullName: "غير معروف" };
      if (selected.clientId) {
        try {
          const clientDoc = await getDoc(doc(db, "clients", selected.clientId));
          if (clientDoc.exists()) client = clientDoc.data();
        } catch (err) {
          console.error("Could not fetch client:", err);
        }
      }
      if (!cancelled) setCaseData({ ...selected, client });
    })();
    return () => { cancelled = true; };
  }, [caseId, cases]);

  /** عنوان افتراضي حين يُدرج نص من المساعد والعنوان فارغ */
  const ensureMemoTitle = () => {
    if (!memoTitle.trim()) setMemoTitle(`${MEMO_TYPE_LABELS[memoType] || "مذكرة"} - ${caseData?.title || ""}`);
  };

  const canSave = !!caseId && !!memoTitle && !!memoContent && !saving;

  const handleSaveMemo = async (): Promise<boolean> => {
    if (!canSave) return false;
    setSaving(true);
    setError("");
    try {
      await addDoc(collection(doc(db, "cases", caseId), "memos"), {
        title: memoTitle,
        content: memoContent,
        type: memoType,
        ...(memoBrief.trim() ? { brief: memoBrief.trim() } : {}),
        status: "DRAFT" as MemoStatus,
        sharedWithClient: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: perms.userId ?? null,
        createdByName: localStorage.getItem("userName") ?? null,
      });
      setSavedCaseId(caseId);
      setMemoTitle("");
      setMemoContent("");
      setMemoBrief("");
      setMemoAttachments([]);
      return true;
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ المذكرة. تحقق من الاتصال ثم أعد المحاولة.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    // نلتقط القيم قبل الحفظ لأن الحفظ يفرّغ النموذج
    const title = memoTitle;
    const content = memoContent;
    const caseNumber = caseData?.caseNumber || "";
    if (!(await handleSaveMemo())) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>${title}</title>
            <style>
              body { font-family: 'Tajawal', serif; padding: 50px; line-height: 1.8; }
              h1 { text-align: center; color: #192a56; border-bottom: 2px solid #273c75; padding-bottom: 10px; }
              .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
              .content { font-size: 14pt; text-align: justify; }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            <div class="meta">قضية رقم: ${caseNumber} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
            <div class="content">${content}</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (!perms.canCreate("memo.manage")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center font-['Tajawal']" dir="rtl">
        <h2 className="text-lg font-bold text-[#192a56] mb-2">لا تملك صلاحية كتابة المذكرات</h2>
        <p className="text-sm text-gray-500">راجع مدير المكتب لمنحك الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      {/* القضية الجديدة تُختار تلقائياً بعد إنشائها */}
      <AddCaseModal
        isOpen={isAddCaseOpen}
        onClose={() => setIsAddCaseOpen(false)}
        onSuccess={async (newCaseId) => {
          await loadCases();
          if (newCaseId) { setCaseId(newCaseId); setSavedCaseId(null); }
        }}
      />

      <div>
        <h1 className="text-2xl font-black text-[#192a56]">كتابة مذكرة</h1>
        <p className="text-gray-500 mt-1 text-sm">اكتب المذكرة أو الصحيفة واحفظها تبع أي قضية من قضاياك</p>
      </div>

      {savedCaseId && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold">
          <CheckCircle2 size={18} /> تم حفظ المذكرة كمسودة في القضية.
          <Link to={`/app/cases/${savedCaseId}`} className="underline mr-auto">فتح القضية</Link>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold">{error}</div>
      )}

      <Card className="shadow-sm border-blue-100">
        <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
          <CardTitle className="text-blue-900 flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-blue-600" />
            كتابة مذكرة أو صحيفة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-bold text-[#192a56]">القضية</label>
                {perms.canCreate("case.create") && (
                  <button type="button" onClick={() => setIsAddCaseOpen(true)}
                    className="flex items-center gap-1 text-xs font-bold text-[#273c75] hover:text-[#192a56]">
                    <Plus size={14} /> قضية جديدة
                  </button>
                )}
              </div>
              <SearchableSelect className={selectClass} value={caseId} disabled={casesLoading}
                onChange={(e) => { setCaseId(e.target.value); setSavedCaseId(null); }}>
                <option value="">{casesLoading ? "جاري تحميل القضايا..." : "اختر القضية التي تُحفظ المذكرة تبعها"}</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "قضية بلا عنوان"}{c.caseNumber ? ` — ${c.caseNumber}` : ""}
                  </option>
                ))}
              </SearchableSelect>
              {!casesLoading && cases.length === 0 && (
                <p className="text-[11px] text-amber-700">لا توجد قضايا متاحة لك — أضف قضية من زر «قضية جديدة» لتحفظ المذكرة تبعها.</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#192a56]">الموضوع</label>
              <Input
                placeholder="مثال: صحيفة دعوى تعويض، مذكرة دفاع..."
                className="text-lg bg-gray-50"
                value={memoTitle}
                onChange={e => setMemoTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#192a56]">النوع</label>
              <SearchableSelect className={selectClass} value={memoType} onChange={e => setMemoType(e.target.value)}>
                <option value="LAWSUIT">صحيفة دعوى</option>
                <option value="MEMO">مذكرة رد / دفاع</option>
              </SearchableSelect>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#192a56]">مختصر المطلوب</label>
              <textarea
                rows={3}
                placeholder="اكتب باختصار ما تريده من هذه المذكرة، مثل: المطالبة بباقي قيمة العقد مع التعويض عن التأخير..."
                className="w-full resize-y rounded-md border border-input bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={memoBrief}
                onChange={e => setMemoBrief(e.target.value)}
              />
              <p className="text-[11px] text-gray-400">يعتمد عليه المساعد الذكي عند الصياغة.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#192a56]">المرفقات</label>
              <MemoAttachmentsField attachments={memoAttachments} onChange={setMemoAttachments} />
            </div>
          </div>

          {/* يمين: المساعد الذكي — يسار: صفحة المحرر بنظام الوورد (على الجوال المحرر أولاً) */}
          <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-5 items-start">
            <div className="rounded-2xl bg-gray-100 border border-gray-200 p-3 sm:p-6 lg:order-last">
              {!office.officeProfile.name && (
                <div className="mx-auto max-w-[850px] mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <Info size={14} className="shrink-0" />
                  الترويسة تعرض بيانات افتراضية — أكمل اسم المكتب وشعاره وهواتفه من الإعدادات ← مطبوعات المكتب.
                </div>
              )}
              <div className="mx-auto max-w-[850px] bg-white shadow-md">
                <RichTextEditor
                  value={memoContent}
                  onChange={(val) => setMemoContent(val)}
                  placeholder="ابدأ الكتابة هنا..."
                  headerHtml={renderMemoLetterheadHeader(office.officeProfile)}
                  footerHtml={renderMemoLetterheadFooter(office.officeProfile)}
                />
              </div>
            </div>
            <MemoAiPanel
              caseData={caseData}
              memoTypeLabel={MEMO_TYPE_LABELS[memoType] || "مذكرة"}
              editorHtml={memoContent}
              brief={memoBrief}
              attachments={memoAttachments}
              onAttachmentsChange={setMemoAttachments}
              buildDraftPrompt={() => buildMemoPrompt(memoType, caseData, memoBrief)}
              onInsert={(html) => { ensureMemoTitle(); setMemoContent((prev) => (prev ? `${prev}\n${html}` : html)); }}
              onReplace={(html) => {
                if (memoContent && !confirm("سيُستبدل محتوى المحرر بالكامل بهذا النص. متابعة؟")) return;
                ensureMemoTitle();
                setMemoContent(html);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-gray-100">
            {!caseId && <span className="text-xs text-gray-500 ml-auto">اختر القضية أولاً لتتمكن من الحفظ.</span>}
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveAndPrint} disabled={!canSave}>
              <Download className="ml-2 h-4 w-4" /> حفظ وطباعة فورية
            </Button>
            <Button className="bg-[#192a56] hover:bg-[#192a56]/90 text-white" onClick={() => void handleSaveMemo()} disabled={!canSave}>
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />} حفظ المذكرة فقط
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
