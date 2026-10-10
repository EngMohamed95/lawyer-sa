/**
 * ترويسة وتذييل موحّدان لكل مستند مطبوع أو مُصدَّر (تقارير، مذكرات، PDF، Word).
 *
 * كل مكتب (tenant) له شعاره واسمه وعنوانه ورقمه الخاص المحفوظ في
 * OfficeProfile — هذا ما يظهر في الترويسة. شعار LawyerOS يظهر كعلامة
 * "صادر عبر" صغيرة، فلا يُنافس هوية المكتب لكنه يبقى حاضراً كمصدر النظام.
 *
 * نسختان لكل عنصر:
 *  - renderLetterheadHeader/Footer: تعتمد Flexbox — للطباعة عبر المتصفح
 *    ولتوليد PDF عبر html2canvas (يدعمها هذا المستودع فعلاً في تقرير القضية).
 *  - ...WordSafe: تعتمد الجداول فقط — Word لا يفهم Flexbox.
 */

import type { OfficeProfile } from "./officeSettings";

/** شعار المنصة — يُخدَّم من جذر المشروع (public/logo.png عبر Vite) */
const PLATFORM_LOGO_URL = "/logo.png";
const BRAND_DARK = "#133B2E";
const BRAND_DARK_2 = "#1c5741";
const BRAND_GOLD = "#D4AF37";

export interface LetterheadHeaderOptions {
  /** نص صغير أعلى يمين الترويسة (مثال: "نسخة العميل") */
  kicker?: string;
  /** عنوان المستند يُعرض كبيراً وسط الترويسة (اختياري — بعض المستندات تعرض عنوانها بنفسها أسفل الترويسة) */
  documentLabel?: string;
}

export interface LetterheadFooterOptions {
  /** رابط ختم المكتب الرسمي — يُطبع أعلى يسار التذييل إن وُجد */
  stampUrl?: string | null;
  /** ملاحظة صغيرة إضافية أسفل التذييل (مثال: تنويه سرية المستند) */
  note?: string;
}

function contactLine(profile: OfficeProfile): string {
  return [profile.address, profile.phone].filter(Boolean).join(" · ");
}

function initial(profile: OfficeProfile): string {
  return (profile.name || "مكتب").trim().charAt(0) || "م";
}

/** ترويسة احترافية بتدرّج أخضر داكن + شعار المكتب — للطباعة المباشرة و PDF */
export function renderLetterheadHeader(profile: OfficeProfile, opts: LetterheadHeaderOptions = {}): string {
  const officeLogo = profile.logoUrl
    ? `<img src="${profile.logoUrl}" alt="شعار المكتب" style="width:54px; height:54px; object-fit:contain; background:#fff; border-radius:12px; padding:5px;" />`
    : `<div style="width:54px; height:54px; border-radius:12px; background:rgba(255,255,255,0.14); display:flex; align-items:center; justify-content:center; font-size:20pt; font-weight:bold; color:${BRAND_GOLD};">${initial(profile)}</div>`;

  const contact = contactLine(profile);

  return `
    <div style="font-family:'Tajawal',sans-serif; direction:rtl;">
      <div style="background:linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_2} 100%); padding:24px 40px; color:#fff;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px;">
          <div style="display:flex; align-items:center; gap:14px; min-width:0;">
            ${officeLogo}
            <div style="min-width:0;">
              <div style="font-size:15pt; font-weight:bold; white-space:nowrap;">${profile.name || "مكتب المحاماة"}</div>
              ${contact ? `<div style="font-size:9pt; color:${BRAND_GOLD}; margin-top:2px;">${contact}</div>` : ""}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="text-align:left; font-size:8.5pt; color:#e5e5e5; white-space:nowrap;">
              ${opts.kicker ? `<div style="font-weight:bold; color:#fff;">${opts.kicker}</div>` : ""}
              <div>${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
              ${profile.crNumber ? `<div>س.ت: ${profile.crNumber}</div>` : ""}
            </div>
            <img src="${PLATFORM_LOGO_URL}" alt="LawyerOS" style="width:32px; height:32px; object-fit:contain; opacity:0.85;" />
          </div>
        </div>
        ${opts.documentLabel ? `<div style="margin-top:14px; text-align:center; font-size:14pt; font-weight:bold;">${opts.documentLabel}</div>` : ""}
      </div>
      <div style="height:4px; background:linear-gradient(90deg, ${BRAND_GOLD} 0%, #f3d879 50%, ${BRAND_GOLD} 100%);"></div>
    </div>
  `;
}

