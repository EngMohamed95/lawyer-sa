import React, { useEffect, useState, useMemo, useRef } from "react";
import { Plus, Search, File, Download, Folder, ChevronLeft, Home, User, Briefcase, Eye, Edit3, Trash2, Sparkles, FileSpreadsheet, Upload, FileCode, CheckCircle, AlertTriangle, Loader2, Bold, Italic, Underline, AlignRight, AlignCenter, AlignLeft, List, Heading1, Heading2, RotateCcw, Columns, Rows, FolderPlus, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { DocumentViewerModal } from "../components/DocumentViewerModal";
import RichTextEditor from "../components/RichTextEditor";
import { AddDocumentModal } from "../components/AddDocumentModal";
import { collection, getDocs, collectionGroup, query, where, doc, deleteDoc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

type ViewMode = 'CLIENTS' | 'CASES' | 'DOCS';
type HubTab = 'ARCHIVE' | 'WORD_GENERATOR' | 'EXCEL_IMPORTER';
type WordSubTab = 'TEMPLATES' | 'CUSTOM_TEMPLATES' | 'FREE_EDITOR';
type ExcelSubTab = 'IMPORTER' | 'FREE_SPREADSHEET';

interface LegalTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; defaultValue?: string; type?: string }[];
  generateHtml: (fields: Record<string, string>) => string;
}

