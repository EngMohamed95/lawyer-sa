import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowRight, Calendar, Edit, FileText, Gavel, Landmark, Loader2, Scale, ScrollText, Sparkles, Users } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EditHearingModal } from "../components/EditHearingModal";
import HearingMinutesSection from "../components/HearingMinutesSection";
import HearingReportSection from "../components/HearingReportSection";

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-gray-400">{label}</p>
      <p className="text-sm font-medium text-[#133B2E]">{value || "—"}</p>
    </div>
  );
}

function ArchiveBlock({
  dotColor,
  title,
  text,
  fileUrl,
  fileName,
}: {
  dotColor: string;
  title: string;
  text?: string;
  fileUrl?: string;
  fileName?: string;
}) {
  if (!text && !fileUrl) return null;
  return (
    <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/60 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
        <span className="text-sm font-bold text-[#133B2E]">{title}</span>
      </div>
      {text && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>}
      {fileUrl && (
        <a href={fileUrl} target="_blank" rel="noreferrer" download>
          <Button variant="outline" size="sm" className="border-gray-200 text-gray-700 hover:bg-gray-100">
            <FileText className="ml-2 h-3.5 w-3.5" />
            تحميل الملف{fileName ? `: ${fileName}` : ""}
          </Button>
        </a>
      )}
    </div>
  );
}

export default function HearingDetails() {
  const { caseId, hearingId } = useParams<{ caseId: string; hearingId: string }>();
  const [hearing, setHearing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchHearing = async () => {
    if (!caseId || !hearingId) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, "cases", caseId, "hearings", hearingId));
      if (!snap.exists()) {
        setError("لم يتم العثور على الجلسة");
        setHearing(null);
      } else {
        setHearing({ id: snap.id, ...snap.data() });
      }
    } catch (err: any) {
      console.error("Error fetching hearing:", err);
      setError("حدث خطأ أثناء جلب بيانات الجلسة: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHearing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, hearingId]);

  const handleHearingUpdate = async (patch: Record<string, any>) => {
    if (!caseId || !hearingId) return;
    await updateDoc(doc(db, "cases", caseId, "hearings", hearingId), patch);
    setHearing((prev: any) => ({ ...prev, ...patch }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#133B2E]" />
      </div>
    );
  }

  if (error || !hearing) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-red-700 font-bold text-center">
          {error || "لم يتم العثور على الجلسة"}
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const isToday = hearing.hearingDate === today;
  const isPast = hearing.hearingDate < today;
  const traineeNames: string[] = hearing.traineeNames || [];

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      {caseId && (
        <EditHearingModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSuccess={() => {
            setIsEditOpen(false);
            fetchHearing();
          }}
          caseId={caseId}
          hearingData={hearing}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link to="/app/hearings" className="text-sm text-gray-500 hover:text-[#133B2E] flex items-center gap-1 mb-2">
            <ArrowRight size={14} /> رجوع لكل الجلسات
          </Link>
          <h1 className="text-2xl font-bold text-[#133B2E] tracking-tight flex items-center gap-3 flex-wrap">
            تفاصيل الجلسة
            {isToday && <Badge className="bg-amber-500 text-white">اليوم</Badge>}
            {!isToday && (
              <Badge variant="outline" className={isPast ? "border-gray-300 text-gray-500" : "text-green-600 border-green-200"}>
                {isPast ? "منتهية" : "قادمة"}
              </Badge>
            )}
          </h1>
          {caseId && (
            <Link to={`/app/cases/${caseId}`} className="text-sm text-blue-600 hover:underline mt-1 inline-block">
              {hearing.caseTitle || "عرض القضية"} {hearing.caseNumber ? `(${hearing.caseNumber})` : ""}
            </Link>
          )}
        </div>
        <Button className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white" onClick={() => setIsEditOpen(true)}>
          <Edit className="ml-2 h-4 w-4" /> تعديل الجلسة
        </Button>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Calendar className="w-5 h-5 text-[#D4AF37]" />
          <CardTitle className="text-lg text-[#133B2E]">بيانات الجلسة</CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <InfoField
            label="تاريخ الجلسة"
            value={hearing.hearingDate ? new Date(hearing.hearingDate).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : undefined}
          />
          <InfoField
            label="تاريخ الجلسة القادمة"
            value={hearing.nextHearingDate ? new Date(hearing.nextHearingDate).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : undefined}
          />
          <InfoField label="المحكمة / الغرفة" value={hearing.court} />
          <InfoField label="الدائرة / الرول" value={hearing.circuit} />
          <InfoField label="المدعي" value={hearing.plaintiffName} />
          <InfoField label="المدعى عليه" value={hearing.defendantName} />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Users className="w-5 h-5 text-[#D4AF37]" />
          <CardTitle className="text-lg text-[#133B2E]">فريق العمل على القضية</CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <InfoField label="المحامي المسؤول" value={hearing.assignedLawyerName} />
          <InfoField label="المستشار" value={hearing.assignedConsultantName} />
          <InfoField label="المتدرب" value={traineeNames.length > 0 ? traineeNames.join("، ") : undefined} />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Scale className="w-5 h-5 text-[#D4AF37]" />
          <CardTitle className="text-lg text-[#133B2E]">الالتمسات والقرار</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <InfoField label="الالتمسات / ما تم فيها" value={hearing.requiredActions} />
          <InfoField label="قرار الجلسة (النتيجة)" value={hearing.result} />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <ScrollText className="w-5 h-5 text-[#D4AF37]" />
          <CardTitle className="text-lg text-[#133B2E]">الحكم والمذكرة المعتمدة</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ArchiveBlock
            dotColor="bg-purple-500"
            title="الحكم / القرار الصادر"
            text={hearing.judgmentText}
            fileUrl={hearing.judgmentFileUrl}
            fileName={hearing.judgmentFileName}
          />
          <ArchiveBlock
            dotColor="bg-green-500"
            title="المذكرة المعتمدة"
            fileUrl={hearing.memoFileUrl}
            fileName={hearing.memoFileName}
          />
          {!(hearing.judgmentText || hearing.judgmentFileUrl || hearing.memoFileUrl) && (
            <div className="flex items-center gap-3 text-gray-400 text-sm">
              <Gavel size={18} /> لا يوجد أرشيف مسجَّل لهذه الجلسة بعد
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            <CardTitle className="text-lg text-[#133B2E]">محاضر الضبط</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <HearingMinutesSection hearing={hearing} onUpdated={handleHearingUpdate} />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200">
          <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <CardTitle className="text-lg text-[#133B2E]">تقرير الجلسة بالذكاء الاصطناعي</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <HearingReportSection
              caseData={{ title: hearing.caseTitle, caseNumber: hearing.caseNumber }}
              hearing={hearing}
              onUpdated={handleHearingUpdate}
            />
          </CardContent>
        </Card>
      </div>

      {hearing.lawyerId && localStorage.getItem("userRole") === "SUPER_ADMIN" && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Landmark size={12} /> رقم المكتب: {hearing.lawyerId}
        </p>
      )}
    </div>
  );
}