/** تذييل احترافي: ختم اختياري، خط ذهبي فاصل، بيانات تواصل المكتب، وعلامة LawyerOS صغيرة */
export function renderLetterheadFooter(profile: OfficeProfile, opts: LetterheadFooterOptions = {}): string {
  const parts = [profile.name, profile.address, profile.phone].filter(Boolean);

  return `
    <div style="font-family:'Tajawal',sans-serif; direction:rtl;">
      ${opts.stampUrl ? `
        <div style="padding:20px 40px 0; display:flex; justify-content:flex-start;">
          <img src="${opts.stampUrl}" alt="ختم المكتب" style="width:100px; opacity:0.92;" />
        </div>
      ` : ""}
      <div style="height:2px; background:${BRAND_GOLD}; opacity:0.45; margin:18px 40px 0;"></div>
      <div style="padding:12px 40px 24px; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:8pt; color:#8a8a8a;">
        <div>${parts.join("  —  ")}</div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span>صادر إلكترونياً عبر</span>
          <img src="${PLATFORM_LOGO_URL}" alt="LawyerOS" style="width:15px; height:15px; object-fit:contain; opacity:0.7;" />
          <span style="font-weight:bold; color:${BRAND_DARK};">LawyerOS</span>
        </div>
      </div>
      ${opts.note ? `<div style="padding:0 40px 20px; font-size:7.5pt; color:#aaa; text-align:center;">${opts.note}</div>` : ""}
    </div>
  `;
}

/* ────────────────────────── ترويسة المذكرات الرسمية ────────────────────────── */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * ترويسة رسمية للمذكرات والصحف المقدَّمة للمحاكم: خلفية بيضاء، الاسم العربي يميناً،
 * الشعار في الوسط، الاسم الإنجليزي ووسائل التواصل يساراً، وخط مزدوج ذهبي/أخضر.
 * جداول فقط — فتظهر متطابقة في المحرر والطباعة و PDF و Word.
 */
export function renderMemoLetterheadHeader(profile: OfficeProfile): string {
  const name = escapeHtml(profile.name || "مكتب المحاماة");
  const logo = profile.logoUrl
    ? `<img src="${escapeHtml(profile.logoUrl)}" alt="شعار المكتب" width="80" height="80" style="width:80px; height:80px; object-fit:contain; display:block; margin:0 auto;" />`
    : `<div style="width:68px; height:68px; line-height:64px; margin:0 auto; border:2px solid ${BRAND_GOLD}; border-radius:50%; text-align:center; font-size:26pt; font-weight:bold; color:${BRAND_DARK}; font-family:'Amiri',serif;">${escapeHtml(initial(profile))}</div>`;

  const arLines = [
    profile.licenseNumber && `ترخيص مزاولة المحاماة رقم: ${escapeHtml(profile.licenseNumber)}`,
    profile.crNumber && `السجل التجاري: ${escapeHtml(profile.crNumber)}`,
  ].filter(Boolean);
  const enLines = [
    profile.phone && `Tel: ${escapeHtml(profile.phone)}`,
    profile.phone2 && `Tel: ${escapeHtml(profile.phone2)}`,
    profile.email && escapeHtml(profile.email),
  ].filter(Boolean);

  return `
    <div style="font-family:'Tajawal',sans-serif; direction:rtl; padding:26px 36px 0; background:#fff;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="width:40%; vertical-align:middle; text-align:right;">
            <div style="font-size:17pt; font-weight:bold; color:${BRAND_DARK}; line-height:1.3;">${name}</div>
            ${arLines.map((l) => `<div style="font-size:8.5pt; color:#666; margin-top:2px;">${l}</div>`).join("")}
          </td>
          <td style="width:20%; vertical-align:middle; text-align:center;">${logo}</td>
          <td style="width:40%; vertical-align:middle; text-align:left; direction:ltr;">
            ${profile.nameEn ? `<div style="font-size:13pt; font-weight:bold; color:${BRAND_DARK}; font-family:Georgia,'Times New Roman',serif; letter-spacing:0.5px; line-height:1.3;">${escapeHtml(profile.nameEn)}</div>` : ""}
            ${enLines.map((l) => `<div style="font-size:8.5pt; color:#666; margin-top:2px; font-family:Arial,sans-serif;">${l}</div>`).join("")}
          </td>
        </tr>
      </table>
      <div style="height:3px; background:${BRAND_GOLD}; margin-top:16px;"></div>
      <div style="height:1px; background:${BRAND_DARK}; margin-top:2px;"></div>
    </div>
  `;
}