const LEGAL_TEMPLATES: LegalTemplate[] = [
  {
    id: "power_of_attorney",
    name: "توكيل خاص بالقضايا",
    category: "توكيلات وإقرارات",
    description: "توكيل محامي لمباشرة قضية محددة أمام جهات المحاكم والنيابات المختصة.",
    fields: [
      { key: "lawyerName", label: "اسم المحامي الموكل", placeholder: "الأستاذ / محمد أحمد المحامي", defaultValue: localStorage.getItem("userName") || "" },
      { key: "lawyerDegree", label: "درجة قيد المحامي", placeholder: "المحامي لدى محكمة الاستئناف" },
      { key: "clientName", label: "اسم الموكل بالكامل", placeholder: "الاسم الرباعي للموكل" },
      { key: "clientNatId", label: "رقم الهوية للموكل", placeholder: "١٤ رقماً قومياً" },
      { key: "clientNationality", label: "جنسية الموكل", placeholder: "مصري", defaultValue: "مصري" },
      { key: "opponentName", label: "اسم الخصم", placeholder: "الاسم الكامل للطرف الخصم" },
      { key: "caseNumber", label: "رقم القضية (إن وجد)", placeholder: "مثال: ١٢٣٤ لسنة ٢٠٢٦" },
      { key: "courtName", label: "اسم المحكمة المختصة", placeholder: "محكمة القاهرة الابتدائية" },
    ],
    generateHtml: (data) => `
      <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: justify; padding: 20px; line-height: 1.8;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #0A192F; font-size: 20pt; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; display: inline-block;">عقد توكيل خاص في القضايا</h2>
        </div>
        <p><strong>أنا الموقع أدناه:</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 5px; width: 25%; font-weight: bold;">الاسم الكامل:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666;">${data.clientName || "................................................"}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">الجنسية:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666;">${data.clientNationality || "................................................"}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">رقم الهوية / جواز السفر:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666; font-family: monospace;">${data.clientNatId || "................................................"}</td>
          </tr>
        </table>
        
        <p>قد وكلت بموجب هذا المستند الأستاذ / <strong>${data.lawyerName || "................................................"}</strong>، المقيد بـ <strong>${data.lawyerDegree || "................................................"}</strong>، في الحضور والنيابة عني والتمثيل والدفاع في الدعوى القضائية المقامة مني / أو ضدي:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 5px; width: 25%; font-weight: bold;">ضد الخصم السيد:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666;">${data.opponentName || "................................................"}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">في القضية رقم:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666;">${data.caseNumber || "................................................"}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">أمام محكمة:</td>
            <td style="padding: 5px; border-bottom: 1px dotted #666;">${data.courtName || "................................................"}</td>
          </tr>
        </table>

        <p>وللوكيل الحق في الحضور والمرافعة وتقديم المذكرات وصحف الدعاوى والأدلة وحق التوقيع والصلح والإقرار والإنكار والتصالح وطلب التأجيل والتنازل عن الخصومة والدفاع والمباشرة مع كافة الجهات القضائية والنيابات العامة ومكاتب الخبراء والشرطة والاستئناف والمعارضة والتمييز، وكل ما تقتضيه المصلحة القانونية لمجرى القضية.</p>
        <p>وهذا توكيل خاص مني بذلك يجري العمل بموجبه رسمياً وقانونياً.</p>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 20px;">
          <div style="text-align: center; width: 45%;">
            <p><strong>الموكل بما فيه (الموقع):</strong></p>
            <p style="margin-top: 40px;">التوقيع: .......................................</p>
            <p>البصمة: .......................................</p>
          </div>
          <div style="text-align: center; width: 45%;">
            <p><strong>الوكيل المقر بالقبول:</strong></p>
            <p style="margin-top: 40px;">الأستاذ: ${data.lawyerName || "......................................."}</p>
            <p>التوقيع: .......................................</p>
          </div>
        </div>
      </div>
    `
  },
  {
    id: "lease_contract",
    name: "عقد إيجار شقة سكنية",
    category: "عقود وإيجارات",
    description: "عقد إيجار محدد المدة وموثق طبقاً لأحكام القانون المدني لشقة سكنية.",
    fields: [
      { key: "lessorName", label: "اسم المؤجر (الطرف الأول)", placeholder: "اسم مالك العقار بالكامل" },
      { key: "lessorId", label: "هوية المؤجر", placeholder: "الرقم القومي للمؤجر" },
      { key: "lesseeName", label: "اسم المستأجر (الطرف الثاني)", placeholder: "اسم المستأجر بالكامل" },
      { key: "lesseeId", label: "هوية المستأجر", placeholder: "الرقم القومي للمستأجر" },
      { key: "apartmentAddress", label: "عنوان الشقة بالتفصيل", placeholder: "رقم الشقة، الطابق، الشارع، المدينة" },
      { key: "rentAmount", label: "القيمة الإيجارية شهرياً", placeholder: "مثال: ٣,٥٠٠ جنيه مصري" },
      { key: "contractDuration", label: "مدة العقد", placeholder: "سنة واحدة / سنتين" },
      { key: "startDate", label: "تاريخ بدء الإيجار", placeholder: "YYYY-MM-DD", type: "date" },
    ],
    generateHtml: (data) => `
      <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: justify; padding: 20px; line-height: 1.8;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #0A192F; font-size: 20pt; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; display: inline-block;">عقد إيجار شقة سكنية خاضع للقانون المدني</h2>
        </div>
        <p>إنه في يوم الموافق <strong>${data.startDate || "..................."}</strong> تم الاتفاق والتحرير بين كل من:</p>
        
        <ol>
          <li style="margin-bottom: 10px;">
            <strong>الطرف الأول (المؤجر):</strong> السيد/ <strong>${data.lessorName || "................................................"}</strong>، الحامل لبطاقة الرقم القومي رقم: <span style="font-family: monospace;">${data.lessorId || "..................................."}</span> المقيم في العنوان المذكور بهويته.
          </li>
          <li style="margin-bottom: 10px;">
            <strong>الطرف الثاني (المستأجر):</strong> السيد/ <strong>${data.lesseeName || "................................................"}</strong>، الحامل لبطاقة الرقم القومي رقم: <span style="font-family: monospace;">${data.lesseeId || "..................................."}</span> المقيم في العنوان المذكور بهويته.
          </li>
        </ol>

        <p><strong>بند تمهيدي:</strong> بموجب هذا العقد قد أجر الطرف الأول للطرف الثاني شقة سكنية كائنة في: <strong>${data.apartmentAddress || "................................................"}</strong>، بقصد استخدامها للسكن العائلي فقط وليس لأي غرض تجاري أو صناعي آخر.</p>
        
        <p><strong>البند الأول (المدة):</strong> مدة هذا العقد هي <strong>${data.contractDuration || "..................."}</strong> تبدأ من تاريخ <strong>${data.startDate || "..................."}</strong> وتنتهي بقوة القانون والاتفاق دون الحاجة إلى إنذار أو تنبيه.</p>
        
        <p><strong>البند الثاني (الأجرة):</strong> اتفق الطرفان على أن القيمة الإيجارية الشهرية هي <strong>${data.rentAmount || "..................."}</strong> تدفع مقدماً في أول كل شهر للطرف الأول، ويلتزم الطرف الأول بتسليم إيصال موقع يفيد الاستلام.</p>
        
        <p><strong>البند الثالث (المرافق والالتزامات):</strong> يتعهد الطرف الثاني (المستأجر) بالمحافظة التامة على الشقة المؤجرة وملحقاتها، ويدفع فواتير الكهرباء والمياه والغاز والإنترنت طوال فترة إقامته بالشقة، ويسلمها عند نهاية المدة بحالتها الممتازة التي استلمها عليها.</p>

        <p>تحرر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها عند اللزوم.</p>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 20px;">
          <div style="text-align: center; width: 45%;">
            <p><strong>الطرف الأول (المؤجر):</strong></p>
            <p style="margin-top: 40px;">التوقيع: .......................................</p>
          </div>
          <div style="text-align: center; width: 45%;">
            <p><strong>الطرف الثاني (المستأجر):</strong></p>
            <p style="margin-top: 40px;">التوقيع: .......................................</p>
          </div>
        </div>
      </div>
    `
  },
  {
    id: "sales_contract",
    name: "عقد بيع ابتدائي لعقار",
    category: "عقود وإيجارات",
    description: "عقد بيع ابتدائي لشقة سكنية أو عقار مبني مع بيان شروط الثمن والتسليم.",
    fields: [
      { key: "sellerName", label: "اسم البائع (الطرف الأول)", placeholder: "اسم البائع بالكامل" },
      { key: "sellerId", label: "هوية البائع", placeholder: "الرقم القومي للبائع" },
      { key: "buyerName", label: "اسم المشتري (الطرف الثاني)", placeholder: "اسم المشتري بالكامل" },
      { key: "buyerId", label: "هوية المشتري", placeholder: "الرقم القومي للمشتري" },
      { key: "propertyDetails", label: "مواصفات العقار بالكامل", placeholder: "الشقة رقم.. بالعمارة رقم.. الكائنة في..." },
      { key: "priceAmount", label: "الثمن الإجمالي للعقار", placeholder: "مثال: ٨٥٠,٠٠٠ جنيه مصري" },
      { key: "paymentMethod", label: "طريقة الدفع والتسليم", placeholder: "كاش دفعة واحدة / دفعة مقدمة والباقي أقساط" },
    ],
    generateHtml: (data) => `
      <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: justify; padding: 20px; line-height: 1.8;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #0A192F; font-size: 20pt; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; display: inline-block;">عقد بيع ابتدائي لعقار مبني</h2>
        </div>
        <p>إنه في يوم الموافق تم الاتفاق والتحرير بين كل من:</p>
        
        <ol>
          <li style="margin-bottom: 10px;">
            <strong>الطرف الأول (البائع):</strong> السيد/ <strong>${data.sellerName || "................................................"}</strong>، الحامل لبطاقة الرقم القومي رقم: <span style="font-family: monospace;">${data.sellerId || "..................................."}</span>.
          </li>
          <li style="margin-bottom: 10px;">
            <strong>الطرف الثاني (المشتري):</strong> السيد/ <strong>${data.buyerName || "................................................"}</strong>، الحامل لبطاقة الرقم القومي رقم: <span style="font-family: monospace;">${data.buyerId || "..................................."}</span>.
          </li>
        </ol>

        <p><strong>بند تمهيدي:</strong> يمتلك الطرف الأول (البائع) العقار/الشقة السكنية الكائنة في: <strong>${data.propertyDetails || "................................................"}</strong>، ورغبة منه في البيع وقبول الطرف الثاني المشتري للشراء، فقد تم الاتفاق على الآتي:</p>
        
        <p><strong>البند الأول (موضوع البيع):</strong> باع وأسقط وتنازل الطرف الأول بكافة الضمانات الفعلية والقانونية إلى الطرف الثاني المشتري القابل لذلك العقار المذكور في التمهيد.</p>
        
        <p><strong>البند الثاني (الثمن وطريقة السداد):</strong> تم هذا البيع لقاء ثمن إجمالي متفق عليه قدره <strong>${data.priceAmount || "..................."}</strong> يدفعها المشتري للبائع على النحو التالي: <strong>${data.paymentMethod || "دفع كاش بالكامل عند التوقيع واستلم البائع المبلغ ويعد توقيعه على هذا العقد إقراراً بالاستلام."}</strong></p>
        
        <p><strong>البند الثالث (نقل الملكية والتسليم):</strong> يلتزم الطرف الأول البائع بتقديم كافة المستندات والتراخيص ونقل تسلسل الملكية وتسهيل إجراءات التسجيل النهائي في الشهر العقاري لصالح المشتري، كما يقر بتسليم حيازة العقار للمشتري خالية من أي موانع أو ديون أو رهونات عقارية فور توقيع العقد.</p>

        <p>تحرر هذا العقد من نسختين أصليتين بيد كل طرف نسخة للعمل بها.</p>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 20px;">
          <div style="text-align: center; width: 45%;">
            <p><strong>الطرف الأول (البائع):</strong></p>
            <p style="margin-top: 40px;">التوقيع: .......................................</p>
          </div>
          <div style="text-align: center; width: 45%;">
            <p><strong>الطرف الثاني (المشتري):</strong></p>
            <p style="margin-top: 40px;">التوقيع: .......................................</p>
          </div>
        </div>
      </div>
    `
  },
  {
    id: "financial_lawsuit",
    name: "صحيفة دعوى مطالبة مالية",
    category: "صحف الدعاوى والافتتاح",
    description: "صحيفة افتتاح دعوى أمام المحكمة الابتدائية للمطالبة بمستحقات مالية متأخرة.",
    fields: [
      { key: "lawyerName", label: "المحامي وكيل المدعي", placeholder: "اسمك أو مكتب المحاماة", defaultValue: localStorage.getItem("userName") || "" },
      { key: "plaintiffName", label: "اسم المدعي (الموكل)", placeholder: "اسم المدعي بالكامل" },
      { key: "defendantName", label: "اسم المدعى عليه (الخصم)", placeholder: "اسم المدعى عليه بالكامل" },
      { key: "amountOwed", label: "المبلغ المطالب به", placeholder: "مثال: ١٥٠,٠٠٠ جنيه مصري" },
      { key: "reasonOfDebt", label: "سبب الدين والمستند السند", placeholder: "عقد توريد، إيصال أمانة، شيك بنكي" },
      { key: "courtName", label: "المحكمة المرفوعة أمامها", placeholder: "محكمة الجيزة الابتدائية - الدائرة المدنية" },
    ],
    generateHtml: (data) => `
      <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: justify; padding: 20px; line-height: 1.8;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0A192F; font-size: 18pt; font-weight: bold; margin-bottom: 5px;">صحيفة افتتاح دعوى مطالبة مالية</h2>
          <p style="font-size: 11pt; color: #666; margin: 0;">أمام محكمة: ${data.courtName || "................................................"}</p>
        </div>
        
        <p><strong>بناءً على طلب:</strong> السيد/ <strong>${data.plaintiffName || "................................................"}</strong>، المقيم في ومحله المختار مكتب الأستاذ / <strong>${data.lawyerName || "................................................"}</strong> المحامي.</p>
        
        <p>أنا محضر محكمة <strong>${data.courtName || "..................."}</strong> قد انتقلت في تاريخه وأعلنت:</p>
        <p>السيد/ <strong>${data.defendantName || "................................................"}</strong>، المقيم في: ................................................................. مخاطباً مع / ............................</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <h3 style="color: #D4AF37; font-size: 15pt; border-bottom: 1px solid #D4AF37; display: inline-block; padding-bottom: 5px;">الموضــــوع</h3>
        </div>
        
        <p>يطالب الطالب (المدعي) المعلن إليه (المدعى عليه) بسداد مبلغ مالي وقدره <strong>${data.amountOwed || "..................."}</strong> ترصد في ذمته لصالحه بموجب: <strong>${data.reasonOfDebt || "................................................................"}</strong>.</p>
        <p>وحيث أن الطالب طالب المعلن إليه مراراً وتكراراً بالطرق الودية بسداد هذا الدين والمبلغ المستحق، إلا أنه امتنع وراوغ دون وجه حق أو مسوغ قانوني، مما أصاب الطالب بأضرار بالغة وأجبره على اللجوء للقضاء لإقامة هذه الدعوى.</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <h3 style="color: #D4AF37; font-size: 15pt; border-bottom: 1px solid #D4AF37; display: inline-block; padding-bottom: 5px;">بناءً عليــــه</h3>
        </div>
        
        <p>أنا المحضر سالف الذكر قد انتقلت وأعلنت المعلن إليه بصورة من هذه الصحيفة، وكلفته بالحضور أمام محكمة <strong>${data.courtName || "..................."}</strong> الكائن مقرها بـ ....................... بجلستها المنعقدة علناً في يوم الموافق / / ٢٠٢٦ من الساعة التاسعة صباحاً وما بعدها، ليسمع الحكم عليه بـ:</p>
        
        <ol>
          <li>إلزام المعلن إليه بأن يؤدي للطالب مبلغاً وقدره <strong>${data.amountOwed || "..................."}</strong> مع الفوائد القانونية من تاريخ المطالبة القضائية وحتى تمام السداد.</li>
          <li>إلزام المعلن إليه بالمصاريف القضائية ومقابل أتعاب المحاماة.</li>
        </ol>
        <p style="text-align: left; margin-top: 40px; font-weight: bold;">وكيل المدعي الأستاذ المحامي: ..............................</p>
      </div>
    `
  },
  {
    id: "legal_warning",
    name: "إنذار رسمي على يد محضر",
    category: "توكيلات وإقرارات",
    description: "إنذار رسمي يوجه للخصم بضرورة تنفيذ التزام أو تسوية خلاف لتفادي القضاء.",
    fields: [
      { key: "lawyerName", label: "المحامي وكيل المنذر", placeholder: "اسم المحامي", defaultValue: localStorage.getItem("userName") || "" },
      { key: "notifierName", label: "اسم المنذر (الطالب)", placeholder: "اسم المنذر صاحب الحق" },
      { key: "notifiedName", label: "اسم المنذر إليه (الخصم)", placeholder: "اسم الخصم المنذر إليه" },
      { key: "warningSubject", label: "موضوع الإنذار والطلب", placeholder: "تسليم الشقة، سداد قيمة إيصال الأمانة، الالتزام بالعقد" },
      { key: "periodAllowed", label: "المهلة المحددة للاستجابة", placeholder: "١٥ يوماً / أسبوع واحد", defaultValue: "١٥ يوماً" },
      { key: "courtName", label: "محكمة المحضر المختصة", placeholder: "محكمة شمال القاهرة الابتدائية - قلم المحضرين" },
    ],
    generateHtml: (data) => `
      <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: justify; padding: 20px; line-height: 1.8;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0A192F; font-size: 18pt; font-weight: bold; margin-bottom: 5px;">إنذار رسمي على يد محضر</h2>
          <p style="font-size: 11pt; color: #666; margin: 0;">تابع لـ: ${data.courtName || "................................................"}</p>
        </div>
        
        <p><strong>بناءً على طلب:</strong> السيد/ <strong>${data.notifierName || "................................................"}</strong>، المقيم في ومحله المختار مكتب الأستاذ / <strong>${data.lawyerName || "................................................"}</strong> المحامي الكائن بـ .....................................</p>
        
        <p>أنا محضر محكمة <strong>${data.courtName || "..................."}</strong> قد انتقلت في تاريخه وأعلنت:</p>
        <p>السيد/ <strong>${data.notifiedName || "................................................"}</strong>، المقيم في: ................................................................. مخاطباً مع / ............................</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <h3 style="color: #D4AF37; font-size: 15pt; border-bottom: 1px solid #D4AF37; display: inline-block; padding-bottom: 5px;">الإنــــــــذار</h3>
        </div>
        
        <p>ينذر الطالب المنذر إليه بضرورة الوفاء بالتزامه الفوري المتمثل في: <strong>${data.warningSubject || "................................................................"}</strong>.</p>
        <p>وينبه الطالب على المنذر إليه بضرورة تنفيذ الالتزام المذكور أعلاه بشكل ودي وتام خلال مهلة أقصاها <strong>${data.periodAllowed || "١٥ يوماً"}</strong> من تاريخ استلام هذا الإنذار.</p>
        <p>وإلا فإن الطالب سيضطر آسفاً لاتخاذ كافة الإجراءات القانونية والقضائية ضده بما فيها إقامة الدعاوى المدنية أو الجنائية للمحافظة على كامل حقوقه، مع تحميل المنذر إليه كافة المصاريف والأتعاب والتعويضات عن التأخير والأضرار.</p>
        
        <p><strong>ولأجل العلم،</strong> أرفقت صورة من هذا الإنذار للمنذر إليه للعلم بمحتواها والعمل بموجبها والامتثال لشروطها.</p>
        <p style="text-align: left; margin-top: 40px; font-weight: bold;">وكيل المنذر الأستاذ المحامي: ..............................</p>
      </div>
    `
  }
];

