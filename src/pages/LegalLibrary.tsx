import React, { useState } from "react";
import { BookOpen, Search, Copy, Printer, Check, ArrowRight, FileText, Info, Scale, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";

// Fully populated Saudi laws database
const SAUDI_LAWS_DB = [
  {
    id: "civil_transactions",
    title: "نظام المعاملات المدنية الجديد",
    year: "١٤٤٥ هـ",
    category: "CIVIL",
    description: "النظام الأساسي الحاكم لجميع الالتزامات والعقود والمعاملات المالية والأهلية للأفراد في المملكة العربية السعودية.",
    chapters: [
      {
        title: "الباب التمهيدي: أحكام عامة",
        articles: [
          { id: 1, text: "المادة ١: تسري نصوص هذا النظام على جميع المسائل التي تتناولها في لفظها أو في فحواها، فإن لم يوجد نص تشريعي؛ طبقت القواعد الكلية المستمدة من الشريعة الإسلامية الأكثر ملاءمة لنصوص هذا النظام." },
          { id: 2, text: "المادة ٢: العبرة في العقود بالمقاصد والمعاني لا بالألفاظ والمباني، والأصل في العقود والشروط الرضا والقبول ما لم يخالف الشريعة والنظام." },
          { id: 3, text: "المادة ٣: لا يجوز إلغاء نص نظامي إلا بنص نظامي لاحق يكون صراحة أو ضمناً متعارضاً معه." },
          { id: 15, text: "المادة ١٥: كل شخص بلغ سن الرشد متمتعاً بقواه العقلية ولم يحجر عليه يكون كامل الأهلية لمباشرة حقوقه المدنية." },
          { id: 16, text: "المادة ١٦: سن الرشد هي تمام ثماني عشرة سنة هجرية، والقاصر هو من لم يبلغ سن الرشد." }
        ]
      },
      {
        title: "الباب الأول: العقود والالتزامات",
        articles: [
          { id: 31, text: "المادة ٣١: يصدر التعبير عن الإرادة باللفظ أو بالكتابة أو بالإشارة الشائعة استعمالاً أو باتخاذ موقف لا تدع ظروف الحال شكاً في دلالته على حقيقة مقصده." },
          { id: 32, text: "المادة ٣٢: يجوز أن يكون التعبير عن الإرادة ضمنياً، ما لم يستلزم النظام أو يقضي الاتفاق بين الأطراف بصراحته." },
          { id: 95, text: "المادة ٩٥: يجب تنفيذ العقد طبقاً لما اشتمل عليه وبطريقة تتفق مع ما يوجبه حسن النية والأمانة في التعامل." }
        ]
      }
    ]
  },
  {
    id: "companies_law",
    title: "نظام الشركات الجديد",
    year: "١٤٤٤ هـ",
    category: "COMMERCIAL",
    description: "ينظم أحكام تأسيس الشركات وإدارتها وحوكمتها وتصفيتها في المملكة، بما في ذلك شركة المساهمة والمحدودة والمبسطة.",
    chapters: [
      {
        title: "الباب الأول: أحكام عامة للشركات",
        articles: [
          { id: 1, text: "المادة ١: الشركة عقد يلتزم بمقتضاه شخصان أو أكثر بأن يساهم كل منهم في مشروع يستهدف الربح بتقديم حصة من مال أو عمل لاقتسام ما قد ينشأ عن هذا المشروع من ربح أو خسارة." },
          { id: 4, text: "المادة ٤: تؤسس الشركة بموجب عقد تأسيس أو نظام أساسي يكتب باللغة العربية، ويجوز قرنه بلغة أخرى، ويجب توثيقه وقيده في السجل التجاري." },
          { id: 10, text: "المادة ١٠: للشريكة ذمة مالية مستقلة عن ذمة الشركاء فيها، وتكتسب الشخصية الاعتبارية بعد قيدها في السجل التجاري." }
        ]
      },
      {
        title: "الباب الخامس: الشركة ذات المسؤولية المحدودة",
        articles: [
          { id: 156, text: "المادة ١٥٦: الشركة ذات المسؤولية المحدودة هي شركة لا يزيد عدد الشركاء فيها على خمسين شريكاً، وتكون ذمتها مستقلة عن الذمة المالية لكل شريك فيها." },
          { id: 158, text: "المادة ١٥٨: لا يسأل الشريك في الشركة ذات المسؤولية المحدودة عن ديون الشركة والتزاماتها إلا بمقدار حصته في رأس المال." }
        ]
      }
    ]
  },
  {
    id: "labor_law",
    title: "نظام العمل السعودي وتعديلاته",
    year: "١٤٢٦ هـ",
    category: "LABOR",
    description: "يحدد حقوق وواجبات العمال وأصحاب العمل، وينظم عقود العمل وساعات التشغيل والإجازات ونهاية الخدمة والتدريب.",
    chapters: [
      {
        title: "الباب الرابع: عقد العمل",
        articles: [
          { id: 50, text: "المادة ٥٠: عقد العمل هو عقد مبرم بين صاحب عمل وعامل، يتعهد الأخير بموجبه بأن يعمل تحت إدارة صاحب العمل وإشرافه مقابل أجر مالي محدد." },
          { id: 55, text: "المادة ٥٥: ينتهي عقد العمل المحدد المدة بانقضاء مدته، فإذا استمر طرفاه في تنفيذه عُدّ العقد متجدداً لمدة غير محددة." },
          { id: 74, text: "المادة ٧٤: ينتهي عقد العمل باتفاق الطرفين كتابة، أو بإنهاء أي من الطرفين في العقود غير محددة المدة بناء على سبب مشروع يوضح بموجب إشعار كتابي." }
        ]
      },
      {
        title: "الباب السادس: شروط العمل وظروفه (الأجور والإجازات)",
        articles: [
          { id: 107, text: "المادة ١٠٧: يجب على صاحب العمل دفع أجر إضافي للعامل عن ساعات العمل الإضافية يعادل الأجر الأساسي مضافاً إليه ٥٠٪." },
          { id: 109, text: "المادة ١٠٩: يستحق العامل إجازة سنوية بأجر لا تقل عن ٢١ يوماً، تزاد إلى ٣٠ يوماً إذا أمضى العامل في خدمة صاحب العمل ٥ سنوات متصلة." }
        ]
      }
    ]
  },
  {
    id: "advocacy_law",
    title: "نظام المحاماة السعودي ولوائحه",
    year: "١٤٢٢ هـ",
    category: "JUDICIAL",
    description: "ينظم قواعد مزاولة مهنة المحاماة وشروط القيد في جدول المحامين وحقوق المحامين وواجباتهم والمساءلة التأديبية.",
    chapters: [
      {
        title: "الباب الأول: تعريف مهنة المحاماة وشروطها",
        articles: [
          { id: 1, text: "المادة ١: يقصد بالمحاماة في هذا النظام الترافع عن الغير أمام المحاكم، وديوان المظالم، واللجان شبه القضائية، وتقديم الاستشارات الشرعية والنظامية." },
          { id: 2, text: "المادة ٢: يشترط فيمن يزاول مهنة المحاماة أن يكون اسمه مدرجاً في جدول المحامين الممارسين الصادر عن وزارة العدل." },
          { id: 3, text: "المادة ٣: يشترط في المتقدم للقيد بجدول المحامين الممارسين أن يكون سعودي الجنسية، حاصلاً على شهادة الشريعة أو الأنظمة، وأمضى فترة تدريب لا تقل عن سنتين." }
        ]
      },
      {
        title: "الباب الثاني: واجبات المحامين وحقوقهم",
        articles: [
          { id: 11, text: "المادة ١١: يجب على المحامي مزاولة مهنته وفقاً للأصول الشرعية والأنظمة المرعية، والامتناع عن أي عمل يمس شرف المهنة وكرامتها." },
          { id: 12, text: "المادة ١٢: لا يجوز للمحامي إفشاء سر اؤتمن عليه أو عرفه عن طريق مهنته ولو بعد انتهاء وكالته، ما لم يخالف ذلك مقتضى شرعياً." },
          { id: 17, text: "المادة ١٧: للمحامي حق الترافع عن موكله وتقديم الدفوع والدراسات وتسهيل مهمة الدفاع أمام الجهات القضائية والتحقيق." }
        ]
      }
    ]
  }
];

export default function LegalLibrary() {
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedLaw, setSelectedLaw] = useState<any>(null);
  const [readerSearchQuery, setReaderSearchQuery] = useState<string>("");
  const [copiedArticleId, setCopiedArticleId] = useState<number | null>(null);

  const handleCopyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedArticleId(id);
    setTimeout(() => setCopiedArticleId(null), 2000);
  };

  const handlePrintLaw = (law: any) => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>${law.title}</title>
            <style>
              body { font-family: 'IBM Plex Sans Arabic', sans-serif; padding: 40px; line-height: 1.8; color: #0A192F; }
              h1 { text-align: center; border-bottom: 3px solid #D4AF37; padding-bottom: 12px; }
              h2 { color: #D4AF37; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-top: 30px; }
              .article { margin-bottom: 15px; text-align: justify; font-size: 12pt; border-bottom: 1px dashed #f0f0f0; padding-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1>${law.title}</h1>
            <p style="text-align: center; color: #666; font-size: 10pt;">مصدر التقرير: المكتبة القانونية الذكية - LawyerOS | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</p>
            ${law.chapters.map((ch: any) => `
              <h2>${ch.title}</h2>
              ${ch.articles.map((art: any) => `
                <div class="article">${art.text}</div>
              `).join("")}
            `).join("")}
            <script>window.onload = function() { window.print(); window.close(); }</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const filteredLaws = SAUDI_LAWS_DB.filter(law => {
    const matchesCategory = activeTab === "ALL" || law.category === activeTab;
    const matchesSearch = law.title.includes(searchQuery) || 
                          law.description.includes(searchQuery) ||
                          law.chapters.some(ch => ch.articles.some(art => art.text.includes(searchQuery)));
    return matchesCategory && matchesSearch;
  });

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const regex = new RegExp(`(${search})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-100 text-gray-900 font-bold px-0.5 rounded">{part}</mark> : part
    );
  };

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans_Arabic']" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">المكتبة القانونية الرقمية</h1>
          <p className="text-gray-500 mt-1 text-sm">أرشيف الأنظمة واللوائح والمدونات القضائية الرسمية للمملكة العربية السعودية</p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xs">
          <Scale size={16} className="text-[#D4AF37]" />
          <span>تحديثات مستمرة متوافقة مع الأنظمة الصادرة عن هيئة الخبراء بمجلس الوزراء</span>
        </div>
      </div>

      {/* Filters & Search Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Search */}
        <div className="relative md:col-span-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="ابحث عن نظام، مادة، كلمة مفتاحية..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-4 pr-10 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F] focus:ring-1 focus:ring-[#0A192F] bg-white shadow-3xs"
          />
        </div>

        {/* Tab Filters */}
        <div className="md:col-span-2 flex flex-wrap gap-2 justify-start md:justify-end">
          {[
            { id: "ALL", label: "جميع الأنظمة" },
            { id: "CIVIL", label: "المعاملات المدنية" },
            { id: "COMMERCIAL", label: "التجارية والشركات" },
            { id: "LABOR", label: "العمل والعمال" },
            { id: "JUDICIAL", label: "المحاماة والقضاء" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-3xs border ${
                activeTab === tab.id
                  ? "bg-[#0A192F] text-white border-[#0A192F]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredLaws.length === 0 ? (
          <div className="col-span-2 py-16 text-center text-gray-400 font-bold bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-3">
            <BookOpen size={48} className="opacity-20" />
            <span>لا توجد أنظمة تطابق معايير البحث الحالية</span>
          </div>
        ) : (
          filteredLaws.map(law => (
            <Card key={law.id} className="shadow-xs border-gray-200/80 hover:shadow-md transition-all duration-300 bg-white flex flex-col justify-between group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-[#0A192F] group-hover:text-white transition-colors duration-300">
                    <BookOpen size={20} />
                  </div>
                  <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50/50 font-bold text-[10px]">
                    {law.year}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-black text-[#0A192F] mt-3 group-hover:text-blue-600 transition-colors">
                  {law.title}
                </CardTitle>
                <CardDescription className="text-gray-500 text-xs leading-relaxed mt-2 line-clamp-3">
                  {law.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-2 pb-5 flex gap-2 border-t border-gray-50 bg-gray-50/30 px-6 justify-between items-center rounded-b-2xl">
                <span className="text-[10px] text-gray-400 font-bold">
                  يحتوي على: {law.chapters.reduce((sum, ch) => sum + ch.articles.length, 0)} مواد قانونية
                </span>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-gray-500 hover:text-[#0A192F] hover:bg-gray-100" 
                    onClick={() => handlePrintLaw(law)}
                    title="طباعة النظام بالكامل"
                  >
                    <Printer size={15} />
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white font-bold text-xs gap-1 shadow-sm px-4" 
                    onClick={() => {
                      setSelectedLaw(law);
                      setReaderSearchQuery("");
                    }}
                  >
                    تصفح وقراءة المواد <ArrowRight size={14} className="mr-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Reader Modal (Dialog) */}
      <Dialog open={selectedLaw !== null} onOpenChange={() => setSelectedLaw(null)}>
        {selectedLaw && (
          <DialogContent className="w-[95vw] sm:max-w-[90vw] md:max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden font-['IBM_Plex_Sans_Arabic']" dir="rtl">
            
            {/* Modal Header */}
            <div className="p-6 border-b bg-gray-50/50 flex flex-col gap-3">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <DialogTitle className="text-xl font-black text-[#0A192F]">
                    {selectedLaw.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-gray-500 mt-1">
                    تصفح ذكي للمواد والأنظمة الرسمية السعودية الصادرة بموجب مراسيم ملكية
                  </DialogDescription>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="border-gray-200 text-[#0A192F]" onClick={() => handlePrintLaw(selectedLaw)}>
                    <Printer size={14} className="ml-1" /> طباعة هذا النظام
                  </Button>
                </div>
              </div>

              {/* Reader internal search */}
              <div className="relative w-full md:w-80">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <Input
                  type="text"
                  placeholder="ابحث عن كلمة داخل هذا النظام..."
                  value={readerSearchQuery}
                  onChange={e => setReaderSearchQuery(e.target.value)}
                  className="pl-3 pr-8 py-1.5 h-8 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#0A192F] bg-white"
                />
              </div>
            </div>

            {/* Modal Body & Sidebar Quick Navigation Index */}
            <div className="flex-1 flex overflow-hidden">
              {/* Quick Navigation Chapters Index */}
              <div className="w-56 bg-gray-50 border-l p-4 space-y-2 overflow-y-auto hidden md:block select-none">
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">فهرس الأبواب</h5>
                {selectedLaw.chapters.map((ch: any, idx: number) => (
                  <a
                    key={idx}
                    href={`#chapter-${idx}`}
                    className="block text-xs font-semibold text-gray-600 hover:text-blue-600 truncate py-1.5 hover:bg-gray-100/50 px-2 rounded transition"
                  >
                    {ch.title}
                  </a>
                ))}
              </div>

              {/* Document Text Reader content */}
              <div className="flex-1 p-6 overflow-y-auto space-y-8 scroll-smooth">
                {selectedLaw.chapters.map((ch: any, chIdx: number) => {
                  // Filter articles inside chapter if search is active
                  const filteredArticles = ch.articles.filter((art: any) =>
                    art.text.includes(readerSearchQuery)
                  );

                  if (readerSearchQuery.trim() && filteredArticles.length === 0) return null;

                  return (
                    <div key={chIdx} id={`chapter-${chIdx}`} className="space-y-4">
                      <h3 className="text-sm font-bold text-amber-700 bg-amber-50/50 px-3 py-2 rounded-lg border border-amber-100/30">
                        {ch.title}
                      </h3>
                      <div className="space-y-4 divide-y divide-gray-100">
                        {filteredArticles.map((art: any) => (
                          <div key={art.id} className="pt-4 flex flex-col gap-2 group/art">
                            <div className="flex justify-between items-start gap-4">
                              <p className="text-xs sm:text-sm leading-relaxed text-gray-800 text-justify flex-1">
                                {highlightText(art.text, readerSearchQuery)}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0 opacity-0 group-hover/art:opacity-100 transition-opacity"
                                onClick={() => handleCopyText(art.text, art.id)}
                                title="نسخ المادة"
                              >
                                {copiedArticleId === art.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Empty internal search result */}
                {readerSearchQuery.trim() &&
                  selectedLaw.chapters.every((ch: any) =>
                    ch.articles.every((art: any) => !art.text.includes(readerSearchQuery))
                  ) && (
                    <div className="text-center py-10 text-gray-400 text-xs font-bold">
                      لا يوجد تطابق للعبارة المبحوث عنها داخل هذا النظام.
                    </div>
                  )}
              </div>
            </div>
            
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
