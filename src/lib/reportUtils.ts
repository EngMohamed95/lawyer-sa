/** أدوات مشتركة لتوليد ملفات PDF من HTML (المذكرات وتقرير حالة القضية) وإرسالها */

/**
 * hook لخيار html2canvas: html2pdf.js يستنسخ العنصر المصدر ويُلحق النسخة
 * بـ document.body الرئيسي دائمًا (بصرف النظر عن مصدر العنصر)، فترث النسخة
 * تنسيقات Tailwind v4 العامة (*, ::before, ::after) التي تستخدم oklch() —
 * وhtml2canvas لا تدعم oklch() فتفشل. نزيل كل الأنماط من نسخة المستند التي
 * يبنيها html2canvas للرسم، ونعيد فقط خط Tajawal (محتوى التقارير كله inline
 * styles أصلًا، فلا حاجة لأي CSS آخر).
 */
export async function stripUnsupportedColorsOnClone(clonedDoc: Document) {
  clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => el.remove());
  const fontLink = clonedDoc.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap";
  clonedDoc.head.appendChild(fontLink);
  try {
    await (clonedDoc as any).fonts?.ready;
  } catch {
    // خط بديل كافٍ إن تعذّر تحميل Tajawal — لا داعي لإفشال توليد PDF بسببه
  }
}

/** يحوّل رقم هاتف محلي (05xxxxxxxx أو بصيغة دولية) إلى صيغة wa.me بلا رموز أو مسافات */
export function toWhatsAppNumber(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "966" + digits.slice(1);
  return digits;
}

/** يحمّل html2pdf.js مرة واحدة عند الحاجة */
export async function ensureHtml2pdf(): Promise<void> {
  if ((window as any).html2pdf) return;
  const script = window.document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  script.async = true;
  window.document.body.appendChild(script);
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
  });
}
