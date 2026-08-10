/**
 * تصدير محتوى HTML كملف Word قابل للتعديل — بلا مكتبة OOXML.
 * الحيلة: ملف HTML/XML بترويسة Microsoft Office، يفتحه Word ويعامله
 * كمستند عادي قابل للتحرير الكامل. نفس الأسلوب المستخدم في نماذج
 * ومذكرات المكتبة القانونية (كان محلياً داخل Documents.tsx).
 */

const BOM = "﻿";

export function downloadWordDoc(htmlBodyContent: string, customDocTitle: string): void {
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
        h2 { text-align: center; color: #133B2E; font-size: 18pt; margin-bottom: 25px; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
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

  const blob = new Blob([BOM + content], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${customDocTitle}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}