export default function Documents() {
  const [loading, setLoading] = useState(true);
  const [activeAiDoc, setActiveAiDoc] = useState<any>(null);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<HubTab>('ARCHIVE');

  // Sub-tabs states
  const [wordSubTab, setWordSubTab] = useState<WordSubTab>('TEMPLATES');
  const [excelSubTab, setExcelSubTab] = useState<ExcelSubTab>('IMPORTER');

  // Excel Importer states
  const [importType, setImportType] = useState<'CLIENTS' | 'CASES'>('CLIENTS');
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [excelError, setExcelError] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [importSuccessMessage, setImportSuccessMessage] = useState("");
  const [excelParsedCount, setExcelParsedCount] = useState(0);

  // Word Generator states
  const [selectedTemplateId, setSelectedTemplateId] = useState("power_of_attorney");
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});

  // Custom templates and folders states
  const [folders, setFolders] = useState<any[]>([]);
  const [customTemplates, setCustomTemplates] = useState<any[]>([]);
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState<string | null>(null);
  const [customTemplateValues, setCustomTemplateValues] = useState<Record<string, string>>({});

  // Custom template create/edit states
  const [isEditingCustomTemplate, setIsEditingCustomTemplate] = useState(false);
  const [editingCustomTemplateData, setEditingCustomTemplateData] = useState<{
    id?: string;
    name: string;
    folderId: string;
    description: string;
    body: string;
  } | null>(null);

  // Custom folder modal states
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [folderModalData, setFolderModalData] = useState<{ id?: string; name: string } | null>(null);

  // Expanded folders in accordion state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Free Word Editor states
  const [freeDocTitle, setFreeDocTitle] = useState("مستند قانوني جديد");
  const [freeEditorContent, setFreeEditorContent] = useState(
    `<h2 style="text-align: center; color: #0A192F; font-family: 'Tajawal', sans-serif;">عنوان المستند المكتوب من الصفر</h2><p>اكتب هنا عقداً مخصصاً أو مذكرة قانونية متكاملة... يمكنك استخدام خيارات التنسيق بالأعلى لتغيير أنواع الخطوط، إدراج الجداول، وتغيير الألوان والحدود.</p>`
  );

  // Document Upload Modal state
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);

  // Free Excel Spreadsheet states
  const [freeExcelTitle, setFreeExcelTitle] = useState("جدول بيانات جديد");
  const [spreadsheetHeaders, setSpreadsheetHeaders] = useState<string[]>(["العمود ١", "العمود ٢", "العمود ٣", "العمود ٤", "العمود ٥", "العمود ٦"]);
  const [spreadsheetRows, setSpreadsheetRows] = useState<string[][]>([
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
  ]);

  const [allData, setAllData] = useState<{
    clients: any[];
    cases: any[];
    documents: any[];
  }>({ clients: [], cases: [], documents: [] });

  const [navigation, setNavigation] = useState<{
    mode: ViewMode;
    clientId: string | null;
    caseId: string | null;
  }>({ mode: 'CLIENTS', clientId: null, caseId: null });

  const lawyerId = localStorage.getItem("lawyerId");
  const userRole = localStorage.getItem("userRole");

  const [viewDocument, setViewDocument] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      let casesQ: any = collection(db, "cases");
      let clientsQ: any = collection(db, "clients");
      let docsQ: any = collectionGroup(db, "documents");
      let foldersQ: any = collection(db, "template_folders");
      let customTemplatesQ: any = collection(db, "custom_templates");

      if (userRole !== "SUPER_ADMIN") {
        casesQ = query(collection(db, "cases"), where("lawyerId", "==", lawyerId));
        clientsQ = query(collection(db, "clients"), where("lawyerId", "==", lawyerId));
        foldersQ = query(collection(db, "template_folders"), where("lawyerId", "==", lawyerId));
        customTemplatesQ = query(collection(db, "custom_templates"), where("lawyerId", "==", lawyerId));
      }

      const [docsSnap, casesSnap, clientsSnap, foldersSnap, customTemplatesSnap] = await Promise.all([
        getDocs(docsQ),
        getDocs(casesQ),
        getDocs(clientsQ),
        getDocs(foldersQ),
        getDocs(customTemplatesQ)
      ]);
      
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const cases = casesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const documents = docsSnap.docs
        .map(doc => {
          const d = doc.data() as any;
          const parentId = doc.ref.parent.parent?.id;
          const parentPath = doc.ref.parent.parent?.path || "";
          const parentType = parentPath.split('/')[0];
          return { id: doc.id, fullPath: doc.ref.path, ...d, parentId, parentType };
        })
        .filter(d => userRole === "SUPER_ADMIN" || d.lawyerId === lawyerId);

      const fetchedFolders = foldersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const fetchedCustomTemplates = customTemplatesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      setFolders(fetchedFolders);
      setCustomTemplates(fetchedCustomTemplates);
      setAllData({ clients, cases, documents });
    } catch (error) {
      console.error("Error fetching documents data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [lawyerId, userRole]);

  // Helper to extract unique placeholders from custom template body
  const parseCustomPlaceholders = (htmlContent: string) => {
    if (!htmlContent) return [];
    // We search for anything inside {{ ... }}
    const matches = htmlContent.match(/\{\{([^}]+)\}\}/g) || [];
    return Array.from(new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))).filter(Boolean);
  };

  // custom templates selection & helper functions
  useEffect(() => {
    if (selectedCustomTemplateId) {
      const template = customTemplates.find(t => t.id === selectedCustomTemplateId);
      if (template) {
        const placeholders = parseCustomPlaceholders(template.body);
        const initialValues: Record<string, string> = {};
        placeholders.forEach(placeholder => {
          initialValues[placeholder] = "";
        });
        setCustomTemplateValues(initialValues);
      }
    }
  }, [selectedCustomTemplateId, customTemplates]);

  const activeCustomTemplate = useMemo(() => {
    return customTemplates.find(t => t.id === selectedCustomTemplateId) || null;
  }, [selectedCustomTemplateId, customTemplates]);

  // Helper to substitute values in the HTML content
  const renderCustomTemplateHtml = (htmlContent: string, values: Record<string, string>) => {
    if (!htmlContent) return "";
    let result = htmlContent;
    const placeholders = parseCustomPlaceholders(htmlContent);
    placeholders.forEach(placeholder => {
      const val = values[placeholder] || `<span style="color: #bbb; border-bottom: 1px dotted #bbb;">....................</span>`;
      // Escape special regex characters in placeholder
      const escapedPlaceholder = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${escapedPlaceholder}\\s*\\}\\}`, 'g');
      result = result.replace(regex, val);
    });
    return result;
  };

  // Folder Operations
  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lawyerId) return alert("معرف المحامي غير متوفر");
    if (!folderModalData?.name.trim()) return alert("يرجى إدخال اسم المجلد");

    try {
      if (folderModalMode === 'CREATE') {
        await addDoc(collection(db, "template_folders"), {
          name: folderModalData.name.trim(),
          lawyerId,
          createdAt: new Date().toISOString()
        });
      } else if (folderModalMode === 'EDIT' && folderModalData.id) {
        await updateDoc(doc(db, "template_folders", folderModalData.id), {
          name: folderModalData.name.trim()
        });
      }
      setIsFolderModalOpen(false);
      setFolderModalData(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("فشل حفظ المجلد: " + err.message);
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const templatesInFolder = customTemplates.filter(t => t.folderId === folderId);
    if (templatesInFolder.length > 0) {
      if (!confirm(`المجلد "${folderName}" يحتوي على ${templatesInFolder.length} من النماذج. هل أنت متأكد من حذف المجلد وجميع القوالب بداخله؟`)) {
        return;
      }
    } else {
      if (!confirm(`هل أنت متأكد من حذف مجلد "${folderName}"؟`)) return;
    }

    try {
      for (const t of templatesInFolder) {
        await deleteDoc(doc(db, "custom_templates", t.id));
      }
      await deleteDoc(doc(db, "template_folders", folderId));
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("فشل حذف المجلد: " + err.message);
    }
  };

  // Custom Template Operations
  const handleSaveCustomTemplate = async () => {
    if (!lawyerId) return alert("معرف المحامي غير متوفر");
    if (!editingCustomTemplateData?.name.trim()) return alert("يرجى إدخال اسم النموذج");
    if (!editingCustomTemplateData?.folderId) return alert("يرجى اختيار مجلد للنموذج");
    if (!editingCustomTemplateData?.body.trim()) return alert("محتوى النموذج لا يمكن أن يكون فارغاً");

    try {
      if (editingCustomTemplateData.id) {
        await updateDoc(doc(db, "custom_templates", editingCustomTemplateData.id), {
          name: editingCustomTemplateData.name.trim(),
          folderId: editingCustomTemplateData.folderId,
          description: editingCustomTemplateData.description.trim(),
          body: editingCustomTemplateData.body
        });
      } else {
        const docRef = await addDoc(collection(db, "custom_templates"), {
          name: editingCustomTemplateData.name.trim(),
          folderId: editingCustomTemplateData.folderId,
          description: editingCustomTemplateData.description.trim(),
          body: editingCustomTemplateData.body,
          lawyerId,
          createdAt: new Date().toISOString()
        });
        setSelectedCustomTemplateId(docRef.id);
      }
      setIsEditingCustomTemplate(false);
      setEditingCustomTemplateData(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ النموذج: " + err.message);
    }
  };

  const handleDeleteCustomTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`هل أنت متأكد من حذف القالب "${templateName}"؟`)) return;
    try {
      await deleteDoc(doc(db, "custom_templates", templateId));
      if (selectedCustomTemplateId === templateId) {
        setSelectedCustomTemplateId(null);
      }
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("فشل حذف القالب: " + err.message);
    }
  };

  // Set default form values when template changes
  const activeTemplate = useMemo(() => {
    const template = LEGAL_TEMPLATES.find(t => t.id === selectedTemplateId);
    if (template) {
      const initialValues: Record<string, string> = {};
      template.fields.forEach(field => {
        initialValues[field.key] = field.defaultValue || "";
      });
      setTemplateValues(initialValues);
    }
    return template;
  }, [selectedTemplateId]);

  const handleDeleteDoc = async (document: any) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستند؟")) return;
    try {
      await deleteDoc(doc(db, document.fullPath));
      fetchData();
    } catch (e) {
      console.error(e);
      alert("فشل الحذف");
    }
  };

  const handleUpdateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, editingDoc.fullPath), {
        name: editingDoc.name,
        type: editingDoc.type
      });
      setEditingDoc(null);
      fetchData();
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء التحديث");
    }
  };

  // Hierarchy Navigation Logic
  const currentItems = useMemo(() => {
    if (navigation.mode === 'CLIENTS') {
      return allData.clients.filter(c => 
        search ? c.fullName?.toLowerCase().includes(search.toLowerCase()) : true
      );
    }
    if (navigation.mode === 'CASES') {
      return allData.cases.filter(c => 
        c.clientId === navigation.clientId && 
        (search ? c.title?.toLowerCase().includes(search.toLowerCase()) : true)
      );
    }
    if (navigation.mode === 'DOCS') {
      return allData.documents.filter(d => 
        (d.parentId === navigation.caseId || d.parentId === navigation.clientId) && 
        (search ? d.name?.toLowerCase().includes(search.toLowerCase()) : true)
      );
    }
    return [];
  }, [allData, navigation, search]);

  const selectedClient = allData.clients.find(c => c.id === navigation.clientId);
  const selectedCase = allData.cases.find(c => c.id === navigation.caseId);

  const goBack = () => {
    if (navigation.mode === 'DOCS') setNavigation({ ...navigation, mode: 'CASES', caseId: null });
    else if (navigation.mode === 'CASES') setNavigation({ mode: 'CLIENTS', clientId: null, caseId: null });
  };

  // Download Word Document Template Substitutes Client-side
  const downloadWordDoc = (htmlBodyContent: string, customDocTitle: string) => {
    // MS Word HTML/XML schema container with right-to-left configurations
    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${customDocTitle}</title>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <style>
          body { font-family: 'Arial', 'Tajawal', sans-serif; direction: rtl; text-align: right; padding: 1.5in 1.0in 1.0in 1.0in; }
          h2 { text-align: center; color: #0A192F; font-size: 18pt; margin-bottom: 25px; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
          p { font-size: 12pt; line-height: 1.8; text-align: justify; margin-bottom: 12px; }
          ol, ul { margin-bottom: 15px; }
          li { font-size: 12pt; line-height: 1.8; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          td { padding: 6px; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        ${htmlBodyContent}
      </body>
      </html>
    `;
    
    const blob = new Blob(['\ufeff' + content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${customDocTitle}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFreeWordExport = () => {
    downloadWordDoc(freeEditorContent, freeDocTitle);
  };

  // Download Sample Excel Files
  const downloadExcelTemplate = async (type: 'CLIENTS' | 'CASES') => {
    try {
      if (!(window as any).XLSX) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.async = true;
        window.document.body.appendChild(script);
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
        });
      }

      const XLSX = (window as any).XLSX;
      let rows = [];
      let filename = "";

      if (type === 'CLIENTS') {
        rows = [
          {
            "الاسم الكامل": "محمد علي الشريف",
            "النوع (فرد/شركة)": "فرد",
            "الهاتف": "01094040671",
            "الهوية_الرقم الضريبي": "29505181234567",
            "العنوان": "شارع النيل، الزمالك، القاهرة",
            "الأتعاب المتوقعة": 15000
          },
          {
            "الاسم الكامل": "شركة الأمل للمقاولات",
            "النوع (فرد/شركة)": "شركة",
            "الهاتف": "0225183456",
            "الهوية_الرقم الضريبي": "123-456-789",
            "العنوان": "المنطقة الصناعية، التجمع الخامس",
            "الأتعاب المتوقعة": 50000
          }
        ];
        filename = "نموذج_استيراد_الموكلين.xlsx";
      } else {
        rows = [
          {
            "عنوان القضية": "دعوى مطالبة مالية توريد مواد خام",
            "رقم القضية": "٤٥٢٦ / ٢٠٢٦",
            "اسم الموكل": "محمد علي الشريف",
            "نوع القضية": "تجاري",
            "اسم الخصم": "شركة النور التجارية",
            "محامي الخصم": "الأستاذ حسن يوسف",
            "المحكمة": "محكمة القاهرة الاقتصادية",
            "تاريخ البداية (YYYY-MM-DD)": "2026-05-18"
          },
          {
            "عنوان القضية": "فسخ عقد إيجار لعدم السداد",
            "رقم القضية": "١٢٩٣ / ٢٠٢٦",
            "اسم الموكل": "شركة الأمل للمقاولات",
            "نوع القضية": "مدني",
            "اسم الخصم": "حسام عبد الرحيم",
            "محامي الخصم": "",
            "المحكمة": "محكمة الجيزة الابتدائية",
            "تاريخ البداية (YYYY-MM-DD)": "2026-04-10"
          }
        ];
        filename = "نموذج_استيراد_القضايا.xlsx";
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "النموذج الارشادي");

      if (!worksheet['!views']) worksheet['!views'] = [];
      worksheet['!views'].push({ RTL: true }); // RTL support for Arabic Excel layout

      XLSX.writeFile(workbook, filename);
    } catch (e) {
      alert("فشل تحميل النموذج. تأكد من اتصال الإنترنت.");
    }
  };

  // Free Spreadsheet controls
  const handleAddExcelRow = () => {
    const emptyRow = Array(spreadsheetHeaders.length).fill("");
    setSpreadsheetRows([...spreadsheetRows, emptyRow]);
  };

  const handleAddExcelColumn = () => {
    const nextColNum = spreadsheetHeaders.length + 1;
    setSpreadsheetHeaders([...spreadsheetHeaders, `العمود ${nextColNum}`]);
    setSpreadsheetRows(spreadsheetRows.map(row => [...row, ""]));
  };

  const handleCellChange = (rIndex: number, cIndex: number, val: string) => {
    const updated = [...spreadsheetRows];
    updated[rIndex][cIndex] = val;
    setSpreadsheetRows(updated);
  };

  const handleHeaderChange = (cIndex: number, val: string) => {
    const updated = [...spreadsheetHeaders];
    updated[cIndex] = val;
    setSpreadsheetHeaders(updated);
  };

  const handleClearFreeExcel = () => {
    if (!confirm("هل أنت متأكد من مسح جميع خلايا الجدول؟")) return;
    setSpreadsheetRows(spreadsheetRows.map(row => row.map(() => "")));
  };

  const handleExportFreeExcel = async () => {
    try {
      if (!(window as any).XLSX) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.async = true;
        window.document.body.appendChild(script);
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
        });
      }

      const XLSX = (window as any).XLSX;
      
      // Form structured array of objects based on customized headers and row values
      const jsonRows = spreadsheetRows.map(row => {
        const obj: Record<string, string> = {};
        spreadsheetHeaders.forEach((h, index) => {
          obj[h || `العمود ${index + 1}`] = row[index] || "";
        });
        return obj;
      });

      const worksheet = XLSX.utils.json_to_sheet(jsonRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ورقة ١");

      if (!worksheet['!views']) worksheet['!views'] = [];
      worksheet['!views'].push({ RTL: true }); // RTL layout standard for Arabic spreadsheets

      XLSX.writeFile(workbook, `${freeExcelTitle}.xlsx`);
    } catch (e) {
      alert("فشل تصدير ملف Excel. تأكد من اتصال الإنترنت.");
    }
  };

  // Handle uploaded Excel parsing using SheetJS
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    setExcelError("");
    setExcelData([]);
    setImportSuccessMessage("");

    try {
      if (!(window as any).XLSX) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.async = true;
        window.document.body.appendChild(script);
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
        });
      }

      const XLSX = (window as any).XLSX;
      const reader = new FileReader();

      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet);

          if (rawRows.length === 0) {
            setExcelError("الملف المرفوع فارغ ولا يحتوي على سجلات!");
            return;
          }

          // Validate headers based on Excel template type
          const sampleRow = rawRows[0] as any;
          if (importType === 'CLIENTS') {
            if (!("الاسم الكامل" in sampleRow) || !("الهاتف" in sampleRow)) {
              setExcelError("الملف لا يتطابق مع نموذج الموكلين! يجب أن يحتوي على عمودين باسم 'الاسم الكامل' و 'الهاتف'.");
              return;
            }
          } else {
            if (!("عنوان القضية" in sampleRow) || !("رقم القضية" in sampleRow) || !("اسم الموكل" in sampleRow)) {
              setExcelError("الملف لا يتطابق مع نموذج القضايا! يجب أن يحتوي على أعمدة 'عنوان القضية' و 'رقم القضية' و 'اسم الموكل'.");
              return;
            }
          }

          setExcelData(rawRows);
          setExcelParsedCount(rawRows.length);
        } catch (err: any) {
          setExcelError("حدث خطأ أثناء فحص البيانات من ملف إكسل: " + err.message);
        }
      };

      reader.readAsBinaryString(file);
    } catch (err: any) {
      setExcelError("حدث خطأ أثناء فحص ملف إكسل: " + err.message);
    }
  };

  // Perform Firestore bulk saving
  const handleBulkImport = async () => {
    if (excelData.length === 0) return;
    setImportProgress("جاري تهيئة الاتصال بقاعدة البيانات...");
    
    try {
      const lawyerId = localStorage.getItem("lawyerId");
      if (!lawyerId) throw new Error("لم يتم التعرف على هوية المحامي. يرجى إعادة تسجيل الدخول.");

      let successCount = 0;

      if (importType === 'CLIENTS') {
        setImportProgress(`جاري استيراد ${excelData.length} موكل جديد...`);
        
        for (let i = 0; i < excelData.length; i++) {
          const row = excelData[i];
          const data = {
            fullName: row["الاسم الكامل"] || "موكل مستورد",
            clientType: String(row["النوع (فرد/شركة)"] || "").trim() === "شركة" ? "COMPANY" : "INDIVIDUAL",
            phone: String(row["الهاتف"] || ""),
            nationalId: String(row["الهوية_الرقم الضريبي"] || ""),
            address: row["العنوان"] || "",
            totalFees: Number(row["الأتعاب المتوقعة"] || 0),
            lawyerId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await addDoc(collection(db, "clients"), data);
          successCount++;
        }
        
        setImportSuccessMessage(`تم استيراد عدد ${successCount} موكل بنجاح وبسرعة فائقة!`);
      } else {
        setImportProgress("جاري جلب قائمة الموكلين الحالية للربط التلقائي...");
        
        // Fetch existing clients to resolve names to client IDs
        const clientsSnap = await getDocs(query(collection(db, "clients"), where("lawyerId", "==", lawyerId)));
        const existingClientsMap: Record<string, string> = {};
        clientsSnap.docs.forEach(doc => {
          const cData = doc.data();
          existingClientsMap[cData.fullName.trim()] = doc.id;
        });

        for (let i = 0; i < excelData.length; i++) {
          const row = excelData[i];
          const clientName = String(row["اسم الموكل"] || "").trim();
          
          if (!clientName) continue;

          let clientId = existingClientsMap[clientName];

          // Auto Client creation if name not found in existing system
          if (!clientId) {
            setImportProgress(`موكل غير معروف: "${clientName}". جاري تسجيله تلقائياً أولاً...`);
            const newClientData = {
              fullName: clientName,
              clientType: "INDIVIDUAL",
              phone: "-",
              nationalId: "-",
              address: "تم إنشاؤه تلقائياً أثناء استيراد القضايا",
              totalFees: 0,
              lawyerId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            const clientRef = await addDoc(collection(db, "clients"), newClientData);
            clientId = clientRef.id;
            existingClientsMap[clientName] = clientId; // Cache for other rows
          }

          setImportProgress(`جاري استيراد القضية: "${row["عنوان القضية"]}" للعميل "${clientName}"...`);
          
          const caseData = {
            title: row["عنوان القضية"] || "قضية مستوردة",
            caseNumber: String(row["رقم القضية"] || ""),
            clientId,
            type: row["نوع القضية"] || "مدني",
            opponentName: row["اسم الخصم"] || "",
            opponentLawyer: row["محامي الخصم"] || "",
            courtName: row["المحكمة"] || "",
            startDate: row["تاريخ البداية (YYYY-MM-DD)"] || new Date().toISOString().split('T')[0],
            status: "OPEN",
            lawyerId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await addDoc(collection(db, "cases"), caseData);
          successCount++;
        }

        setImportSuccessMessage(`تم استيراد عدد ${successCount} قضية وربطها بالموكلين بنجاح!`);
      }

      setExcelData([]);
      setExcelFileName("");
      fetchData(); // Refresh Digital Archive in background
    } catch (err: any) {
      console.error(err);
      alert("حدث خطأ أثناء الاستيراد الجماعي: " + err.message);
    } finally {
      setImportProgress("");
    }
  };

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AiSummarizerModal 
        isOpen={!!activeAiDoc} 
        onClose={() => setActiveAiDoc(null)} 
        target={activeAiDoc} 
        type="document" 
      />

      <DocumentViewerModal
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
        document={viewDocument}
      />

      {/* Edit Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b bg-[#0A192F] text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">تعديل بيانات المستند</h2>
              <button onClick={() => setEditingDoc(null)} className="text-white hover:opacity-70">✕</button>
            </div>
            <form onSubmit={handleUpdateDoc} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">اسم المستند</label>
                <Input value={editingDoc.name} onChange={e => setEditingDoc({...editingDoc, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">النوع</label>
                <select className="w-full p-2 border rounded-md" value={editingDoc.type} onChange={e => setEditingDoc({...editingDoc, type: e.target.value})}>
                  <option value="POWER_OF_ATTORNEY">توكيل</option>
                  <option value="CONTRACT">عقد</option>
                  <option value="EVIDENCE">دليل إثبات</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>
              <Button type="submit" className="w-full bg-[#D4AF37] text-white py-6 rounded-2xl mt-4 font-bold">حفظ التعديلات</Button>
            </form>
          </div>
        </div>
      )}

      {/* Folder Management Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b bg-[#0A192F] text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {folderModalMode === "CREATE" ? "إنشاء مجلد جديد" : "تعديل اسم المجلد"}
              </h2>
              <button
                onClick={() => {
                  setIsFolderModalOpen(false);
                  setFolderModalData(null);
                }}
                className="text-white hover:opacity-70"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveFolder} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold">اسم المجلد</label>
                <Input
                  value={folderModalData?.name || ""}
                  onChange={(e) =>
                    setFolderModalData({ ...folderModalData!, name: e.target.value })
                  }
                  placeholder="مثال: عقود الشركات، صحف الدعاوى..."
                  required
                  className="border-gray-200 focus:ring-[#0A192F]/10 text-sm"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 py-6 rounded-2xl"
                  onClick={() => {
                    setIsFolderModalOpen(false);
                    setFolderModalData(null);
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white py-6 rounded-2xl font-bold"
                >
                  حفظ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      <AddDocumentModal
        isOpen={isAddDocModalOpen}
        onClose={() => setIsAddDocModalOpen(false)}
        onSuccess={() => {
          setIsAddDocModalOpen(false);
          fetchData();
        }}
        caseId={navigation.caseId || undefined}
        clientId={navigation.clientId || undefined}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">إدارة ملفات Word & Excel</h1>
          <p className="text-gray-500 mt-1">أنشئ عقود Word، صمم جداول Excel، أو تصفح خزانة مستنداتك الذكية</p>
        </div>
        
        {/* Modern Horizontal Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-2xl border gap-1 w-full sm:w-auto self-stretch shrink-0 shadow-sm">
          <button
            onClick={() => setActiveTab('ARCHIVE')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'ARCHIVE'
                ? "bg-[#0A192F] text-white shadow-md"
                : "text-[#0A192F] hover:bg-gray-100"
            }`}
          >
            <Folder size={18} />
            الخزانة الرقمية
          </button>
          
          <button
            onClick={() => setActiveTab('WORD_GENERATOR')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'WORD_GENERATOR'
                ? "bg-[#0A192F] text-white shadow-md"
                : "text-[#0A192F] hover:bg-gray-100"
            }`}
          >
            <FileCode size={18} />
            صياغة مستندات Word
          </button>
          
          <button
            onClick={() => setActiveTab('EXCEL_IMPORTER')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'EXCEL_IMPORTER'
                ? "bg-[#0A192F] text-white shadow-md"
                : "text-[#0A192F] hover:bg-gray-100"
            }`}
          >
            <FileSpreadsheet size={18} />
            أدوات وجداول Excel
          </button>
        </div>
      </div>

      {/* TAB 1: ARCHIVE DRAWER (Original view but upgraded preview) */}
      {activeTab === 'ARCHIVE' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <button onClick={() => setNavigation({ mode: 'CLIENTS', clientId: null, caseId: null })} className={`flex items-center gap-1 hover:text-[#0A192F] transition-colors ${navigation.mode === 'CLIENTS' ? 'text-[#D4AF37] font-bold' : ''}`}><Home size={16} /> الرئيسية</button>
            {navigation.clientId && <><ChevronLeft size={14} className="text-gray-300" /><button onClick={() => setNavigation({ ...navigation, mode: 'CASES', caseId: null })} className={`flex items-center gap-1 hover:text-[#0A192F] transition-colors ${navigation.mode === 'CASES' ? 'text-[#D4AF37] font-bold' : ''}`}><User size={16} /> {selectedClient?.fullName}</button></>}
            {navigation.caseId && <><ChevronLeft size={14} className="text-gray-300" /><span className="text-[#D4AF37] font-bold flex items-center gap-1"><Briefcase size={16} /> {selectedCase?.title}</span></>}
          </div>

          <Card className="shadow-sm border-gray-200 overflow-hidden bg-white">
            <CardHeader className="border-b bg-gray-50/50 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-2 space-x-reverse relative w-full sm:w-96">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input placeholder="بحث بالاسم..." className="pl-4 pr-10 bg-white border-gray-200 focus:ring-[#0A192F]/10" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {navigation.mode === 'DOCS' && (
                  <Button
                    onClick={() => setIsAddDocModalOpen(true)}
                    className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white font-bold py-5 px-5 rounded-2xl flex items-center gap-2 shadow-lg shadow-[#0A192F]/15 active:scale-[0.98] transition-transform text-xs"
                  >
                    <Upload size={14} />
                    رفع مستند للملف
                  </Button>
                )}
                {navigation.mode !== 'CLIENTS' && (
                  <Button variant="ghost" onClick={goBack} className="text-gray-500 hover:text-[#0A192F] font-bold">
                    عودة للخلف <ChevronLeft size={16} className="mr-1 rotate-180" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? (
                <div className="text-center py-20 text-gray-500 font-bold flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 text-[#0A192F] animate-spin" />
                  جاري تحميل الخزانة...
                </div>
              ) : currentItems.length === 0 ? (
                <div className="text-center py-20 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                  <Folder className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400">لا توجد عناصر هنا</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {navigation.mode === 'CLIENTS' && currentItems.map((client) => (
                    <button key={client.id} onClick={() => setNavigation({ mode: 'CASES', clientId: client.id, caseId: null })} className="flex flex-col items-center gap-3 p-5 rounded-2xl hover:bg-blue-50/60 transition-all border border-transparent hover:border-blue-100 group shadow-sm bg-white hover:shadow">
                      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all shadow-inner"><User size={30} /></div>
                      <span className="text-sm font-bold text-[#0A192F] text-center line-clamp-2">{client.fullName}</span>
                    </button>
                  ))}

                  {navigation.mode === 'CASES' && currentItems.map((c) => (
                    <button key={c.id} onClick={() => setNavigation({ mode: 'DOCS', clientId: navigation.clientId, caseId: c.id })} className="flex flex-col items-center gap-3 p-5 rounded-2xl hover:bg-amber-50/60 transition-all border border-transparent hover:border-amber-100 group shadow-sm bg-white hover:shadow">
                      <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all shadow-inner"><Briefcase size={30} /></div>
                      <span className="text-sm font-bold text-[#0A192F] text-center line-clamp-2">{c.title}</span>
                    </button>
                  ))}

                  {navigation.mode === 'DOCS' && (
                    <div className="col-span-full">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead className="text-right font-bold text-[#0A192F]">اسم المستند</TableHead>
                            <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">النوع</TableHead>
                            <TableHead className="text-center font-bold text-[#0A192F]">الإجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentItems.map((d) => (
                            <TableRow key={d.id} className="hover:bg-gray-50/50 transition-colors">
                              <TableCell className="font-medium text-[#0A192F]">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 shrink-0">
                                    <File size={18} />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate font-bold text-sm max-w-[250px]">{d.name || "مستند بدون اسم"}</span>
                                    <span className="text-xs text-gray-400 font-mono" dir="ltr">{d.fileUrl?.split('/').pop()?.slice(-20) || "ملف رقمي"}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline" className="bg-white">
                                  {d.type === "POWER_OF_ATTORNEY" ? "توكيل"
                                    : d.type === "CONTRACT" ? "عقد"
                                    : d.type === "EVIDENCE" ? "دليل إثبات"
                                    : d.type === "JUDGMENT" ? "حكم"
                                    : d.type === "RECEIPT" ? "إيصال"
                                    : "أخرى"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {(d.fileUrl || d.url) && (
                                    <>
                                      <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600 hover:bg-blue-50" title="معاينة فورية" onClick={() => setViewDocument(d)}>
                                        <Eye className="h-4.5 w-4.5" />
                                      </Button>
                                      <a href={d.fileUrl || d.url} download target="_blank" rel="noreferrer">
                                        <Button variant="ghost" size="icon" className="h-9 w-9 text-[#D4AF37] hover:bg-amber-50" title="تحميل الملف">
                                          <Download className="h-4.5 w-4.5" />
                                        </Button>
                                      </a>
                                    </>
                                  )}
                                  {localStorage.getItem('userPlan') === 'PREMIUM' && (
                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-purple-600 hover:bg-purple-50" title="تحليل بالذكاء الاصطناعي (AI)" onClick={() => setActiveAiDoc(d)}>
                                      <Sparkles className="h-4.5 w-4.5" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-green-600 hover:bg-green-50" title="تعديل الاسم" onClick={() => setEditingDoc(d)}>
                                    <Edit3 className="h-4.5 w-4.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-red-600 hover:bg-red-50" title="حذف" onClick={() => handleDeleteDoc(d)}>
                                    <Trash2 className="h-4.5 w-4.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: WORD GENERATOR (TEMPLATES & FREE TEXT EDITOR) */}
      {activeTab === 'WORD_GENERATOR' && (
        <div className="space-y-6">
          
          {/* Sub-tabs Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-2xl w-fit border gap-1 self-center mx-auto mb-2">
            <button
              onClick={() => setWordSubTab('TEMPLATES')}
              className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                wordSubTab === 'TEMPLATES' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
              }`}
            >
              <FileCode size={14} />
              النماذج القانونية الجاهزة
            </button>
            <button
              onClick={() => setWordSubTab('CUSTOM_TEMPLATES')}
              className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                wordSubTab === 'CUSTOM_TEMPLATES' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
              }`}
            >
              <Folder size={14} />
              نماذجي الخاصة
            </button>
            <button
              onClick={() => setWordSubTab('FREE_EDITOR')}
              className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                wordSubTab === 'FREE_EDITOR' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
              }`}
            >
              <Edit3 size={14} />
              محرر مستندات Word حر
            </button>
          </div>

          {/* Sub Tab 2.1: Template Generator */}
          {wordSubTab === 'TEMPLATES' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
              
              {/* Sidebar Template Select */}
              <div className="lg:col-span-3 space-y-3">
                <h3 className="text-sm font-bold text-gray-400 px-1 uppercase tracking-wider">النماذج القانونية الجاهزة</h3>
                <div className="space-y-2">
                  {LEGAL_TEMPLATES.map(template => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`w-full text-right p-4 rounded-2xl transition-all border flex flex-col gap-1 ${
                        selectedTemplateId === template.id
                          ? "bg-white border-[#D4AF37] shadow-md ring-2 ring-[#D4AF37]/10"
                          : "bg-white/80 hover:bg-white border-gray-200/60"
                      }`}
                    >
                      <span className="font-bold text-sm text-[#0A192F]">{template.name}</span>
                      <span className="text-xs text-gray-500 line-clamp-1">{template.description}</span>
                      <Badge variant="outline" className="w-fit text-[9px] mt-1 bg-gray-50 font-normal">{template.category}</Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Form Fields */}
              <div className="lg:col-span-4 bg-white border rounded-3xl p-6 shadow-sm space-y-4 self-stretch">
                <div>
                  <h3 className="text-lg font-bold text-[#0A192F]">بيانات الصياغة</h3>
                  <p className="text-xs text-gray-500 mt-1">املأ الحقول لتحديث المستند فوراً في نافذة المعاينة</p>
                </div>
                
                <div className="space-y-4 py-2 border-t">
                  {activeTemplate?.fields.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                        {field.label}
                        {field.key === "lawyerName" && <Badge className="bg-[#D4AF37] text-white text-[9px]">أنت</Badge>}
                      </label>
                      <Input
                        type={field.type || "text"}
                        placeholder={field.placeholder}
                        className="border-gray-200 focus:ring-[#0A192F]/10 text-sm"
                        value={templateValues[field.key] || ""}
                        onChange={e => setTemplateValues({ ...templateValues, [field.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                
                <Button
                  onClick={() => downloadWordDoc(activeTemplate?.generateHtml(templateValues) || "", activeTemplate?.name || "مستند")}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-600/10 mt-6 active:scale-[0.99] transition-transform"
                >
                  <Download size={18} />
                  تحميل كملف Word (.doc)
                </Button>
              </div>

              {/* Live Print-ready Preview Pane */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-bold text-gray-400">معاينة ورقة الطباعة الحية</span>
                  <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">النوع: ملف وورد متوافق</span>
                </div>
                
                <div className="bg-white border shadow-md rounded-3xl p-8 min-h-[60vh] max-h-[80vh] overflow-y-auto font-serif leading-relaxed text-gray-800 text-justify word-preview-pane relative">
                  
                  {/* Lawyer Letterhead Header */}
                  <div className="flex justify-between items-center border-b-2 border-[#D4AF37] pb-4 mb-6 text-xs text-gray-500 font-['Tajawal'] font-bold">
                    <div className="text-right">
                      <p className="text-sm text-[#0A192F]">مكتب المحاماة والاستشارات القانونية</p>
                      <p className="text-[10px] text-gray-400 font-normal">صيغة إلكترونية ذكية</p>
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center border border-amber-200 rounded-full p-2 bg-amber-50/50">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2 2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"/><path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4"/><circle cx="8" cy="12" r="2"/></svg>
                    </div>
                    <div className="text-left font-mono text-[9px] text-gray-400">
                      <p>تاريخ الإنشاء: {new Date().toLocaleDateString("ar-EG")}</p>
                      <p>LawyerOS Word Engine</p>
                    </div>
                  </div>

                  {activeTemplate && (
                    <div dangerouslySetInnerHTML={{ __html: activeTemplate.generateHtml(templateValues) }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sub Tab 2.2: Custom Templates Generator & Folder System */}
          {wordSubTab === 'CUSTOM_TEMPLATES' && (
            <div className="animate-in fade-in duration-300">
              {isEditingCustomTemplate ? (
                /* Custom Template WYSIWYG Editor Mode */
                <Card className="shadow-md border-gray-200 p-6 bg-white rounded-3xl space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-[#0A192F]">
                        {editingCustomTemplateData?.id ? "تعديل النموذج الخاص" : "إنشاء نموذج قانوني جديد"}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">اكتب وصمم هيكل النموذج وضع علامات الحقول التفاعلية بسهولة</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditingCustomTemplate(false);
                          setEditingCustomTemplateData(null);
                        }}
                        className="py-5 px-6 rounded-2xl flex-1 sm:flex-none"
                      >
                        إلغاء
                      </Button>
                      <Button
                        onClick={handleSaveCustomTemplate}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-5 px-8 rounded-2xl shadow-lg shadow-green-600/10 flex-1 sm:flex-none"
                      >
                        حفظ النموذج
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700">اسم النموذج</label>
                      <Input
                        value={editingCustomTemplateData?.name || ""}
                        onChange={(e) =>
                          setEditingCustomTemplateData({
                            ...editingCustomTemplateData!,
                            name: e.target.value,
                          })
                        }
                        placeholder="مثال: عقد تقديم خدمات برمجية"
                        className="border-gray-200 focus:ring-[#0A192F]/10 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700 flex justify-between items-center">
                        <span>المجلد (الفولدر)</span>
                        <button
                          onClick={() => {
                            setFolderModalMode("CREATE");
                            setFolderModalData({ name: "" });
                            setIsFolderModalOpen(true);
                          }}
                          className="text-[#D4AF37] hover:text-[#D4AF37]/80 text-[10px] font-bold flex items-center gap-1"
                        >
                          <FolderPlus size={12} />
                          مجلد جديد
                        </button>
                      </label>
                      <select
                        className="w-full p-2.5 border rounded-md text-sm border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10"
                        value={editingCustomTemplateData?.folderId || ""}
                        onChange={(e) =>
                          setEditingCustomTemplateData({
                            ...editingCustomTemplateData!,
                            folderId: e.target.value,
                          })
                        }
                      >
                        <option value="">-- اختر مجلد --</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700">وصف قصير</label>
                      <Input
                        value={editingCustomTemplateData?.description || ""}
                        onChange={(e) =>
                          setEditingCustomTemplateData({
                            ...editingCustomTemplateData!,
                            description: e.target.value,
                          })
                        }
                        placeholder="وصف مختصر لمجال استخدام هذا النموذج..."
                        className="border-gray-200 focus:ring-[#0A192F]/10 text-sm"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50/50 text-amber-800 rounded-2xl border border-amber-100 flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold">طريقة كتابة المتغيرات (الحقول التفاعلية):</p>
                      <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                        ضع أي كلمة تريد تعبئتها ديناميكياً بين قوسين مزدوجين، مثل:{" "}
                        <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold font-sans">
                          {"{{اسم_الموكل}}"}
                        </span>{" "}
                        أو{" "}
                        <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold font-sans">
                          {"{{رقم_الهاتف}}"}
                        </span>
                        . سيقوم النظام عند فتح القالب بقراءتها تلقائياً وتوليد حقول إدخال في الشريط الجانبي لتعبئة النموذج بسرعة فائقة!
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700">محتوى المستند</label>
                    <RichTextEditor
                      value={editingCustomTemplateData?.body || ""}
                      onChange={(val) =>
                        setEditingCustomTemplateData({
                          ...editingCustomTemplateData!,
                          body: val,
                        })
                      }
                      placeholder="ابدأ بكتابة نص العقد أو المستند القانوني هنا..."
                    />
                  </div>
                </Card>
              ) : (
                /* Templates List & Filler Pane Mode */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Custom Folders & Templates Tree Sidebar */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="flex justify-between items-center px-1 gap-2">
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">نماذجي الخاصة</h3>
                      <button
                        onClick={() => {
                          setFolderModalMode("CREATE");
                          setFolderModalData({ name: "" });
                          setIsFolderModalOpen(true);
                        }}
                        className="text-xs font-bold text-[#0A192F] hover:text-[#D4AF37] flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl border shadow-sm transition-colors shrink-0"
                      >
                        <FolderPlus size={14} />
                        مجلد جديد
                      </button>
                    </div>

                    <Button
                      onClick={() => {
                        setEditingCustomTemplateData({
                          name: "",
                          folderId: folders[0]?.id || "",
                          description: "",
                          body: `
                            <div style="font-family: 'Tajawal', sans-serif; text-align: justify; line-height: 1.8;">
                              <h2 style="text-align: center; color: #0A192F;">عنوان النموذج الخاص</h2>
                              <p>إنه في يوم الموافق تم تحرير هذا المستند بين كل من:</p>
                              <p><strong>الطرف الأول:</strong> السيد/ {{اسم_الطرف_الأول}}</p>
                              <p><strong>الطرف الثاني:</strong> السيد/ {{اسم_الطرف_الثاني}}</p>
                              <br/>
                              <p>اكتب هنا باقي التفاصيل والشروط الخاصة بك...</p>
                            </div>
                          `,
                        });
                        setIsEditingCustomTemplate(true);
                      }}
                      className="w-full bg-[#0A192F] hover:bg-[#0A192F]/90 text-white font-bold py-6 rounded-2xl flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Plus size={16} />
                      إضافة قالب مخصص جديد
                    </Button>

                    <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
                      {folders.length === 0 ? (
                        <div className="text-center py-10 bg-white/60 rounded-2xl border border-gray-100 p-4">
                          <Folder className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 font-normal">لا توجد مجلدات حالياً. انقر على "مجلد جديد" للبدء.</p>
                        </div>
                      ) : (
                        folders.map((folder) => {
                          const folderTemplates = customTemplates.filter(
                            (t) => t.folderId === folder.id
                          );
                          const isExpanded = !!expandedFolders[folder.id];

                          return (
                            <div
                              key={folder.id}
                              className="bg-white border border-gray-200/50 rounded-2xl overflow-hidden shadow-sm hover:shadow transition-shadow"
                            >
                              {/* Folder Header */}
                              <div className="flex items-center justify-between p-3 bg-gray-50/50 border-b border-gray-100">
                                <button
                                  onClick={() =>
                                    setExpandedFolders({
                                      ...expandedFolders,
                                      [folder.id]: !isExpanded,
                                    })
                                  }
                                  className="flex items-center gap-2 flex-1 text-right text-sm font-bold text-[#0A192F] hover:opacity-80"
                                >
                                  <ChevronDown
                                    size={16}
                                    className={`text-gray-400 transition-transform ${
                                      isExpanded ? "" : "rotate-90"
                                    }`}
                                  />
                                  <Folder size={18} className="text-amber-500 fill-amber-500/20" />
                                  <span className="truncate max-w-[120px]">{folder.name}</span>
                                  <span className="text-[10px] text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded-full font-normal">
                                    {folderTemplates.length}
                                  </span>
                                </button>

                                <div className="flex items-center gap-1.5 print:hidden">
                                  <button
                                    onClick={() => {
                                      setFolderModalMode("EDIT");
                                      setFolderModalData({ id: folder.id, name: folder.name });
                                      setIsFolderModalOpen(true);
                                    }}
                                    className="p-1 text-gray-400 hover:text-blue-600 rounded-md hover:bg-gray-100 transition-colors"
                                    title="تعديل اسم المجلد"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-gray-100 transition-colors"
                                    title="حذف المجلد"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>

                              {/* Folder Templates List */}
                              {isExpanded && (
                                <div className="p-2 space-y-1 bg-white animate-in slide-in-from-top duration-200">
                                  {folderTemplates.length === 0 ? (
                                    <div className="text-[10px] text-gray-400 text-center py-4 select-none">
                                      المجلد فارغ
                                    </div>
                                  ) : (
                                    folderTemplates.map((template) => (
                                      <div
                                        key={template.id}
                                        className={`group relative flex items-center justify-between p-2 rounded-xl transition-all border ${
                                          selectedCustomTemplateId === template.id
                                            ? "bg-amber-50/40 border-amber-200"
                                            : "border-transparent hover:bg-gray-50"
                                        }`}
                                      >
                                        <button
                                          onClick={() =>
                                            setSelectedCustomTemplateId(template.id)
                                          }
                                          className="flex-1 text-right min-w-0"
                                        >
                                          <div className="font-bold text-xs text-[#0A192F] truncate">
                                            {template.name}
                                          </div>
                                          {template.description && (
                                            <div className="text-[10px] text-gray-400 truncate mt-0.5 font-normal">
                                              {template.description}
                                            </div>
                                          )}
                                        </button>

                                        <div className="hidden group-hover:flex items-center gap-1 shrink-0 bg-white shadow-sm border rounded-lg p-0.5 absolute left-2 top-1/2 -translate-y-1/2 print:hidden z-10">
                                          <button
                                            onClick={() => {
                                              setEditingCustomTemplateData({
                                                id: template.id,
                                                name: template.name,
                                                folderId: template.folderId,
                                                description: template.description || "",
                                                body: template.body,
                                              });
                                              setIsEditingCustomTemplate(true);
                                            }}
                                            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-gray-50 rounded"
                                            title="تعديل القالب"
                                          >
                                            <Edit3 size={12} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleDeleteCustomTemplate(
                                                template.id,
                                                template.name
                                              )
                                            }
                                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-50 rounded"
                                            title="حذف القالب"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Interactive Dynamic Form Fields */}
                  <div className="lg:col-span-4 bg-white border rounded-3xl p-6 shadow-sm space-y-4 self-stretch min-h-[400px] flex flex-col justify-between">
                    {activeCustomTemplate ? (
                      <div className="space-y-4 h-full flex flex-col justify-between">
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-lg font-bold text-[#0A192F] flex items-center gap-2">
                              <span>صياغة:</span>
                              <span className="text-[#D4AF37] font-extrabold">{activeCustomTemplate.name}</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                              {activeCustomTemplate.description || "أدخل الحقول المحددة أدناه لتحديث المستند فوراً."}
                            </p>
                          </div>

                          <div className="space-y-4 py-2 border-t max-h-[50vh] overflow-y-auto pr-1">
                            {parseCustomPlaceholders(activeCustomTemplate.body).length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-10 font-normal">
                                لا توجد متغيرات تفاعلية في هذا القالب. يمكنك تحميله مباشرة أو النقر على تعديل لإضافة متغيرات مثل {"{{الاسم}}"}.
                              </p>
                            ) : (
                              parseCustomPlaceholders(activeCustomTemplate.body).map((fieldKey) => (
                                <div key={fieldKey} className="space-y-1.5">
                                  <label className="text-xs font-bold text-gray-700">
                                    {fieldKey.replace(/_/g, " ")}
                                  </label>
                                  <Input
                                    type="text"
                                    placeholder={`اكتب ${fieldKey.replace(/_/g, " ")}...`}
                                    className="border-gray-200 focus:ring-[#0A192F]/10 text-sm"
                                    value={customTemplateValues[fieldKey] || ""}
                                    onChange={(e) =>
                                      setCustomTemplateValues({
                                        ...customTemplateValues,
                                        [fieldKey]: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={() =>
                            downloadWordDoc(
                              renderCustomTemplateHtml(
                                activeCustomTemplate.body,
                                customTemplateValues
                              ),
                              activeCustomTemplate.name
                            )
                          }
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-600/10 mt-6 active:scale-[0.99] transition-transform"
                        >
                          <Download size={18} />
                          تحميل كملف Word (.doc)
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-24 my-auto">
                        <Folder className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-sm font-bold text-gray-500">الرجاء اختيار نموذج خاص</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto font-normal">
                          اختر أحد قوالبك الخاصة من الشريط الجانبي لتعبئة بياناته، أو أنشئ قالباً جديداً.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Live Print-ready Preview Pane */}
                  <div className="lg:col-span-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-bold text-gray-400">معاينة المستند الحي</span>
                      <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200 font-sans">
                        قالب مخصص للمحامي
                      </span>
                    </div>

                    <div className="bg-white border shadow-md rounded-3xl p-8 min-h-[60vh] max-h-[80vh] overflow-y-auto font-serif leading-relaxed text-gray-800 text-justify word-preview-pane relative">
                      {/* Lawyer Letterhead Header */}
                      <div className="flex justify-between items-center border-b-2 border-[#D4AF37] pb-4 mb-6 text-xs text-gray-500 font-['Tajawal'] font-bold select-none">
                        <div className="text-right font-['Tajawal']">
                          <p className="text-sm text-[#0A192F]">مكتب المحاماة والاستشارات القانونية</p>
                          <p className="text-[10px] text-gray-400 font-normal">صيغة إلكترونية ذكية</p>
                        </div>
                        <div className="w-12 h-12 flex items-center justify-center border border-amber-200 rounded-full p-2 bg-amber-50/50">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D4AF37"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-full h-full"
                          >
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2 2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1" />
                            <path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4" />
                            <circle cx="8" cy="12" r="2" />
                          </svg>
                        </div>
                        <div className="text-left font-mono text-[9px] text-gray-400 font-normal">
                          <p>تاريخ المعاينة: {new Date().toLocaleDateString("ar-EG")}</p>
                          <p>LawyerOS Custom Engine</p>
                        </div>
                      </div>

                      {activeCustomTemplate ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderCustomTemplateHtml(
                              activeCustomTemplate.body,
                              customTemplateValues
                            ),
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[40vh] text-gray-300 select-none">
                          <FileCode size={48} className="text-gray-100 mb-2" />
                          <span className="text-xs">المعاينة الحية تظهر هنا</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub Tab 2.2: Free Rich-Text Word Editor */}
          {wordSubTab === 'FREE_EDITOR' && (
            <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-300">
              
              {/* Document Title input */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 border rounded-3xl shadow-sm">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-bold text-gray-400">عنوان المستند المصدر:</label>
                  <Input
                    value={freeDocTitle}
                    onChange={e => setFreeDocTitle(e.target.value)}
                    className="border-gray-200 font-bold text-sm bg-gray-50 focus:bg-white focus:ring-[#0A192F]/10 w-full sm:w-80"
                    placeholder="اكتب عنوان الملف..."
                  />
                </div>
                <Button
                  onClick={handleFreeWordExport}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-8 rounded-2xl shadow-lg shadow-green-600/15 active:scale-[0.98] w-full sm:w-auto self-stretch sm:self-auto"
                >
                  <Download className="ml-2 h-5 w-5" /> تصدير وتنزيل كملف Word (.doc)
                </Button>
              </div>

              {/* Upgraded Rich Text Editor */}
              <RichTextEditor
                value={freeEditorContent}
                onChange={setFreeEditorContent}
                placeholder="اكتب مستندك القانوني هنا من الصفر..."
              />
            </div>
          )}

        </div>
      )}

      {/* TAB 3: EXCEL TOOLS (BULK IMPORTER & FREE SPREADSHEET EDITOR) */}
      {activeTab === 'EXCEL_IMPORTER' && (
        <div className="space-y-6">
          
          {/* Sub-tabs Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-2xl w-fit border gap-1 self-center mx-auto mb-2">
            <button
              onClick={() => setExcelSubTab('IMPORTER')}
              className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                excelSubTab === 'IMPORTER' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
              }`}
            >
              <Upload size={14} />
              استيراد البيانات الجماعي
            </button>
            <button
              onClick={() => setExcelSubTab('FREE_SPREADSHEET')}
              className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                excelSubTab === 'FREE_SPREADSHEET' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
              }`}
            >
              <FileSpreadsheet size={14} />
              صانع جداول Excel حر
            </button>
          </div>

          {/* Sub Tab 3.1: Bulk Importer */}
          {excelSubTab === 'IMPORTER' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Step 1: Download Template */}
                <Card className="shadow-sm border-gray-200">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-50 text-green-700 rounded-xl shrink-0"><Download size={20} /></div>
                      <div>
                        <CardTitle className="text-lg">الخطوة الأولى: تحميل ملف النموذج الفارغ</CardTitle>
                        <CardDescription>حمل نموذج إكسل جاهز بالصيغة الصحيحة وقم بتعبئته بالبيانات</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-gray-50 border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="space-y-1 text-center sm:text-right">
                        <p className="text-sm font-bold text-[#0A192F]">نموذج الموكلين الجماعي (.xlsx)</p>
                        <p className="text-xs text-gray-500">لرفع قائمة الموكلين بالاسم والهواتف والهويات</p>
                      </div>
                      <Button
                        onClick={() => downloadExcelTemplate('CLIENTS')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold"
                      >
                        تحميل نموذج الموكلين
                      </Button>
                    </div>
                    
                    <div className="p-4 bg-gray-50 border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="space-y-1 text-center sm:text-right">
                        <p className="text-sm font-bold text-[#0A192F]">نموذج القضايا والسجلات (.xlsx)</p>
                        <p className="text-xs text-gray-500">لرفع سجلات القضايا وربطها تلقائياً بالموكلين</p>
                      </div>
                      <Button
                        onClick={() => downloadExcelTemplate('CASES')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold"
                      >
                        تحميل نموذج القضايا
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Step 2: Select Type & Upload */}
                <Card className="shadow-sm border-gray-200">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#0A192F] text-white rounded-xl shrink-0"><Upload size={20} /></div>
                      <div>
                        <CardTitle className="text-lg">الخطوة الثانية: رفع وفحص جدول إكسل</CardTitle>
                        <CardDescription>اختر نوع البيانات المرفوعة ثم اسحب الملف إلى منطقة الرفع</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    
                    {/* Switch Data Type */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500">نوع البيانات التي ستقوم برفعها الآن:</label>
                      <div className="flex border rounded-2xl p-1 bg-gray-50/50">
                        <button
                          onClick={() => { setImportType('CLIENTS'); setExcelData([]); setExcelFileName(""); setExcelError(""); setImportSuccessMessage(""); }}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                            importType === 'CLIENTS' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
                          }`}
                        >
                          استيراد قائمة موكلين
                        </button>
                        <button
                          onClick={() => { setImportType('CASES'); setExcelData([]); setExcelFileName(""); setExcelError(""); setImportSuccessMessage(""); }}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                            importType === 'CASES' ? "bg-white text-[#0A192F] shadow-sm" : "text-gray-500 hover:text-[#0A192F]"
                          }`}
                        >
                          استيراد سجل قضايا ومحاكم
                        </button>
                      </div>
                    </div>

                    {/* Drag and Drop File Zone */}
                    <div className="relative border-2 border-dashed border-gray-200 hover:border-[#D4AF37] bg-gray-50/30 hover:bg-amber-50/10 rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[140px] group">
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleExcelUpload}
                      />
                      <FileSpreadsheet className="h-10 w-10 text-gray-300 group-hover:text-[#D4AF37] mb-2 transition-colors" />
                      {excelFileName ? (
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-green-700">{excelFileName}</p>
                          <p className="text-xs text-gray-400">انقر لتغيير الملف المرفوع</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-[#0A192F]">اسحب وأفلت جدول إكسل هنا</p>
                          <p className="text-xs text-gray-400">أو تصفح الملفات من جهازك الشخصي</p>
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>

              </div>

              {/* Validation & Preview Output */}
              {excelError && (
                <div className="p-4 bg-red-50 text-red-800 rounded-2xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">خطأ في توافق الملف</p>
                    <p className="text-xs text-red-700 mt-1">{excelError}</p>
                  </div>
                </div>
              )}

              {importSuccessMessage && (
                <div className="p-6 bg-green-50 text-green-800 rounded-3xl border border-green-100 flex items-center gap-4 animate-in fade-in slide-in-from-bottom duration-300">
                  <CheckCircle className="h-10 w-10 text-green-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold">نجحت عملية الاستيراد الجماعي!</p>
                    <p className="text-sm text-green-700 mt-1">{importSuccessMessage}</p>
                  </div>
                </div>
              )}

              {importProgress && (
                <div className="p-6 bg-blue-50 text-blue-800 rounded-3xl border border-blue-100 flex items-center gap-4">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-bold">جاري كتابة السجلات في خادم قاعدة البيانات...</p>
                    <p className="text-xs text-blue-700 mt-1">{importProgress}</p>
                  </div>
                </div>
              )}

              {excelData.length > 0 && !importProgress && (
                <Card className="shadow-md border-gray-200 overflow-hidden animate-in fade-in duration-300">
                  <CardHeader className="border-b bg-gray-50/50 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg text-[#0A192F]">جدول فحص وتدقيق السجلات ({excelParsedCount})</CardTitle>
                      <CardDescription>تأكد من صحة الحقول المكتشفة أدناه قبل الحفظ النهائي في النظام</CardDescription>
                    </div>
                    <Button
                      onClick={handleBulkImport}
                      className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white font-bold py-6 px-8 rounded-2xl shadow-lg shadow-[#0A192F]/20 active:scale-[0.98] transition-transform self-stretch sm:self-auto"
                    >
                      حفظ البيانات في النظام وتأكيد الاستيراد
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto max-h-[50vh]">
                    <Table>
                      <TableHeader className="bg-gray-100/50">
                        <TableRow>
                          <TableHead className="w-12 text-center font-bold text-gray-500">#</TableHead>
                          {importType === 'CLIENTS' ? (
                            <>
                              <TableHead className="text-right font-bold text-[#0A192F]">الاسم الكامل</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">النوع</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">الهاتف</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">الهوية/الضريبي</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">العنوان</TableHead>
                            </>
                          ) : (
                            <>
                              <TableHead className="text-right font-bold text-[#0A192F]">عنوان القضية</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">رقم القضية</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">اسم الموكل (الرابط)</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">نوع القضية</TableHead>
                              <TableHead className="text-right font-bold text-[#0A192F]">المحكمة المرفوعة</TableHead>
                            </>
                          )}
                          <TableHead className="text-center font-bold text-gray-500 w-28">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {excelData.map((row, index) => (
                          <TableRow key={index} className="hover:bg-gray-50/50">
                            <TableCell className="text-center font-mono text-xs text-gray-400">{index + 1}</TableCell>
                            {importType === 'CLIENTS' ? (
                              <>
                                <TableCell className="font-bold text-[#0A192F]">{row["الاسم الكامل"] || "-"}</TableCell>
                                <TableCell>{row["النوع (فرد/شركة)"] || "فرد"}</TableCell>
                                <TableCell className="font-mono text-sm">{row["الهاتف"] || "-"}</TableCell>
                                <TableCell className="font-mono text-sm">{row["الهوية_الرقم الضريبي"] || "-"}</TableCell>
                                <TableCell className="truncate max-w-xs">{row["العنوان"] || "-"}</TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="font-bold text-[#0A192F]">{row["عنوان القضية"] || "-"}</TableCell>
                                <TableCell className="font-mono text-sm">{row["رقم القضية"] || "-"}</TableCell>
                                <TableCell className="text-[#D4AF37] font-bold">{row["اسم الموكل"] || "-"}</TableCell>
                                <TableCell>{row["نوع القضية"] || "-"}</TableCell>
                                <TableCell className="truncate max-w-xs">{row["المحكمة"] || "-"}</TableCell>
                              </>
                            )}
                            <TableCell className="text-center">
                              <Badge className="bg-green-50 border-green-200 text-green-700 hover:bg-green-50 shadow-none font-bold">جاهز ومطابق</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

            </div>
          )}

          {/* Sub Tab 3.2: Free Custom Excel Spreadsheet Grid */}
          {excelSubTab === 'FREE_SPREADSHEET' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Custom Title & Actions Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 border rounded-3xl shadow-sm">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-bold text-gray-400">عنوان ورقة العمل المصدرة:</label>
                  <Input
                    value={freeExcelTitle}
                    onChange={e => setFreeExcelTitle(e.target.value)}
                    className="border-gray-200 font-bold text-sm bg-gray-50 focus:bg-white focus:ring-[#0A192F]/10 w-full sm:w-80"
                    placeholder="اكتب عنوان جدول البيانات..."
                  />
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" onClick={handleAddExcelRow} className="border-gray-200 text-gray-700 flex-1 sm:flex-initial">
                    <Rows size={16} className="ml-1" /> إضافة صف
                  </Button>
                  <Button variant="outline" onClick={handleAddExcelColumn} className="border-gray-200 text-gray-700 flex-1 sm:flex-initial">
                    <Columns size={16} className="ml-1" /> إضافة عمود
                  </Button>
                  <Button variant="outline" onClick={handleClearFreeExcel} className="border-red-200 text-red-700 hover:bg-red-50 flex-1 sm:flex-initial">
                    مسح الجدول
                  </Button>
                  <Button
                    onClick={handleExportFreeExcel}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-8 rounded-2xl shadow-lg shadow-green-600/15 active:scale-[0.98] flex-1 sm:flex-initial"
                  >
                    <FileSpreadsheet className="ml-2 h-5 w-5" /> تنزيل ملف Excel (.xlsx)
                  </Button>
                </div>
              </div>

              {/* Grid Canvas */}
              <Card className="shadow-md border-gray-200 overflow-hidden bg-white rounded-3xl">
                <div className="overflow-auto max-h-[60vh] border-b">
                  <table className="w-full border-collapse text-right text-sm">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="w-12 text-center font-bold text-gray-400 border-l bg-gray-100 select-none">#</th>
                        {spreadsheetHeaders.map((header, cIndex) => (
                          <th key={cIndex} className="p-0 border-l min-w-[150px] relative">
                            <input
                              value={header}
                              onChange={e => handleHeaderChange(cIndex, e.target.value)}
                              className="w-full h-11 px-3 py-2 bg-gray-100 focus:bg-white text-right font-bold text-[#0A192F] outline-none border-none focus:ring-2 focus:ring-[#D4AF37]/50"
                              placeholder={`عمود ${cIndex + 1}`}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spreadsheetRows.map((row, rIndex) => (
                        <tr key={rIndex} className="hover:bg-gray-50/50 border-b last:border-none">
                          <td className="text-center font-mono text-xs text-gray-400 font-bold bg-gray-50/50 border-l select-none">{rIndex + 1}</td>
                          {row.map((cellValue, cIndex) => (
                            <td key={cIndex} className="p-0 border-l">
                              <input
                                value={cellValue}
                                onChange={e => handleCellChange(rIndex, cIndex, e.target.value)}
                                className="w-full h-10 px-3 bg-transparent outline-none border-none focus:bg-white focus:ring-2 focus:ring-[#0A192F]/10 text-right text-gray-700"
                                placeholder="..."
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-gray-50/80 text-xs text-gray-400 flex items-center justify-between select-none">
                  <span>تمكين وضع التعديل الحر — انقر فوق أي خلية أو ترويسة للكتابة وتعديل القيم مباشرة.</span>
                  <span>الأبعاد الحالية: {spreadsheetRows.length} صف × {spreadsheetHeaders.length} عمود</span>
                </div>
              </Card>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
