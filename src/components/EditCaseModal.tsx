import { FormEvent, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";
import { AddClientModal } from "./AddClientModal";
import { useOfficeLookups } from "../lib/officeLookups";
import { clientRoleOf } from "../lib/clientRole";
import { caseTypeLabel } from "../lib/caseTypes";
import { assignedLawyersFields, assignedLawyersOf } from "../lib/assignedLawyers";
import LawyerMultiSelect from "./LawyerMultiSelect";
import { Textarea } from "./ui/textarea";
import { partyLabels } from "../lib/clientRole";
import { EMPTY_EXECUTION_DETAILS, executionDetailsOf } from "../lib/execution";
import { ExecutionContentFields, ExecutionTypeFields, SectionTitle } from "./ExecutionDetailsFields";

export function EditCaseModal({
  isOpen,
  onClose,
  onSuccess,
  caseData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseData: any | null;
}) {
  const { caseTypes } = useOfficeLookups();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [clientRole, setClientRole] = useState("PLAINTIFF");
  const [officeLawyers, setOfficeLawyers] = useState<any[]>([]);
  const [consultants, setConsultants] = useState<any[]>([]);
  const [trainees, setTrainees] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    caseNumber: "",
    type: "عامة",
    clientId: "",
    opponentName: "",
    opponentLawyer: "",
    courtName: "",
    courtCircle: "",
    plaintiffName: "",
    defendantName: "",
    caseSubject: "",
    startDate: new Date().toISOString().split("T")[0],
    assignedLawyerIds: [] as string[],
    assignedLawyerNames: [] as string[],
    assignedLawyerId: "",
    assignedLawyerName: "",
    assignedConsultantId: "",
    assignedConsultantName: "",
    traineeIds: [] as string[],
    traineeNames: [] as string[],
    notes: "",
    enforcementRequestType: "",
    enforcementDeedType: "",
    executionDetails: { ...EMPTY_EXECUTION_DETAILS },
  });

  const fetchClients = async () => {
    try {
      const { collection, getDocs, query, orderBy } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");

      // Fetch all and filter in memory to avoid missing index errors
      const q = query(collection(db, "clients"), orderBy("fullName", "asc"));
      const snap = await getDocs(q);
      
      const allClients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filtered = allClients.filter((c: any) => 
        userRole === "SUPER_ADMIN" || c.lawyerId === lawyerId
      );
      
      setClients(filtered);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchOfficeLawyers = async () => {
    try {
      const { collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");
      
      const managerId = localStorage.getItem("lawyerId") || "";
      const managerName = localStorage.getItem("userName") || "المدير";

      const q = query(
        collection(db, "users"),
        where("lawyerId", "==", lawyerId),
        where("role", "==", "OFFICE_LAWYER")
      );
      const snap = await getDocs(q);
      const associates = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      
      setOfficeLawyers([{ id: managerId, name: managerName }, ...associates]);
    } catch (e) {
      console.error("Error fetching office lawyers for assignment:", e);
    }
  };

  const fetchConsultants = async () => {
    try {
      const { collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");

      const q = query(
        collection(db, "users"),
        where("lawyerId", "==", lawyerId),
        where("role", "==", "CONSULTANT")
      );
      const snap = await getDocs(q);
      setConsultants(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (e) {
      console.error("Error fetching consultants for assignment:", e);
    }
  };

  const fetchTrainees = async () => {
    try {
      const { collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId");

      const q = query(
        collection(db, "users"),
        where("lawyerId", "==", lawyerId),
        where("role", "==", "TRAINEE")
      );
      const snap = await getDocs(q);
      setTrainees(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (e) {
      console.error("Error fetching trainees for assignment:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchClients();
      fetchOfficeLawyers();
      fetchConsultants();
      fetchTrainees();
    }
  }, [isOpen]);

  useEffect(() => {
    if (caseData) {
      setClientRole(clientRoleOf(caseData));
      setFormData({
        title: caseData.title || "",
        caseNumber: caseData.caseNumber || "",
        type: caseTypeLabel(caseData.type) || "عامة",
        clientId: caseData.clientId || "",
        opponentName: caseData.opponentName || "",
        opponentLawyer: caseData.opponentLawyer || "",
        courtName: caseData.courtName || "",
        courtCircle: caseData.courtCircle || "",
        plaintiffName: caseData.plaintiffName || "",
        defendantName: caseData.defendantName || "",
        caseSubject: caseData.caseSubject || "",
        startDate: caseData.startDate ? new Date(caseData.startDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        // القضايا القديمة (محامٍ واحد) تُحمَّل كقائمة من عنصر واحد
        assignedLawyerIds: assignedLawyersOf(caseData).ids,
        assignedLawyerNames: assignedLawyersOf(caseData).names,
        assignedLawyerId: caseData.assignedLawyerId || "",
        assignedLawyerName: caseData.assignedLawyerName || "",
        assignedConsultantId: caseData.assignedConsultantId || "",
        assignedConsultantName: caseData.assignedConsultantName || "",
        traineeIds: caseData.traineeIds || [],
        traineeNames: caseData.traineeNames || [],
        notes: caseData.notes || "",
        enforcementRequestType: caseData.enforcementRequestType || "",
        enforcementDeedType: caseData.enforcementDeedType || "",
        executionDetails: executionDetailsOf(caseData),
      });
    }
  }, [caseData]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!caseData) return;
    setLoading(true);

    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      const selectedClient = clients.find(c => c.id === formData.clientId);
      const clientName = selectedClient ? selectedClient.fullName : "";

      const finalPlaintiffName = clientRole === "PLAINTIFF" ? clientName : formData.opponentName;
      const finalDefendantName = clientRole === "PLAINTIFF" ? formData.opponentName : clientName;
      
      const exec = caseTypeLabel(formData.type) === "تنفيذ";
      const { enforcementRequestType, enforcementDeedType, executionDetails, ...base } = formData;
      await updateDoc(doc(db, "cases", caseData.id), {
        ...base,
        ...(exec ? { enforcementRequestType, enforcementDeedType, executionDetails } : {}),
        plaintiffName: finalPlaintiffName,
        defendantName: finalDefendantName,
        clientRole,
        updatedAt: new Date().toISOString()
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء التحديث");
    } finally {
      setLoading(false);
    }
  };

  const isExec = caseTypeLabel(formData.type) === "تنفيذ";
  const P = partyLabels(isExec);
  const label = "text-sm font-bold text-[#133B2E]";
  const canAssign = localStorage.getItem("userRole") === "LAWYER" || localStorage.getItem("userRole") === "SUPER_ADMIN";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E]">{isExec ? "تعديل بيانات طلب التنفيذ" : "تعديل بيانات القضية"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isExec && <SectionTitle>بيانات الطلب</SectionTitle>}
            <div className="space-y-2">
              <label className={label}>{isExec ? "عنوان الطلب *" : "عنوان القضية *"}</label>
              <Input
                required
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                placeholder={isExec ? "مثال: تنفيذ سند لأمر - شركة س" : "مثال: دعوى تعويض ضد شركة س"}
              />
            </div>
            <div className="space-y-2">
              <label className={label}>{isExec ? "رقم الطلب *" : "رقم القضية *"}</label>
              <Input
                required
                value={formData.caseNumber}
                onChange={e => setFormData({...formData, caseNumber: e.target.value})}
                placeholder="مثال: ١٢٣٤/٢٠٢٣"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className={label}>العميل *</label>
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  + إضافة عميل جديد
                </button>
              </div>
              <select
                required
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">اختر العميل...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>

            {isExec ? (
              <div className="space-y-2">
                <label className={label}>تاريخ تقديم الطلب *</label>
                <Input type="date" required value={formData.startDate}
                  onChange={e => setFormData({...formData, startDate: e.target.value})} />
              </div>
            ) : (
              <div className="space-y-2">
                <label className={label}>نوع القضية</label>
                <select
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  {caseTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {isExec && (
              <ExecutionTypeFields
                requestType={formData.enforcementRequestType}
                deedType={formData.enforcementDeedType}
                onChange={(patch) => setFormData({ ...formData, ...patch })}
              />
            )}

            <SectionTitle>{isExec ? "أطراف الطلب" : "أطراف الدعوى والنزاع"}</SectionTitle>

            <div className="space-y-2 md:col-span-2">
              <label className={label}>صفة العميل في {isExec ? "الطلب" : "القضية"}</label>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setClientRole("PLAINTIFF")}
                  className={`flex-1 py-2 text-center text-sm font-bold rounded-lg transition-all ${
                    clientRole === "PLAINTIFF"
                      ? "bg-[#133B2E] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {isExec ? "طالب التنفيذ" : "مدعي (طالب الحق)"}
                </button>
                <button
                  type="button"
                  onClick={() => setClientRole("DEFENDANT")}
                  className={`flex-1 py-2 text-center text-sm font-bold rounded-lg transition-all ${
                    clientRole === "DEFENDANT"
                      ? "bg-[#133B2E] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {isExec ? "المنفذ ضده" : "مدعى عليه (المطلوب منه)"}
                </button>
              </div>
              <p className="text-xs font-medium mt-1">
                {clientRole === "PLAINTIFF" ? (
                  <span className="text-blue-700">← سيكون العميل هو {P.PLAINTIFF}، والخصم هو {P.DEFENDANT}.</span>
                ) : (
                  <span className="text-rose-700">← سيكون العميل هو {P.DEFENDANT}، والخصم هو {P.PLAINTIFF}.</span>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <label className={label}>
                اسم {clientRole === "PLAINTIFF" ? P.DEFENDANT : P.PLAINTIFF} (الخصم)
              </label>
              <Input
                value={formData.opponentName}
                onChange={e => setFormData({...formData, opponentName: e.target.value})}
                placeholder={`اسم ${clientRole === "PLAINTIFF" ? P.DEFENDANT : P.PLAINTIFF}`}
              />
            </div>

            <div className="space-y-2">
              <label className={label}>
                محامي {clientRole === "PLAINTIFF" ? P.DEFENDANT : P.PLAINTIFF}
              </label>
              <Input
                value={formData.opponentLawyer}
                onChange={e => setFormData({...formData, opponentLawyer: e.target.value})}
                placeholder="محامي الخصم إن وجد"
              />
            </div>

            <SectionTitle>{isExec ? "المحكمة ومنطوق الحكم" : "المحكمة وموضوع الدعوى"}</SectionTitle>

            <div className="space-y-2">
              <label className={label}>{isExec ? "محكمة التنفيذ" : "المحكمة المرفوع أمامها"}</label>
              <Input
                value={formData.courtName}
                onChange={e => setFormData({...formData, courtName: e.target.value})}
                placeholder={isExec ? "مثال: محكمة التنفيذ بالرياض" : "مثال: المحكمة العامة بالرياض"}
              />
            </div>

            <div className="space-y-2">
              <label className={label}>الدائرة القضائية</label>
              <Input
                value={formData.courtCircle}
                onChange={e => setFormData({...formData, courtCircle: e.target.value})}
                placeholder="مثال: الدائرة الحقوقية الثالثة"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className={label}>{isExec ? "منطوق الحكم / مضمون السند" : "موضوع الدعوى / القضية"}</label>
              {isExec ? (
                <Textarea rows={3} value={formData.caseSubject}
                  onChange={e => setFormData({...formData, caseSubject: e.target.value})}
                  placeholder="اكتب منطوق الحكم أو مضمون السند المطلوب تنفيذه..." />
              ) : (
                <Input
                  value={formData.caseSubject}
                  onChange={e => setFormData({...formData, caseSubject: e.target.value})}
                  placeholder="تفاصيل مختصرة لموضوع الدعوى..."
                />
              )}
            </div>

            {!isExec && (
              <div className="space-y-2">
                <label className={label}>تاريخ القضية</label>
                <Input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={e => setFormData({...formData, startDate: e.target.value})}
                />
              </div>
            )}

            {isExec && (
              <ExecutionContentFields
                value={formData.executionDetails}
                onChange={(executionDetails) => setFormData({ ...formData, executionDetails })}
              />
            )}

            {isExec && <SectionTitle>المسؤولون والملاحظات</SectionTitle>}

            {canAssign && (
              <div className="space-y-2 md:col-span-2">
                <label className={`${label} block mr-1`}>{isExec ? "الأشخاص المسؤولون" : "المحامون المسؤولون"}</label>
                <LawyerMultiSelect
                  lawyers={officeLawyers}
                  value={formData.assignedLawyerIds}
                  onChange={(ids) => setFormData({ ...formData, ...assignedLawyersFields(ids, officeLawyers) })}
                />
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <label className={label}>ملاحظات</label>
              <Textarea rows={3} value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                placeholder="أي ملاحظات داخلية..." />
            </div>


          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>

        <AddClientModal 
          isOpen={isAddClientOpen} 
          onClose={() => setIsAddClientOpen(false)} 
          onSuccess={() => {
            fetchClients();
            setIsAddClientOpen(false);
          }} 
        />
      </DialogContent>
    </Dialog>
  );
}
