import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Download, FileText, Image, File, Loader2, Table2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    name?: string;
    fileUrl?: string;
    fileType?: string;
    content?: string;
    type?: string;
    uploadDate?: string;
  } | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  POWER_OF_ATTORNEY: "توكيل",
  CONTRACT: "عقد",
  EVIDENCE: "دليل إثبات",
  JUDGMENT: "حكم",
  RECEIPT: "إيصال / حافظة",
  OTHER: "أخرى",
};

export function DocumentViewerModal({ isOpen, onClose, document: activeDoc }: DocumentViewerProps) {
  const [wordHtml, setWordHtml] = useState<string>("");
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState("");

  const [excelSheets, setExcelSheets] = useState<{ name: string; html: string }[]>([]);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState("");
  const [selectedExcelSheet, setSelectedExcelSheet] = useState(0);

  const hasFile = activeDoc ? (activeDoc.fileUrl && activeDoc.fileUrl !== "local-file" && activeDoc.fileUrl !== "") : false;
  const isImage = hasFile && activeDoc?.fileType?.startsWith("image/");
  const isPdf = hasFile && activeDoc?.fileType === "application/pdf";
  const hasText = activeDoc ? !!activeDoc.content : false;

  const fileNameLower = (activeDoc?.name || "").toLowerCase();
  const fileUrlLower = (activeDoc?.fileUrl || "").toLowerCase();
  
  const isDocx = hasFile && activeDoc && (
    fileNameLower.endsWith(".docx") || 
    fileUrlLower.includes(".docx") || 
    activeDoc.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const isExcel = hasFile && activeDoc && (
    fileNameLower.endsWith(".xlsx") || 
    fileNameLower.endsWith(".xls") || 
    fileUrlLower.includes(".xlsx") || 
    fileUrlLower.includes(".xls") || 
    activeDoc.fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    activeDoc.fileType === "application/vnd.ms-excel"
  );

  useEffect(() => {
    if (isOpen && activeDoc && hasFile) {
      if (isDocx) {
        setWordLoading(true);
        setWordError("");
        setWordHtml("");
        
        const loadMammoth = async () => {
          if (!(window as any).mammoth) {
            return new Promise<void>((resolve, reject) => {
              const script = window.document.createElement("script");
              script.src = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
              script.async = true;
              script.onload = () => resolve();
              script.onerror = (err) => reject(err);
              window.document.body.appendChild(script);
            });
          }
        };

        loadMammoth()
          .then(async () => {
            const res = await fetch(activeDoc.fileUrl!);
            const arrayBuffer = await res.arrayBuffer();
            const result = await (window as any).mammoth.convertToHtml({ arrayBuffer });
            setWordHtml(result.value || "<p className='text-gray-400 text-center'>الملف فارغ</p>");
          })
          .catch((err) => {
            console.error("Mammoth conversion error:", err);
            setWordError("فشل تحميل أو تحويل مستند الوورد. يرجى التأكد من اتصال الإنترنت أو تحميل الملف مباشرة.");
          })
          .finally(() => {
            setWordLoading(false);
          });
      }

      if (isExcel) {
        setExcelLoading(true);
        setExcelError("");
        setExcelSheets([]);
        
        const loadSheetJS = async () => {
          if (!(window as any).XLSX) {
            return new Promise<void>((resolve, reject) => {
              const script = window.document.createElement("script");
              script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
              script.async = true;
              script.onload = () => resolve();
              script.onerror = (err) => reject(err);
              window.document.body.appendChild(script);
            });
          }
        };

        loadSheetJS()
          .then(async () => {
            const res = await fetch(activeDoc.fileUrl!);
            const arrayBuffer = await res.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const workbook = (window as any).XLSX.read(data, { type: 'array' });
            
            const sheets = workbook.SheetNames.map((name: string) => {
              const worksheet = workbook.Sheets[name];
              const html = (window as any).XLSX.utils.sheet_to_html(worksheet, {
                header: '',
                footer: ''
              });
              return { name, html };
            });
            setExcelSheets(sheets);
            setSelectedExcelSheet(0);
          })
          .catch((err) => {
            console.error("SheetJS conversion error:", err);
            setExcelError("فشل تحميل أو تحويل جدول البيانات Excel. يرجى التأكد من اتصال الإنترنت أو تحميل الملف مباشرة.");
          })
          .finally(() => {
            setExcelLoading(false);
          });
      }
    } else {
      setWordHtml("");
      setWordError("");
      setExcelSheets([]);
      setExcelError("");
    }
  }, [isOpen, activeDoc]);

  if (!activeDoc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[850px] max-h-[92vh] flex flex-col overflow-hidden" dir="rtl">
        <DialogHeader className="shrink-0 border-b pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <DialogTitle className="text-xl font-bold text-[#0A192F] flex items-center gap-2">
              <File className="h-5 w-5 text-[#D4AF37]" />
              {activeDoc.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {activeDoc.type && (
                <Badge variant="outline" className="border-gray-200">
                  {DOC_TYPE_LABELS[activeDoc.type] || activeDoc.type}
                </Badge>
              )}
              {activeDoc.uploadDate && (
                <span className="text-xs text-gray-400 font-mono">
                  {new Date(activeDoc.uploadDate).toLocaleDateString("ar-EG")}
                </span>
              )}
              {hasFile && (
                <a href={activeDoc.fileUrl} target="_blank" rel="noreferrer" download>
                  <Button variant="outline" size="sm" className="border-[#0A192F] text-[#0A192F] hover:bg-gray-50">
                    <Download className="h-4 w-4 ml-1" /> تحميل الملف الأصلي
                  </Button>
                </a>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0 bg-gray-50/50 px-2">

          {/* No content at all */}
          {!hasFile && !hasText && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 bg-white rounded-2xl border border-gray-100">
              <FileText className="h-12 w-12 text-gray-300" />
              <p className="text-sm font-bold">لا يوجد ملف أو نص مرفق بهذا المستند</p>
              <p className="text-xs text-gray-300">يمكنك حذف هذا المستند وإعادة رفعه مرة أخرى</p>
            </div>
          )}

          {/* Word Viewer (.docx) */}
          {isDocx && (
            <div className="w-full">
              {wordLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-2xl border">
                  <Loader2 className="h-8 w-8 text-[#D4AF37] animate-spin" />
                  <p className="text-sm text-gray-500 font-bold">جاري قراءة ملف Word وتنسيقه...</p>
                </div>
              )}
              {wordError && (
                <div className="flex flex-col items-center justify-center p-8 gap-3 bg-red-50 text-red-700 rounded-2xl border border-red-100">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <p className="text-sm font-bold text-center">{wordError}</p>
                  <a href={activeDoc.fileUrl} target="_blank" rel="noreferrer" download className="mt-2">
                    <Button className="bg-[#0A192F] text-white">تحميل المستند الآن</Button>
                  </a>
                </div>
              )}
              {!wordLoading && !wordError && wordHtml && (
                <div className="bg-white border shadow-md rounded-2xl p-8 max-w-2xl mx-auto min-h-[50vh] font-serif leading-relaxed text-gray-800 text-justify overflow-x-auto word-document-view">
                  <style dangerouslySetInnerHTML={{ __html: `
                    .word-document-view table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    .word-document-view th, .word-document-view td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    .word-document-view th { bg-color: #f9f9f9; font-weight: bold; }
                    .word-document-view p { margin-bottom: 12px; font-size: 13pt; line-height: 1.7; text-indent: 15px; }
                    .word-document-view h1, .word-document-view h2, .word-document-view h3 { color: #0A192F; font-weight: bold; font-family: 'Tajawal', sans-serif; margin-top: 20px; }
                    .word-document-view h1 { font-size: 18pt; text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 8px; }
                    .word-document-view h2 { font-size: 15pt; }
                  `}} />
                  <div dangerouslySetInnerHTML={{ __html: wordHtml }} />
                </div>
              )}
            </div>
          )}

          {/* Excel Viewer (.xlsx / .xls) */}
          {isExcel && (
            <div className="w-full">
              {excelLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-2xl border">
                  <Loader2 className="h-8 w-8 text-green-600 animate-spin" />
                  <p className="text-sm text-gray-500 font-bold">جاري تحميل وقراءة جداول Excel...</p>
                </div>
              )}
              {excelError && (
                <div className="flex flex-col items-center justify-center p-8 gap-3 bg-red-50 text-red-700 rounded-2xl border border-red-100">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <p className="text-sm font-bold text-center">{excelError}</p>
                  <a href={activeDoc.fileUrl} target="_blank" rel="noreferrer" download className="mt-2">
                    <Button className="bg-[#0A192F] text-white">تحميل الملف</Button>
                  </a>
                </div>
              )}
              {!excelLoading && !excelError && excelSheets.length > 0 && (
                <div className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[70vh]">
                  <div className="flex bg-gray-100 border-b p-2 overflow-x-auto gap-2 shrink-0">
                    {excelSheets.map((sheet, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedExcelSheet(index)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          selectedExcelSheet === index
                            ? "bg-white text-green-700 shadow-sm border-t-2 border-green-600"
                            : "text-gray-600 hover:bg-white/50"
                        }`}
                      >
                        <Table2 size={14} className="text-green-600" />
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-auto p-4 excel-table-view">
                    <style dangerouslySetInnerHTML={{ __html: `
                      .excel-table-view table { border-collapse: collapse; width: 100%; font-size: 11pt; direction: rtl; text-align: right; }
                      .excel-table-view th, .excel-table-view td { border: 1px solid #e2e8f0; padding: 10px 14px; white-space: nowrap; }
                      .excel-table-view tr:nth-child(even) { background-color: #f8fafc; }
                      .excel-table-view tr:hover { background-color: #f1f5f9; }
                      .excel-table-view th { background-color: #f8fafc; font-weight: bold; color: #0A192F; position: sticky; top: 0; box-shadow: inset 0 -2px 0 #cbd5e1; }
                    `}} />
                    <div dangerouslySetInnerHTML={{ __html: excelSheets[selectedExcelSheet]?.html || "" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PDF viewer */}
          {isPdf && (
            <div className="w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm">
              <div className="flex items-center gap-2 p-2 bg-gray-100 border-b text-xs text-gray-500 font-bold">
                <FileText className="h-4 w-4 text-red-500" />
                ملف PDF مدمج — إذا لم يظهر، يرجى الضغط على زر تحميل بالأعلى
              </div>
              <iframe
                src={activeDoc.fileUrl}
                className="w-full"
                style={{ height: "60vh" }}
                title={activeDoc.name}
              />
            </div>
          )}

          {/* Image viewer */}
          {isImage && (
            <div className="flex justify-center">
              <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm max-w-full bg-white">
                <div className="flex items-center gap-2 p-2 bg-gray-100 border-b text-xs text-gray-500 font-bold">
                  <Image className="h-4 w-4 text-blue-500" />
                  صورة مستندة
                </div>
                <img
                  src={activeDoc.fileUrl}
                  alt={activeDoc.name}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            </div>
          )}

          {/* Unknown file type fallback */}
          {hasFile && !isImage && !isPdf && !isDocx && !isExcel && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-2xl border">
              <File className="h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500 font-bold">لا يمكن عرض هذا النوع من الملفات مباشرةً</p>
              <a href={activeDoc.fileUrl} target="_blank" rel="noreferrer" download>
                <Button className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white py-5 px-6 rounded-xl font-bold">
                  <Download className="ml-2 h-4 w-4" /> تحميل ومراجعة الملف
                </Button>
              </a>
            </div>
          )}

          {/* Extracted text (OCR fallback) */}
          {hasText && (
            <div className="rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
              <div className="flex items-center gap-2 p-3 bg-gray-50 border-b text-xs text-gray-500 font-bold">
                <FileText className="h-4 w-4 text-[#D4AF37]" />
                النص المستخرج / الملاحظات المرفقة
              </div>
              <div className="p-5 whitespace-pre-wrap font-serif leading-loose text-gray-800 text-sm text-justify">
                {activeDoc.content}
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