/** تذييل رسمي للمذكرات: خط مزدوج، ثم العنوان والهواتف والبريد والسجل في سطر واحد، وختم اختياري */
export function renderMemoLetterheadFooter(profile: OfficeProfile, opts: { stampUrl?: string | null } = {}): string {
  // الأرقام في كتلة واحدة باتجاه LTR — وإلا عكس اتجاه RTL ترتيبها حول الفاصل
  const phones = [profile.phone, profile.phone2].filter(Boolean).map((p) => escapeHtml(p));
  const parts = [
    profile.address && escapeHtml(profile.address),
    phones.length && `هاتف: <span dir="ltr" style="unicode-bidi:isolate;">${phones.join(" / ")}</span>`,
    profile.email && `<span dir="ltr">${escapeHtml(profile.email)}</span>`,
    profile.crNumber && `س.ت: ${escapeHtml(profile.crNumber)}`,
  ].filter(Boolean);

  return `
    <div style="font-family:'Tajawal',sans-serif; direction:rtl; padding:0 36px 22px; background:#fff;">
      ${opts.stampUrl ? `<div style="text-align:left; padding-bottom:8px;"><img src="${escapeHtml(opts.stampUrl)}" alt="ختم المكتب" width="100" style="width:100px; opacity:0.92;" /></div>` : ""}
      <div style="height:1px; background:${BRAND_DARK};"></div>
      <div style="height:3px; background:${BRAND_GOLD}; margin-top:2px;"></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="text-align:center; font-size:8.5pt; color:#555; padding-top:9px; line-height:1.7;">
            ${parts.length ? parts.join(`<span style="color:${BRAND_GOLD}; padding:0 8px;">|</span>`) : escapeHtml(profile.name || "")}
          </td>
        </tr>
      </table>
    </div>
  `;
}

/** نسخة متوافقة مع Word (جداول فقط، بلا Flexbox) — لتصدير .doc حصراً */
export function renderLetterheadHeaderWordSafe(profile: OfficeProfile, opts: LetterheadHeaderOptions = {}): string {
  const logoCell = profile.logoUrl
    ? `<img src="${profile.logoUrl}" alt="شعار المكتب" width="54" height="54" style="object-fit:contain;" />`
    : "";
  const contact = contactLine(profile);

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; background:${BRAND_DARK}; color:#fff; font-family:'Tajawal',sans-serif;">
      <tr>
        <td style="padding:16px 20px 16px 0; width:70px;">${logoCell}</td>
        <td style="padding:16px 0; text-align:right;">
          <div style="font-size:16pt; font-weight:bold;">${profile.name || "مكتب المحاماة"}</div>
          ${contact ? `<div style="font-size:10pt; color:${BRAND_GOLD};">${contact}</div>` : ""}
        </td>
        <td style="padding:16px 20px; text-align:left; font-size:9pt; color:#e5e5e5; white-space:nowrap;">
          ${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
        </td>
      </tr>
    </table>
    <div style="height:4px; background:${BRAND_GOLD};"></div>
    ${opts.documentLabel ? `<h1 style="text-align:center; color:${BRAND_DARK}; font-size:16pt; margin:20px 0 4px;">${opts.documentLabel}</h1>` : ""}
  `;
}

/** نسخة متوافقة مع Word للتذييل */
export function renderLetterheadFooterWordSafe(profile: OfficeProfile, opts: LetterheadFooterOptions = {}): string {
  const parts = [profile.name, profile.address, profile.phone].filter(Boolean);

  return `
    <div style="margin-top:40px; font-family:'Tajawal',sans-serif;">
      ${opts.stampUrl ? `<div><img src="${opts.stampUrl}" alt="ختم المكتب" width="100" style="opacity:0.92;" /></div>` : ""}
      <hr style="border:none; border-top:2px solid ${BRAND_GOLD}; opacity:0.5; margin:16px 0;" />
      <table width="100%" style="font-size:8pt; color:#888;">
        <tr>
          <td style="text-align:right;">${parts.join(" — ")}</td>
          <td style="text-align:left;">صادر إلكترونياً عبر LawyerOS</td>
        </tr>
      </table>
    </div>
  `;
}
