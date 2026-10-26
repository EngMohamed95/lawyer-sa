/**
 * ورقة A4 حيّة لترويسة المذكرات وتذييلها — بنفس دوال الطباعة في lib/letterhead.
 * في وضع التحرير يُكتب في الورقة مباشرة: كل نص يحمل data-field، والكتابة فيه
 * تُحدّث بيانات المكتب فوراً (والحقول المقابلة في النموذج).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficeProfile } from "../../lib/officeSettings";
import { renderMemoLetterheadFooter, renderMemoLetterheadHeader, type EditableField } from "../../lib/letterhead";

/** 210 × 297 مم عند 96 نقطة/بوصة */
const A4_W = 794;
const A4_H = 1123;

const PAPER_CSS = `
  .lh-paper [data-field] { outline: none; border-radius: 3px; padding: 0 2px; transition: background .15s, box-shadow .15s; cursor: text; }
  .lh-paper [data-field]:hover { background: rgba(39, 60, 117, .08); }
  .lh-paper [data-field]:focus { background: rgba(39, 60, 117, .1); box-shadow: 0 0 0 1px #273c75; }
  .lh-paper [data-field]:empty::before { content: attr(data-placeholder); color: #b3bac6; font-weight: normal; }
  .lh-paper [data-field="logo"] { cursor: pointer; padding: 0; }
`;

export default function LetterheadPaper({ profile, editable, onChange, onLogoClick }: {
  profile: OfficeProfile;
  editable: boolean;
  onChange: (key: EditableField, value: string) => void;
  onLogoClick?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  /** التغيير جاء من الكتابة في الورقة — لا نعيد بناءها فيبقى المؤشر مكانه */
  const typingRef = useRef(false);

  const headerHtml = useMemo(() => renderMemoLetterheadHeader(profile, { editable }), [profile, editable]);
  const footerHtml = useMemo(() => renderMemoLetterheadFooter(profile, { editable }), [profile, editable]);

  // الورقة بمقاسها الحقيقي مصغّرة لتملأ العرض المتاح
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / A4_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!headerRef.current || !footerRef.current) return;
    if (typingRef.current) {
      typingRef.current = false;
      // الحقل نفسه قد يظهر في الترويسة والتذييل معاً (الهاتف مثلاً) — نحدّث نسخته الأخرى فقط
      for (const root of [headerRef.current, footerRef.current]) {
        root.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
          const key = el.dataset.field as EditableField;
          if (el !== document.activeElement && key in profile && el.textContent !== profile[key]) {
            el.textContent = profile[key] as string;
          }
        });
      }
      return;
    }
    headerRef.current.innerHTML = headerHtml;
    footerRef.current.innerHTML = footerHtml;
  }, [headerHtml, footerHtml, profile]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const key = el.dataset?.field as EditableField | "logo" | undefined;
    if (!key || key === "logo") return;
    const value = el.textContent ?? "";
    if (value === profile[key]) return;
    typingRef.current = true;
    onChange(key, value);
  };

  return (
    <div ref={wrapRef} className="w-full">
      <style>{PAPER_CSS}</style>
      <div className="relative mx-auto" style={{ width: A4_W * scale, height: A4_H * scale }}>
        <div
          className="lh-paper los-paper absolute left-0 top-0 flex flex-col overflow-hidden bg-surface shadow-[0_4px_24px_rgba(25,42,86,0.15)] ring-1 ring-slate-200"
          style={{ width: A4_W, height: A4_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          dir="rtl"
          onInput={editable ? handleInput : undefined}
          onKeyDown={(e) => {
            // كل حقل سطر واحد — Enter ينهي التعديل
            if (e.key === "Enter" && (e.target as HTMLElement).dataset?.field) { e.preventDefault(); (e.target as HTMLElement).blur(); }
          }}
          onClick={(e) => {
            if (editable && (e.target as HTMLElement).closest('[data-field="logo"]')) onLogoClick?.();
          }}
        >
          <div ref={headerRef} />
          {/* منطقة نص المذكرة — بهوامش الطباعة نفسها */}
          <div className="flex-1 px-[50px] py-[18px]" aria-hidden>
            <div className="mx-auto mt-6 h-4 w-1/3 rounded bg-slate-100" />
            <div className="mt-10 space-y-4">
              {Array.from({ length: 14 }, (_, i) => (
                <div key={i} className="h-2.5 rounded bg-slate-100" style={{ width: i % 5 === 4 ? "60%" : "100%" }} />
              ))}
            </div>
          </div>
          <div ref={footerRef} />
        </div>
      </div>
    </div>
  );
}
