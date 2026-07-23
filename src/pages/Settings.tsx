import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Shield, Bell, User, Lock, Palette, Globe, Settings as SettingsIcon, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Sparkles, DollarSign, FileEdit, Link, Key, Check } from "lucide-react";
import { auth } from "../lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";

function ChangePasswordForm() {
  const [form, setForm]         = useState({ current: "", newPass: "", confirm: "" });
  const [show, setShow]         = useState({ current: false, newPass: false, confirm: false });
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState("");

  const toggle = (field: keyof typeof show) =>
    setShow(prev => ({ ...prev, [field]: !prev[field] }));

  const validate = () => {
    if (!form.current)              return "أدخل كلمة المرور الحالية";
    if (form.newPass.length < 6)    return "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل";
    if (form.newPass !== form.confirm) return "كلمتا المرور غير متطابقتين";
    if (form.newPass === form.current) return "كلمة المرور الجديدة يجب أن تختلف عن الحالية";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("المستخدم غير مسجل الدخول");

      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, form.current);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, form.newPass);

      setSuccess(true);
      setForm({ current: "", newPass: "", confirm: "" });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("كلمة المرور الحالية غير صحيحة");
      } else if (err.code === "auth/too-many-requests") {
        setError("محاولات كثيرة جداً، حاول بعد قليل");
      } else {
        setError(err.message || "حدث خطأ، حاول مرة أخرى");
      }
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    const p = form.newPass;
    if (!p) return null;
    if (p.length < 6) return { level: 1, label: "ضعيفة جداً", color: "bg-red-500" };
    if (p.length < 8) return { level: 2, label: "ضعيفة", color: "bg-orange-400" };
    if (!/[A-Z]/.test(p) || !/[0-9]/.test(p)) return { level: 3, label: "متوسطة", color: "bg-yellow-400" };
    return { level: 4, label: "قوية", color: "bg-green-500" };
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
      {success && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold">
          <CheckCircle2 size={18} /> تم تغيير كلمة المرور بنجاح!
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Current Password */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">كلمة المرور الحالية</label>
        <div className="relative">
          <input
            type={show.current ? "text" : "password"}
            value={form.current}
            onChange={e => setForm({ ...form, current: e.target.value })}
            placeholder="••••••••"
            className="w-full pr-4 pl-12 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#0A192F] focus:ring-2 focus:ring-[#0A192F]/10 text-sm"
          />
          <button type="button" onClick={() => toggle("current")}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show.current ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* New Password */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">كلمة المرور الجديدة</label>
        <div className="relative">
          <input
            type={show.newPass ? "text" : "password"}
            value={form.newPass}
            onChange={e => setForm({ ...form, newPass: e.target.value })}
            placeholder="••••••••"
            className="w-full pr-4 pl-12 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#0A192F] focus:ring-2 focus:ring-[#0A192F]/10 text-sm"
          />
          <button type="button" onClick={() => toggle("newPass")}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show.newPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {strength && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= strength.level ? strength.color : "bg-gray-200"}`} />
              ))}
            </div>
            <p className={`text-xs font-bold ${strength.level <= 2 ? "text-red-500" : strength.level === 3 ? "text-yellow-500" : "text-green-500"}`}>
              قوة كلمة المرور: {strength.label}
            </p>
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">تأكيد كلمة المرور الجديدة</label>
        <div className="relative">
          <input
            type={show.confirm ? "text" : "password"}
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            placeholder="••••••••"
            className={`w-full pr-4 pl-12 py-3 border rounded-2xl focus:outline-none focus:ring-2 text-sm transition-colors ${
              form.confirm && form.newPass !== form.confirm
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-[#0A192F] focus:ring-[#0A192F]/10"
            }`}
          />
          <button type="button" onClick={() => toggle("confirm")}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          {form.confirm && form.newPass === form.confirm && (
            <CheckCircle2 size={16} className="absolute left-10 top-1/2 -translate-y-1/2 text-green-500" />
          )}
        </div>
        {form.confirm && form.newPass !== form.confirm && (
          <p className="text-xs text-red-500 font-bold">كلمتا المرور غير متطابقتين</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#0A192F] hover:bg-[#0A192F]/90 text-[#D4AF37] font-black py-3 rounded-2xl transition flex items-center justify-center gap-2"
      >
        {loading ? <><Loader2 size={18} className="animate-spin" /> جاري التغيير...</> : "تغيير كلمة المرور"}
      </button>
    </form>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("security");
  const userName  = localStorage.getItem("userName") || "المستخدم";
  const userEmail = localStorage.getItem("userEmail") || auth.currentUser?.email || "";
  const userRole  = localStorage.getItem("userRole");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);

  // System settings state loaded from localStorage
  const [sysSettings, setSysSettings] = useState({
    najizMode: localStorage.getItem("sys_najizMode") || "CHROME_EXTENSION",
    najizApiKey: localStorage.getItem("sys_najizApiKey") || "",
    najizClientId: localStorage.getItem("sys_najizClientId") || "",
    najizSyncFreq: localStorage.getItem("sys_najizSyncFreq") || "DAILY",

    aiProvider: localStorage.getItem("sys_aiProvider") || "GEMINI",
    aiApiKey: localStorage.getItem("sys_aiApiKey") || "",
    aiModel: localStorage.getItem("sys_aiModel") || "gemini-flash-latest",
    aiAnalysisEnabled: localStorage.getItem("sys_aiAnalysisEnabled") !== "false",
    aiDraftingEnabled: localStorage.getItem("sys_aiDraftingEnabled") !== "false",
    aiRisksEnabled: localStorage.getItem("sys_aiRisksEnabled") !== "false",

    currency: localStorage.getItem("sys_currency") || "SAR",
    vatRate: Number(localStorage.getItem("sys_vatRate") || "15"),
    zatcaEnabled: localStorage.getItem("sys_zatcaEnabled") === "true",

    eSignatureMode: localStorage.getItem("sys_eSignatureMode") || "OTP_NATIVE",
  });

  const saveAllSettings = () => {
    setSaving(true);
    try {
      localStorage.setItem("sys_najizMode", sysSettings.najizMode);
      localStorage.setItem("sys_najizApiKey", sysSettings.najizApiKey);
      localStorage.setItem("sys_najizClientId", sysSettings.najizClientId);
      localStorage.setItem("sys_najizSyncFreq", sysSettings.najizSyncFreq);

      localStorage.setItem("sys_aiProvider", sysSettings.aiProvider);
      localStorage.setItem("sys_aiApiKey", sysSettings.aiApiKey);
      localStorage.setItem("sys_aiModel", sysSettings.aiModel);
      localStorage.setItem("sys_aiAnalysisEnabled", String(sysSettings.aiAnalysisEnabled));
      localStorage.setItem("sys_aiDraftingEnabled", String(sysSettings.aiDraftingEnabled));
      localStorage.setItem("sys_aiRisksEnabled", String(sysSettings.aiRisksEnabled));

      localStorage.setItem("sys_currency", sysSettings.currency);
      localStorage.setItem("sys_vatRate", String(sysSettings.vatRate));
      localStorage.setItem("sys_zatcaEnabled", String(sysSettings.zatcaEnabled));

      localStorage.setItem("sys_eSignatureMode", sysSettings.eSignatureMode);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedFakeData = async () => {
    setSaving(true);
    try {
      const { collection, addDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      const lawyerId = localStorage.getItem("lawyerId") || auth.currentUser?.uid || "admin_user_001";

      // 1. Seed Clients
      const clientRefs = [];
      const fakeClients = [
        { fullName: "شركة الرياض للاستثمار", clientType: "COMPANY", phone: "0501234567", nationalId: "1002938475", totalFees: 45000, address: "طريق الملك فهد، الرياض", lawyerId },
        { fullName: "عبد الرحمن بن سليمان", clientType: "INDIVIDUAL", phone: "0559876543", nationalId: "1083749201", totalFees: 12000, address: "حي النخيل، جدة", lawyerId },
        { fullName: "مؤسسة التشييد والبناء", clientType: "COMPANY", phone: "0534567890", nationalId: "1029384756", totalFees: 60000, address: "المنطقة الصناعية، الدمام", lawyerId }
      ];

      for (const c of fakeClients) {
        const docRef = await addDoc(collection(db, "clients"), {
          ...c,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        clientRefs.push({ id: docRef.id, ...c });
      }

      // 2. Seed Cases (including Enforcement Case with dynamic tracker)
      const caseRefs = [];
      const fakeCases = [
        {
          title: "دعوى مطالبة مالية - مقاولة",
          caseNumber: "١٢٣٤/ج/١٤٤٧",
          type: "COMMERCIAL",
          clientId: clientRefs[0].id,
          courtName: "المحكمة التجارية بالرياض",
          circuit: "الدائرة الثالثة",
          status: "OPEN",
          lawyerId,
          opponentName: "مؤسسة الحلول الرقمية",
          opponentLawyer: "أ. خالد الحربي",
          startDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          title: "تنفيذ سند لأمر - شركة الرياض",
          caseNumber: "٤٥١٠٢٩٣٨٤",
          type: "ENFORCEMENT", // This will trigger the Najiz tracker!
          clientId: clientRefs[0].id,
          courtName: "محكمة التنفيذ بالرياض",
          circuit: "الدائرة الثانية تنفيذ",
          status: "OPEN",
          lawyerId,
          opponentName: "عبد الرحمن بن سليمان",
          opponentLawyer: "مباشر بدون محامي",
          startDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          enforcementSteps: {
            1: true,
            2: true,
            3: true,
            4: true,
            5: true,
            6: true,
            7: true
          },
          enforcementScenarios: {
            installment: true
          }
        },
        {
          title: "قضية عمالية - مستحقات رواتب",
          caseNumber: "٥٦٧٨/ع/١٤٤٧",
          type: "LABOR",
          clientId: clientRefs[1].id,
          courtName: "المحكمة العمالية بجدة",
          circuit: "الدائرة الأولى عمالي",
          status: "PENDING",
          lawyerId,
          opponentName: "شركة مقاولات الخليج",
          opponentLawyer: "أ. محمد العتيبي",
          startDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const c of fakeCases) {
        const docRef = await addDoc(collection(db, "cases"), c);
        caseRefs.push({ id: docRef.id, ...c });

        // Add a hearing for the commercial and labor cases
        if (c.type !== "ENFORCEMENT") {
          await addDoc(collection(db, "cases", docRef.id, "hearings"), {
            hearingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            court: c.courtName,
            circuit: c.circuit,
            requiredActions: "تقديم الدفوع ومذكرة جوابية",
            previousDecision: "إمهال المدعى عليه لتقديم الجواب",
            notes: "حضور الجلسة عبر منصة تقاضي الإلكترونية",
            createdAt: new Date().toISOString()
          });
        }
      }

      // 3. Seed Tasks
      const fakeTasks = [
        { title: "صياغة مذكرة دفاع جوابية", description: "إعداد الدفوع القانونية للقضية التجارية", priority: "HIGH", status: "IN_PROGRESS", caseId: caseRefs[0].id, assignedTo: lawyerId },
        { title: "إرفاق سند لأمر إلكترونياً", description: "رفع السند التنفيذي في طلب التنفيذ بمحكمة التنفيذ", priority: "URGENT", status: "COMPLETED", caseId: caseRefs[1].id, assignedTo: lawyerId },
        { title: "تجهيز مستندات الرواتب", description: "جمع كشوف الحسابات البنكية للموكل لإثبات عدم استلام الرواتب", priority: "MEDIUM", status: "NEW", caseId: caseRefs[2].id, assignedTo: lawyerId }
      ];

      for (const t of fakeTasks) {
        await addDoc(collection(db, "tasks"), {
          ...t,
          lawyerId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      // 4. Seed Payments
      const fakePayments = [
        { caseId: caseRefs[0].id, clientId: clientRefs[0].id, amount: 25000, notes: "الدفعة الأولى من الأتعاب المتفق عليها لعقد التمثيل القضائي", date: new Date().toISOString(), lawyerId },
        { caseId: caseRefs[1].id, clientId: clientRefs[0].id, amount: 5000, notes: "أتعاب فتح وتقديم طلب التنفيذ بمحكمة التنفيذ", date: new Date().toISOString(), lawyerId }
      ];

      for (const p of fakePayments) {
        await addDoc(collection(db, "payments"), {
          ...p,
          createdAt: new Date().toISOString()
        });
      }

      alert("🎉 تم توليد البيانات التجريبية المتكاملة بنجاح (الموكلين، القضايا، الجلسات، المهام، والمدفوعات)!");
      window.location.reload();
    } catch (err) {
      console.error("Seeding error:", err);
      alert("حدث خطأ أثناء توليد البيانات");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "general",       name: "عام",              icon: <Globe size={20} /> },
    { id: "profile",       name: "الملف الشخصي",     icon: <User size={20} /> },
    { id: "security",      name: "الأمان",            icon: <Lock size={20} /> },
    { id: "integrations",  name: "الربط والأنظمة",     icon: <SettingsIcon size={20} /> },
    { id: "permissions",   name: "الصلاحيات",         icon: <Shield size={20} /> },
    { id: "notifications", name: "التنبيهات",          icon: <Bell size={20} /> },
    { id: "appearance",    name: "المظهر",            icon: <Palette size={20} /> },
  ];

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-[#0A192F]">الإعدادات</h1>
        <p className="text-gray-500 mt-1 text-sm">إدارة حسابك وإعدادات الأمان والأنظمة</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-56 space-y-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm ${
                activeTab === tab.id
                  ? "bg-[#0A192F] text-[#D4AF37] shadow-lg font-bold"
                  : "text-gray-600 hover:bg-white hover:text-[#0A192F]"
              }`}>
              {tab.icon}
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          <Card className="shadow-sm border-gray-100">
            <CardHeader className="border-b border-gray-50">
              <CardTitle className="text-lg font-black text-[#0A192F]">
                {tabs.find(t => t.id === activeTab)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">

              {/* ========== SECURITY TAB ========== */}
              {activeTab === "security" && (
                <div className="space-y-8">
                  {/* User info */}
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                    <div className="w-12 h-12 bg-[#0A192F] rounded-full flex items-center justify-center text-[#D4AF37] font-black text-lg">
                      {userName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-[#0A192F]">{userName}</p>
                      <p className="text-sm text-gray-500">{auth.currentUser?.email || userEmail}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {userRole === "SUPER_ADMIN" ? "مدير النظام" : userRole === "LAWYER" ? "محامي" : "متدرب"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-[#0A192F] mb-1">تغيير كلمة المرور</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      يجب إدخال كلمة المرور الحالية أولاً للتحقق من هويتك قبل تغييرها.
                    </p>
                    <ChangePasswordForm />
                  </div>

                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="text-sm font-black text-gray-700 mb-3">نصائح أمان</h3>
                    <ul className="space-y-2">
                      {[
                        "استخدم كلمة مرور من 8 أحرف على الأقل",
                        "اجمع بين الأحرف الكبيرة والصغيرة والأرقام",
                        "لا تشارك كلمة مرورك مع أحد",
                        "غيّر كلمة المرور كل 3 أشهر",
                      ].map(tip => (
                        <li key={tip} className="flex items-center gap-2 text-sm text-gray-500">
                          <CheckCircle2 size={14} className="text-green-400 shrink-0" /> {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ========== PROFILE TAB ========== */}
              {activeTab === "profile" && (
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">الاسم</label>
                    <input defaultValue={userName}
                      className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#0A192F] text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">البريد الإلكتروني</label>
                    <input defaultValue={auth.currentUser?.email || ""} disabled
                      className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-gray-50 text-sm text-gray-500 cursor-not-allowed" />
                    <p className="text-xs text-gray-400">لتغيير البريد الإلكتروني تواصل مع المدير</p>
                  </div>
                  <button className="px-6 py-3 bg-[#0A192F] text-[#D4AF37] font-bold rounded-2xl text-sm hover:bg-[#0A192F]/90 transition">
                    حفظ التغييرات
                  </button>
                </div>
              )}

              {/* ========== PERMISSIONS TAB ========== */}
              {activeTab === "permissions" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
                    <Shield className="text-blue-600 mt-1 shrink-0" size={20} />
                    <div>
                      <p className="font-bold text-blue-900 text-sm">نظام الصلاحيات</p>
                      <p className="text-sm text-blue-700">تحديد ما يمكن للمتدربين والموظفين الوصول إليه.</p>
                    </div>
                  </div>
                  {[
                    { label: "عرض الماليات للمتدربين", desc: "إظهار الأتعاب والمصروفات لحسابات المتدربين", active: false },
                    { label: "إضافة قضايا جديدة",    desc: "السماح للمتدربين بفتح ملفات قضايا",          active: true },
                    { label: "حذف المستندات",         desc: "منع المتدربين من حذف المستندات المرفوعة",     active: false },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-4 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-bold text-[#0A192F] text-sm">{item.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                      </div>
                      <div className={`w-11 h-6 rounded-full relative ${item.active ? "bg-[#D4AF37]" : "bg-gray-200"}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${item.active ? "right-1" : "left-1"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ========== GENERAL TAB ========== */}
              {activeTab === "general" && (
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">اسم المكتب</label>
                    <input type="text" defaultValue="مكتب المحامي"
                      className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#0A192F] text-sm" />
                  </div>
                  <button className="px-6 py-3 bg-[#0A192F] text-[#D4AF37] font-bold rounded-2xl text-sm hover:bg-[#0A192F]/90 transition">
                    حفظ التغييرات
                  </button>
                </div>
              )}

              {/* ========== INTEGRATIONS TAB ========== */}
              {activeTab === "integrations" && (
                <div className="space-y-6">
                  {/* Saved alert */}
                  {saveSuccess && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm font-bold animate-fade-in">
                      <CheckCircle2 size={18} /> تم حفظ إعدادات النظام والربط بنجاح!
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Najiz Section */}
                    <Card className="shadow-sm border border-gray-100">
                      <CardHeader className="pb-3 bg-gray-50/50">
                        <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                          <Link size={18} className="text-[#D4AF37]" /> تكامل منصة ناجز (وزارة العدل)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">آلية الربط مع ناجز</label>
                          <select
                            value={sysSettings.najizMode}
                            onChange={e => setSysSettings({ ...sysSettings, najizMode: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          >
                            <option value="CHROME_EXTENSION">سحب تلقائي عبر إضافة المتصفح (Chrome Extension)</option>
                            <option value="SMART_IMPORT">الرفع والاستيراد اليدوي الذكي (PDF / HTML)</option>
                            <option value="OFFICIAL_API">الربط المباشر الموثق (Official MOJ API)</option>
                            <option value="DISABLED">إيقاف التكامل والربط</option>
                          </select>
                        </div>

                        {sysSettings.najizMode === "OFFICIAL_API" && (
                          <div className="space-y-3 pt-2 border-t border-dashed border-gray-100">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-700">مفتاح الربط (API Key)</label>
                              <input
                                type="password"
                                value={sysSettings.najizApiKey}
                                onChange={e => setSysSettings({ ...sysSettings, najizApiKey: e.target.value })}
                                placeholder="api_key_xxxxxxxxxxxxx"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-700">معرف العميل (Client ID)</label>
                              <input
                                type="text"
                                value={sysSettings.najizClientId}
                                onChange={e => setSysSettings({ ...sysSettings, najizClientId: e.target.value })}
                                placeholder="client_id_xxxxxxxxx"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                              />
                            </div>
                          </div>
                        )}

                        {sysSettings.najizMode !== "DISABLED" && (
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700">تردد مزامنة البيانات وتحديث القضايا</label>
                            <select
                              value={sysSettings.najizSyncFreq}
                              onChange={e => setSysSettings({ ...sysSettings, najizSyncFreq: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                            >
                              <option value="HOURLY">كل ساعة</option>
                              <option value="DAILY">يومياً (موصى به)</option>
                              <option value="WEEKLY">أسبوعياً</option>
                              <option value="MANUAL">تحديث يدوي فقط</option>
                            </select>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* AI Section */}
                    <Card className="shadow-sm border border-gray-100">
                      <CardHeader className="pb-3 bg-gray-50/50">
                        <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                          <Sparkles size={18} className="text-[#D4AF37]" /> محرك الذكاء الاصطناعي القانوني
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">مزود خدمة الذكاء الاصطناعي</label>
                          <select
                            value={sysSettings.aiProvider}
                            onChange={e => {
                              const provider = e.target.value;
                              let defModel = "gemini-flash-latest";
                              if (provider === "GROQ") defModel = "llama-3.3-70b-versatile";
                              setSysSettings({ ...sysSettings, aiProvider: provider, aiModel: defModel });
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          >
                            <option value="GEMINI">Google Gemini API (مستحسن للأبحاث والملفات الضخمة)</option>
                            <option value="GROQ">Groq API (أداء فائق السرعة)</option>
                            <option value="CUSTOM">خادم ذكاء اصطناعي محلي / مخصص</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">مفتاح API Key الخاص بالمزود</label>
                          <div className="relative">
                            <input
                              type={showAiKey ? "text" : "password"}
                              value={sysSettings.aiApiKey}
                              onChange={e => setSysSettings({ ...sysSettings, aiApiKey: e.target.value })}
                              placeholder={sysSettings.aiProvider === "GEMINI" ? "أدخل مفتاح Gemini API هنا..." : "أدخل مفتاح Groq API هنا..."}
                              className="w-full pr-3 pl-10 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAiKey(!showAiKey)}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">النموذج النشط (Active Model)</label>
                          <select
                            value={sysSettings.aiModel}
                            onChange={e => setSysSettings({ ...sysSettings, aiModel: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          >
                            {sysSettings.aiProvider === "GEMINI" ? (
                              <>
                                <option value="gemini-flash-latest">Gemini Flash (الافتراضي السريع والمجاني - مستحسن)</option>
                                <option value="gemini-pro-latest">Gemini Pro (التحليل الذكي والعميق)</option>
                                <option value="gemini-3.5-flash">Gemini 3.5 Flash (إصدار حديث وسريع)</option>
                                <option value="gemini-3.6-flash">Gemini 3.6 Flash (آخر إصدار مستقر)</option>
                              </>
                            ) : sysSettings.aiProvider === "GROQ" ? (
                              <>
                                <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                                <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                              </>
                            ) : (
                              <option value="custom-model">نموذج مخصص مدمج</option>
                            )}
                          </select>
                        </div>

                        <div className="space-y-2 pt-2">
                          <label className="text-xs font-bold text-gray-700 block mb-1">الميزات الذكية المفعلة</label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sysSettings.aiAnalysisEnabled}
                                onChange={e => setSysSettings({ ...sysSettings, aiAnalysisEnabled: e.target.checked })}
                                className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                              />
                              تحليل قضايا واستخراج الوقائع والطلبات
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sysSettings.aiDraftingEnabled}
                                onChange={e => setSysSettings({ ...sysSettings, aiDraftingEnabled: e.target.checked })}
                                className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                              />
                              إنشاء وصياغة المذكرات واللوائح القانونية
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sysSettings.aiRisksEnabled}
                                onChange={e => setSysSettings({ ...sysSettings, aiRisksEnabled: e.target.checked })}
                                className="rounded text-[#D4AF37] focus:ring-[#D4AF37]"
                              />
                              تحليل العقود واكتشاف المخاطر والبنود المفقودة
                            </label>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Financial/Tax Section */}
                    <Card className="shadow-sm border border-gray-100">
                      <CardHeader className="pb-3 bg-gray-50/50">
                        <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                          <DollarSign size={18} className="text-[#D4AF37]" /> الإعدادات المالية والضريبية
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">العملة الافتراضية للنظام</label>
                          <select
                            value={sysSettings.currency}
                            onChange={e => {
                              const cur = e.target.value;
                              let vat = 15;
                              if (cur === "EGP") vat = 0;
                              setSysSettings({ ...sysSettings, currency: cur, vatRate: vat });
                            }}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          >
                            <option value="SAR">الريال السعودي (ر.س) - السعودية</option>
                            <option value="EGP">الجنيه المصري (ج.م) - مصر</option>
                            <option value="USD">الدولار الأمريكي ($)</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">نسبة ضريبة القيمة المضافة (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={sysSettings.vatRate}
                            onChange={e => setSysSettings({ ...sysSettings, vatRate: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          />
                        </div>

                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                          <input
                            type="checkbox"
                            id="zatcaEnabled"
                            checked={sysSettings.zatcaEnabled}
                            onChange={e => setSysSettings({ ...sysSettings, zatcaEnabled: e.target.checked })}
                            className="rounded text-[#D4AF37] focus:ring-[#D4AF37] mt-1"
                          />
                          <div>
                            <label htmlFor="zatcaEnabled" className="text-xs font-bold text-[#0A192F] block cursor-pointer">
                              تفعيل الفاتورة الإلكترونية المعتمدة (ZATCA)
                            </label>
                            <span className="text-[10px] text-gray-500 block mt-0.5">
                              توليد الـ QR code الفوري المتوافق مع هيئة الزكاة والضريبة والجمارك السعودية للفواتير الصادرة.
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* E-Signature Section */}
                    <Card className="shadow-sm border border-gray-100">
                      <CardHeader className="pb-3 bg-gray-50/50">
                        <CardTitle className="text-base font-bold text-[#0A192F] flex items-center gap-2">
                          <FileEdit size={18} className="text-[#D4AF37]" /> نظام التوقيع الإلكتروني للعملاء
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">منصة التوقيع المعتمدة</label>
                          <select
                            value={sysSettings.eSignatureMode}
                            onChange={e => setSysSettings({ ...sysSettings, eSignatureMode: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A192F]"
                          >
                            <option value="OTP_NATIVE">نظام التوقيع الداخلي (رسالة التحقق OTP عبر الجوال)</option>
                            <option value="DOCUSIGN">التكامل مع منصة DocuSign العالمية</option>
                            <option value="ADOBE_SIGN">التكامل مع منصة Adobe Sign</option>
                          </select>
                        </div>
                        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl leading-relaxed">
                          {sysSettings.eSignatureMode === "OTP_NATIVE" ? (
                            <span>💡 <strong>النظام الداخلي:</strong> يرسل رمز تحقق سري للعميل، وبإدخاله في البوابة يُحفظ العقد كموقع مع كود بصمة رقمي وتوثيق IP والتاريخ.</span>
                          ) : (
                            <span>🔗 <strong>الربط السحابي:</strong> يتطلب إدخال بيانات الربط في حسابك الخارجي ليتم إرسال المستندات والتوقيع عليها بشكل رسمي.</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={handleSeedFakeData}
                      disabled={saving}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl transition shadow-lg flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      توليد بيانات تجريبية (Fake Data)
                    </button>
                    <button
                      onClick={saveAllSettings}
                      disabled={saving}
                      className="px-8 py-3 bg-[#0A192F] hover:bg-[#0A192F]/90 text-[#D4AF37] font-bold rounded-2xl transition shadow-lg flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      حفظ إعدادات النظام
                    </button>
                  </div>
                </div>
              )}

              {/* ========== OTHER TABS ========== */}
              {!["security", "profile", "permissions", "general", "integrations"].includes(activeTab) && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <SettingsIcon size={48} className="mb-4 opacity-20" />
                  <p className="font-bold">قيد التطوير في النسخة القادمة</p>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
