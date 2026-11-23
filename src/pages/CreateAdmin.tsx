/**
 * كانت صفحة إنشاء أول مدير منصة عبر Firebase Auth (بكلمة مرور افتراضية مكتوبة في الكود).
 * بعد التحويل لـ MySQL: مدير المنصة الأول يُنشأ من سطر الأوامر على السيرفر فقط —
 * ما في طريقة لإنشائه من المتصفح:
 *
 *   php database/create_admin.php <db-config.php> <email> "<الاسم>"
 *
 * (السكربت يطلب كلمة المرور بدون عرضها). المديرون التاليون من صفحة «فريق مديري المنصة».
 */

import { Link } from "react-router";

export default function CreateAdmin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy p-4 font-['Tajawal']" dir="rtl">
      <div className="max-w-md w-full bg-surface rounded-3xl p-8 space-y-4 text-center">
        <h1 className="text-2xl font-bold text-ink">إنشاء مدير المنصة</h1>
        <p className="text-gray-500 leading-relaxed">
          مدير المنصة الأول يُنشأ من سطر الأوامر على الخادم (database/create_admin.php)،
          والمديرون التاليون من صفحة «فريق مديري المنصة» داخل النظام.
        </p>
        <Link to="/login" className="inline-block font-bold text-ink-2 hover:underline">العودة لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
