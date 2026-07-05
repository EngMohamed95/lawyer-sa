import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronRight, Calendar, FileText, CheckSquare, Plus, Download, Edit, Save, Trash2, File, Scale, FileSignature, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { AddDocumentModal } from "../components/AddDocumentModal";
import { AddHearingModal } from "../components/AddHearingModal";
import { AddTaskModal } from "../components/AddTaskModal";
import { EditCaseModal } from "../components/EditCaseModal";
import { DocumentViewerModal } from "../components/DocumentViewerModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import RichTextEditor from "../components/RichTextEditor";
import { Input } from "../components/ui/input";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";


const getStatusBadge = (status: string) => {
  switch (status) {
    case 'OPEN': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">مفتوحة</Badge>;
    case 'PENDING': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">قيد الانتظار</Badge>;
    case 'JUDGEMENT_RESERVED': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">محجوزة للحكم</Badge>;
    case 'CLOSED': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">مغلقة</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

export default function CaseDetails() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeAiTarget, setActiveAiTarget] = useState<{ target: any, type: 'case' | 'document' | 'memo' } | null>(null);

  // New Memo State
  const [isWritingMemo, setIsWritingMemo] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState("MEMO");

  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [isAddHearingOpen, setIsAddHearingOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isEditCaseOpen, setIsEditCaseOpen] = useState(false);

  const [viewDocument, setViewDocument] = useState<any>(null);

  const fetchCaseData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const caseDoc = await getDoc(doc(db, "cases", id));
      if (!caseDoc.exists()) {
        setData({ error: "القضية غير موجودة" });
        return;
      }
      const caseData = caseDoc.data();
      const currentLawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");

      // SaaS Security Check: Ensure lawyer only sees their own case
      if (userRole !== "SUPER_ADMIN" && caseData.lawyerId !== currentLawyerId) {
          setData({ error: "غير مصرح لك بالدخول لهذه القضية" });
          return;
      }
      
      // Fetch related client
      const clientDoc = await getDoc(doc(db, "clients", caseData.clientId));
      const clientData = clientDoc.exists() ? clientDoc.data() : { fullName: "غير معروف" };

      // Fetch hearings
      const hearingsSnap = await getDocs(collection(doc(db, "cases", id), "hearings"));
      const hearings = hearingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch documents
      const docsSnap = await getDocs(collection(doc(db, "cases", id), "documents"));
      const documents = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch tasks
      const tasksSnap = await getDocs(query(collection(db, "tasks"), where("caseId", "==", id)));
      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch memos
      const memosSnap = await getDocs(collection(doc(db, "cases", id), "memos"));
      const memos = memosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch client documents (shared across all cases of this client)
      let clientDocuments: any[] = [];
      if (caseData.clientId) {
        try {
          const clientDocsSnap = await getDocs(
            collection(doc(db, "clients", caseData.clientId), "documents")
          );
          clientDocuments = clientDocsSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            source: "client",
          }));
        } catch (e) {
          console.error("Could not fetch client documents:", e);
        }
      }

      setData({
        id: caseDoc.id,
        ...caseData,
        client: clientData,
        hearings,
        documents,
        clientDocuments,
        tasks,
        memos
      });
    } catch (error) {
      console.error("Error fetching case data:", error);
      setData({ error: "حدث خطأ أثناء تحميل البيانات" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseData();
  }, [id]);

  const handleSaveMemo = async () => {
    if (!memoTitle || !memoContent || !id) return;
    try {
      await addDoc(collection(doc(db, "cases", id), "memos"), {
        title: memoTitle,
        content: memoContent,
        type: memoType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsWritingMemo(false);
      setMemoTitle("");
      setMemoContent("");
      fetchCaseData();
    } catch(err) {
      console.error(err);
    }
  };

  if (loading) return <div className="text-center py-20">جاري تحميل تفاصيل القضية...</div>;
  if (!data || data.error) return <div className="text-center py-20 text-red-500">{data?.error || "حدث خطأ أو لم يتم العثور على القضية"}</div>;

  return (
    <div className="space-y-6">
      <DocumentViewerModal
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
        document={viewDocument}
      />

      <AddDocumentModal 
        isOpen={isAddDocOpen} 
        onClose={() => setIsAddDocOpen(false)} 
        onSuccess={fetchCaseData} 
        caseId={id!} 
        clientId={data?.clientId}
      />
      <AddHearingModal 
        isOpen={isAddHearingOpen} 
        onClose={() => setIsAddHearingOpen(false)} 
        onSuccess={fetchCaseData} 
        caseId={id!} 
      />
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onSuccess={fetchCaseData}
        caseId={id!}
        clientId={data?.clientId}
      />
      <EditCaseModal
        isOpen={isEditCaseOpen}
        onClose={() => setIsEditCaseOpen(false)}
        onSuccess={fetchCaseData}
        caseData={data}
      />

      {activeAiTarget && (
        <AiSummarizerModal 
          isOpen={!!activeAiTarget} 
          onClose={() => setActiveAiTarget(null)} 
          target={activeAiTarget.target} 
          type={activeAiTarget.type} 
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link to="/app/cases" className="text-gray-500 hover:text-[#0A192F] inline-flex items-center text-sm font-medium transition-colors">
          <ChevronRight size={16} className="ml-1" />
          العودة للقضايا
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">{data.title}</h1>
              {getStatusBadge(data.status)}
            </div>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">رقم القضية: {data.caseNumber}</span>
              <span>•</span>
              <span>المحكمة: {data.courtName || "غير محدد"}</span>
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => window.print()}>
              <Download className="ml-2 h-4 w-4" /> طباعة ملف القضية
            </Button>
            <Button variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => setActiveAiTarget({ target: data, type: 'case' })}>
              <Sparkles className="ml-2 h-4 w-4" /> تلخيص شامل للذكاء الاصطناعي
            </Button>
            <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white" onClick={() => setIsEditCaseOpen(true)}>
              <Edit className="ml-2 h-4 w-4" /> تعديل بيانات القضية
            </Button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .print-hidden { display: none !important; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="print-content">

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="bg-transparent border-b border-gray-200 w-full justify-start space-x-4 space-x-reverse h-auto p-0 mb-6 sticky top-16 z-0 bg-[#F3F4F6] overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-hide">
          <TabsTrigger value="info" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#0A192F] data-[state=active]:shadow-sm rounded-t-lg rounded-b-none px-6 py-3 font-semibold text-gray-600 data-[state=active]:text-[#0A192F]">
            <Scale className="w-4 h-4 ml-2" /> التفاصيل العامة
          </TabsTrigger>
          <TabsTrigger value="hearings" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#0A192F] data-[state=active]:shadow-sm rounded-t-lg rounded-b-none px-6 py-3 font-semibold text-gray-600 data-[state=active]:text-[#0A192F]">
            <Calendar className="w-4 h-4 ml-2" /> الجلسات 
            <Badge variant="secondary" className="mr-2 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center rounded-full text-xs">{data.hearings.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="memos" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#0A192F] data-[state=active]:shadow-sm rounded-t-lg rounded-b-none px-6 py-3 font-semibold text-gray-600 data-[state=active]:text-[#0A192F]">
            <FileSignature className="w-4 h-4 ml-2" /> المذكرات والصحف
            <Badge variant="secondary" className="mr-2 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center rounded-full text-xs">{data.memos?.length || 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="docs" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#0A192F] data-[state=active]:shadow-sm rounded-t-lg rounded-b-none px-6 py-3 font-semibold text-gray-600 data-[state=active]:text-[#0A192F]">
            <FileText className="w-4 h-4 ml-2" /> المستندات
            <Badge variant="secondary" className="mr-2 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center rounded-full text-xs">{data.documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#0A192F] data-[state=active]:shadow-sm rounded-t-lg rounded-b-none px-6 py-3 font-semibold text-gray-600 data-[state=active]:text-[#0A192F]">
            <CheckSquare className="w-4 h-4 ml-2" /> المهام
            <Badge variant="secondary" className="mr-2 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center rounded-full text-xs">{data.tasks.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0 outline-none space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">أطراف النزاع</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">الموكل</span>
                    <span className="font-bold text-[#0A192F]">{data.client?.fullName} <Badge variant="outline" className="mr-2 font-normal text-xs">{data.client?.clientType === 'COMPANY' ? 'شركة' : 'فرد'}</Badge></span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">الخصم</span>
                    <span className="font-medium text-red-600">{data.opponentName || "غير محدد"}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-gray-500">محامي الخصم</span>
                    <span className="font-medium">{data.opponentLawyer || "غير محدد"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">بيانات القضية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">نوع القضية</span>
                    <span className="font-medium">{data.type}</span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">تاريخ البداية</span>
                    <span className="font-medium" dir="ltr">{data.startDate ? new Date(data.startDate).toLocaleDateString('ar-EG') : "-"}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-gray-500">المحامي المسؤول</span>
                    <span className="font-medium border-b border-dashed border-gray-400 pb-0.5">{data.lawyerName || "غير محدد"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">ملخص القضية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100">
                  {data.summary || "لا يوجد ملخص مضاف."}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hearings" className="mt-0 outline-none">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <div>
                <CardTitle className="text-lg">سجل الجلسات</CardTitle>
                <CardDescription>الترتيب من الأقدم للأحدث</CardDescription>
              </div>
              <Button size="sm" className="bg-[#0A192F] hover:bg-[#0A192F]/90" onClick={() => setIsAddHearingOpen(true)}>
                <Plus className="ml-2 h-4 w-4" /> اضافة جلسة جديدة
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-right font-bold w-32 whitespace-nowrap">التاريخ</TableHead>
                    <TableHead className="text-right font-bold w-32 whitespace-nowrap">الرول/الدائرة</TableHead>
                    <TableHead className="text-right font-bold min-w-[200px]">الطلبات / ما تم فيها</TableHead>
                    <TableHead className="text-right font-bold w-48 whitespace-nowrap">القرار اللاحق</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.hearings.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-500">لا يوجد جلسات مسجلة</TableCell></TableRow>
                  ) : (
                    data.hearings.map((h: any, index: number) => {
                      const isPast = new Date(h.hearingDate) < new Date();
                      return (
                        <TableRow key={h.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <TableCell className="font-semibold text-[#0A192F]">
                            <div className="flex flex-col gap-1">
                              <span dir="ltr" className="text-right">{new Date(h.hearingDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                              {!isPast && <Badge className="bg-green-100 text-green-800 w-fit text-[10px] px-1 py-0 hover:bg-green-200">قادمة</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{h.court || "-"}</span>
                              <span className="text-[10px] text-gray-500 mt-1">{h.circuit ? `دائرة: ${h.circuit}` : ""}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {h.requiredActions ? (
                              <p className="text-gray-800 text-sm leading-relaxed">{h.requiredActions}</p>
                            ) : <span className="text-gray-400">-</span>}
                          </TableCell>
                          <TableCell className="min-w-[150px]">
                            {h.result ? (
                              <p className="text-red-700 font-medium text-sm bg-red-50 p-2 rounded-md inline-block w-full">{h.result}</p>
                            ) : <span className="text-gray-400">-</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memos" className="mt-0 outline-none">
          {!isWritingMemo ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setIsWritingMemo(true)} className="bg-[#D4AF37] hover:bg-[#B8962E] text-white">
                  <FileSignature className="ml-2 h-4 w-4" /> كتابة مذكرة / صحيفة جديدة
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(data.memos || []).length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                    لا يوجد مذكرات مسجلة لهذه القضية بعد. يمكنك كتابة صحيفة الدعوى أو مذكرة المرافعة وتنسيقها هنا.
                  </div>
                ) : (
                  data.memos.map((memo: any) => (
                    <Card key={memo.id} className="shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                      <CardHeader className="pb-3 border-b border-gray-100">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg text-[#0A192F] line-clamp-1" title={memo.title}>{memo.title}</CardTitle>
                          <Badge variant="outline" className="bg-gray-50 text-[10px]">{memo.type === 'LAWSUIT' ? 'صحيفة دعوى' : memo.type === 'PLEADING' ? 'مرافعة' : 'مذكرة'}</Badge>
                        </div>
                        <CardDescription dir="ltr" className="text-right text-xs mt-2">
                          آخر تعديل: {new Date(memo.updatedAt).toLocaleDateString('ar-EG', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 flex-1">
                        <div 
                          className="text-gray-600 text-sm line-clamp-4 leading-relaxed font-serif"
                          dangerouslySetInnerHTML={{ __html: memo.content }}
                        />
                      </CardContent>
                      <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between gap-2 mt-auto rounded-b-xl">
                         <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-[#0A192F] hover:bg-white bg-white shadow-sm border border-gray-200"
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html dir="rtl">
                                    <head>
                                      <title>${memo.title}</title>
                                      <style>
                                        body { font-family: 'Tajawal', serif; padding: 50px; line-height: 1.8; }
                                        h1 { text-align: center; color: #0A192F; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
                                        .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                                        .content { font-size: 14pt; text-align: justify; }
                                      </style>
                                    </head>
                                    <body>
                                      <h1>${memo.title}</h1>
                                      <div class="meta">قضية رقم: ${data.caseNumber} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                                      <div class="content">${memo.content}</div>
                                      <script>window.onload = function() { window.print(); window.close(); }</script>
                                    </body>
                                  </html>
                                `);
                                printWindow.document.close();
                              }
                            }}
                          >
                            طباعة
                          </Button>
                          <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-800 hover:bg-purple-100" title="استخراج أهم النقاط القانونية بالذكاء الاصطناعي" onClick={() => setActiveAiTarget({ target: memo, type: 'memo' })}>
                            <Sparkles className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ) : (
            <Card className="shadow-sm border-blue-100">
              <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <FileSignature className="w-5 h-5 text-blue-600" />
                  كتابة مذكرة أو صحيفة جديدة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-bold text-[#0A192F]">عنوان المذكرة / المستند</label>
                    <Input 
                      placeholder="مثال: صحيفة دعوى تعويض، مذكرة دفاع..." 
                      className="text-lg bg-gray-50"
                      value={memoTitle}
                      onChange={e => setMemoTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#0A192F]">النوع</label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={memoType}
                      onChange={e => setMemoType(e.target.value)}
                    >
                      <option value="LAWSUIT">صحيفة دعوى</option>
                      <option value="MEMO">مذكرة رد / دفاع</option>
                      <option value="PLEADING">مذكرة مرافعة</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2 relative">
                  <label className="text-sm font-bold text-[#0A192F]">المحتوى</label>
                  <Button variant="outline" size="sm" className="absolute left-0 top-0 text-purple-600 border-purple-200 hover:bg-purple-50" title="اكتب المحتوى باستخدام الذكاء الاصطناعي">
                    <Sparkles className="ml-2 h-3 w-3" /> صياغة بالـ AI
                  </Button>
                  <RichTextEditor 
                    value={memoContent}
                    onChange={(val) => setMemoContent(val)}
                    placeholder="اكتب تفاصيل المذكرة هنا..." 
                  />
                  <p className="text-xs text-gray-400">يمكنك استخدام المحرر لكتابة الصيغة القانونية بالكامل وسيتم حفظها كمسودة قابلة للتعديل والطباعة.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button variant="outline" onClick={() => setIsWritingMemo(false)}>إلغاء</Button>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white" 
                    onClick={async () => {
                      await handleSaveMemo();
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html dir="rtl">
                            <head>
                              <title>${memoTitle}</title>
                              <style>
                                body { font-family: 'Tajawal', serif; padding: 50px; line-height: 1.8; }
                                h1 { text-align: center; color: #0A192F; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
                                .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                                .content { font-size: 14pt; text-align: justify; }
                              </style>
                            </head>
                            <body>
                              <h1>${memoTitle}</h1>
                              <div class="meta">قضية رقم: ${data.caseNumber} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                              <div class="content">${memoContent}</div>
                              <script>window.onload = function() { window.print(); window.close(); }</script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                    disabled={!memoTitle || !memoContent}
                  >
                    <Download className="ml-2 h-4 w-4" /> حفظ وطباعة فورية
                  </Button>
                  <Button 
                    className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white" 
                    onClick={handleSaveMemo}
                    disabled={!memoTitle || !memoContent}
                  >
                    <Save className="ml-2 h-4 w-4" /> حفظ المذكرة فقط
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="docs" className="mt-0 outline-none">
          <div className="space-y-4">

            {/* Client documents (read-only, shared) */}
            {(data.clientDocuments?.length ?? 0) > 0 && (
              <Card className="shadow-sm border-amber-200">
                <CardHeader className="pb-4 border-b border-amber-100 bg-amber-50/50">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-base text-amber-800">
                      مستندات الموكل ({data.clientDocuments.length})
                    </CardTitle>
                    <CardDescription className="mr-auto text-amber-600 text-xs">
                      تظهر تلقائياً من ملف الموكل — للتعديل اذهب إلى قائمة الموكلين
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50/30">
                        <TableHead className="text-right font-bold">اسم المستند</TableHead>
                        <TableHead className="text-right font-bold w-32">النوع</TableHead>
                        <TableHead className="text-right font-bold w-32">تاريخ الرفع</TableHead>
                        <TableHead className="text-center font-bold w-24">عرض</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.clientDocuments.map((d: any) => (
                        <TableRow key={d.id} className="hover:bg-amber-50/30">
                          <TableCell className="font-medium text-[#0A192F]">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                                {d.fileType?.startsWith("image/") ? (
                                  <img src={d.fileUrl} alt="" className="h-4 w-4 object-cover" />
                                ) : (
                                  <File className="h-4 w-4 text-amber-600" />
                                )}
                              </div>
                              {d.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-amber-200 text-amber-700">
                              {d.type === "POWER_OF_ATTORNEY" ? "توكيل"
                                : d.type === "CONTRACT" ? "عقد"
                                : d.type === "EVIDENCE" ? "دليل إثبات"
                                : d.type === "JUDGMENT" ? "حكم"
                                : d.type === "RECEIPT" ? "إيصال"
                                : "أخرى"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
                            {new Date(d.uploadDate).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setViewDocument(d)} title="عرض المستند">
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:bg-purple-50" onClick={() => setActiveAiTarget({ target: d, type: 'document' })} title="تحليل بالذكاء الاصطناعي">
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Case-specific documents */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
                <div>
                  <CardTitle className="text-lg">مستندات القضية والمرفقات</CardTitle>
                  <CardDescription>ارفع المستندات الورقية الخاصة بهذه القضية</CardDescription>
                </div>
                <Button size="sm" className="bg-[#D4AF37] hover:bg-[#B8962E] text-white" onClick={() => setIsAddDocOpen(true)}>
                  <Plus className="ml-2 h-4 w-4" /> رفع ملف جديد
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right font-bold">اسم المستند</TableHead>
                      <TableHead className="text-right font-bold w-32">النوع</TableHead>
                      <TableHead className="text-right font-bold w-32">تاريخ الرفع</TableHead>
                      <TableHead className="text-center font-bold w-32">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.documents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                          لا يوجد مستندات مرفوعة لهذه القضية
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.documents.map((d: any) => (
                        <TableRow key={d.id} className="hover:bg-gray-50/50">
                          <TableCell className="font-medium text-[#0A192F]">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-gray-100 rounded-lg shrink-0">
                                {d.fileType?.startsWith("image/") ? (
                                  <img src={d.fileUrl} alt="" className="h-4 w-4 object-cover" />
                                ) : (
                                  <File className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                              {d.name}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{d.type}</Badge></TableCell>
                          <TableCell dir="ltr" className="text-right text-gray-500">
                            {new Date(d.uploadDate).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50" onClick={() => setViewDocument(d)} title="عرض المستند">
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-800 hover:bg-purple-50" onClick={() => setActiveAiTarget({ target: d, type: 'document' })} title="تحليل المستند بالذكاء الاصطناعي">
                                <Sparkles className="h-4 w-4" />
                              </Button>
                              {d.fileUrl && d.fileUrl !== "local-file" && (
                                <a href={d.fileUrl} target="_blank" rel="noreferrer" download>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[#0A192F] hover:bg-gray-100" title="تحميل">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </a>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 outline-none">
           <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <CardTitle className="text-lg">المهام المتعلقة بالقضية</CardTitle>
              <Button size="sm" variant="outline" className="border-[#0A192F] text-[#0A192F]" onClick={() => setIsAddTaskOpen(true)}>
                <Plus className="ml-2 h-4 w-4" /> اضافة مهمة
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
               <Table>
                <TableBody>
                  {data.tasks.length === 0 ? (
                    <TableRow><TableCell className="text-center py-8 text-gray-500">لا يوجد مهام</TableCell></TableRow>
                  ) : (
                    data.tasks.map((t: any) => (
                      <TableRow key={t.id} className="hover:bg-gray-50/50">
                         <TableCell>
                           <div className="flex items-center gap-3">
                             <div className={`w-3 h-3 rounded-full ${t.priority === 'HIGH' || t.priority === 'URGENT' ? 'bg-red-500' : 'bg-blue-500'}`} />
                             <span className="font-medium text-[#0A192F]">{t.title}</span>
                           </div>
                         </TableCell>
                         <TableCell className="text-gray-500">{t.assigneeName || "-"}</TableCell>
                         <TableCell className="text-left w-32">
                           <Badge variant="secondary" className="font-normal">{t.status === 'COMPLETED' ? 'مكتملة' : t.status === 'NEW' ? 'جديدة' : 'قيد التنفيذ'}</Badge>
                         </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
               </Table>
            </CardContent>
           </Card>
        </TabsContent>

      </Tabs>
      </div>
    </div>
  );
}
