import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Shield, Bell, User, Lock, Palette, Globe, Settings as SettingsIcon, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
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

  const tabs = [
    { id: "general",       name: "عام",              icon: <Globe size={20} /> },
    { id: "profile",       name: "الملف الشخصي",     icon: <User size={20} /> },
    { id: "security",      name: "الأمان",            icon: <Lock size={20} /> },
    { id: "permissions",   name: "الصلاحيات",         icon: <Shield size={20} /> },
    { id: "notifications", name: "التنبيهات",          icon: <Bell size={20} /> },
    { id: "appearance",    name: "المظهر",            icon: <Palette size={20} /> },
  ];

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-[#0A192F]">الإعدادات</h1>
        <p className="text-gray-500 mt-1 text-sm">إدارة حسابك وإعدادات الأمان</p>
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

              {/* ========== OTHER TABS ========== */}
              {!["security", "profile", "permissions", "general"].includes(activeTab) && (
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
