/**
 * بديل مباشر لـ <select> يضيف خانة بحث داخل القائمة نفسها.
 *
 * يبقى <select> الأصلي موجوداً ومخفياً تحت الواجهة: الخيارات تُقرأ منه،
 * والاختيار يُكتب فيه ويُطلق حدث change حقيقياً — فكل onChange و value
 * و required و name في النظام تعمل كما كانت بلا أي تعديل.
 */

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Opt {
  value: string;
  label: string;
  group?: string;
  disabled: boolean;
  index: number;
}

/** توحيد الحروف العربية حتى يجد «احمد» «أحمد» و«قضيه» «قضية» */
const normalize = (s: string) =>
  s.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();

function readOptions(el: HTMLSelectElement): Opt[] {
  return Array.from(el.options).map((o, index) => {
    const group = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement : null;
    return { value: o.value, label: o.text, group: group?.label, disabled: o.disabled || !!group?.disabled, index };
  });
}

const setNativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;

export const SearchableSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SearchableSelect({ className, style, children, disabled, ...rest }, ref) {
    const selectRef = React.useRef<HTMLSelectElement | null>(null);
    const rootRef = React.useRef<HTMLSpanElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLSpanElement>(null);
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [options, setOptions] = React.useState<Opt[]>([]);
    const [active, setActive] = React.useState(0);
    const [label, setLabel] = React.useState("");
    const [dropUp, setDropUp] = React.useState(false);

    const setRefs = (el: HTMLSelectElement | null) => {
      selectRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    // النص الظاهر يُقرأ من الـ select بعد كل رسم — يتبع value والخيارات المحمّلة لاحقاً
    React.useLayoutEffect(() => {
      const el = selectRef.current;
      if (!el) return;
      const text = el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : "";
      setLabel((prev) => (prev === text ? prev : text));
    });

    const filtered = React.useMemo(() => {
      const q = normalize(query);
      return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
    }, [options, query]);

    const openList = () => {
      const el = selectRef.current;
      if (disabled || !el) return;
      const all = readOptions(el);
      setOptions(all);
      setQuery("");
      setActive(Math.max(0, all.findIndex((o) => o.index === el.selectedIndex)));
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) {
        const below = window.innerHeight - rect.bottom;
        setDropUp(below < 300 && rect.top > below);
      }
      setOpen(true);
    };

    const close = (refocus = true) => {
      setOpen(false);
      if (refocus) rootRef.current?.focus();
    };

    const choose = (opt: Opt | undefined) => {
      const el = selectRef.current;
      if (!opt || opt.disabled || !el) return;
      if (el.value !== opt.value || el.selectedIndex !== opt.index) {
        setNativeValue.call(el, opt.value);
        el.selectedIndex = opt.index;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setLabel(el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : "");
      close();
    };

    React.useEffect(() => {
      if (!open) return;
      inputRef.current?.focus();
      const onDown = (e: MouseEvent) => {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    React.useEffect(() => {
      if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    const onTriggerKey = (e: React.KeyboardEvent) => {
      if (open || disabled) return;
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
    };

    const onSearchKey = (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); choose(filtered[active]); }
      // لا نترك Escape يصل للنافذة المنبثقة فيغلقها مع القائمة
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "Tab") close(false);
    };

    const selectedIndex = selectRef.current?.selectedIndex ?? -1;

    return (
      <span
        ref={rootRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled || undefined}
        aria-label={rest["aria-label"]}
        tabIndex={disabled ? -1 : 0}
        style={style}
        className={cn(
          "block",
          className || "inline-block rounded-md border border-gray-300 bg-white px-2 py-1 text-sm",
          "relative cursor-pointer select-none",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={(e) => {
          // حين تكون القائمة داخل <label> يعيد المتصفح توجيه النقرة للـ select المخفي — نتجاهلها
          if (e.target === selectRef.current) return;
          // ونمنع الـ label من تحويل النقرة أصلاً حتى لا يسحب التركيز من خانة البحث
          e.preventDefault();
          if (open) close(); else openList();
        }}
        onKeyDown={onTriggerKey}
      >
        <select ref={setRefs} {...rest} disabled={disabled} tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0">
          {children}
        </select>

        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate">{label || " "}</span>
          <ChevronDown size={16} className={cn("shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
        </span>

        {open && (
          <span
            className={cn(
              "absolute start-0 z-[100] block w-max min-w-full max-w-[min(90vw,28rem)] cursor-default rounded-xl border border-gray-200 bg-white text-sm font-normal text-gray-800 shadow-xl",
              dropUp ? "bottom-full mb-1" : "top-full mt-1",
            )}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          >
            <span className="relative block border-b border-gray-100 p-2">
              <Search size={14} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKey}
                placeholder="بحث..."
                aria-label="بحث في القائمة"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pe-2 ps-8 text-sm text-gray-800 focus:border-[#192a56] focus:outline-none"
              />
            </span>
            <span ref={listRef} role="listbox" className="block max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <span className="block px-3 py-2 text-xs text-gray-400">لا توجد نتائج</span>
              ) : (
                filtered.map((o, i) => (
                  <React.Fragment key={o.index}>
                    {o.group && o.group !== filtered[i - 1]?.group && (
                      <span className="block px-3 pb-1 pt-2 text-[11px] font-bold text-gray-400">{o.group}</span>
                    )}
                    <span
                      role="option"
                      data-i={i}
                      aria-selected={o.index === selectedIndex}
                      aria-disabled={o.disabled || undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2",
                        o.disabled ? "cursor-not-allowed text-gray-300" : "cursor-pointer",
                        i === active && !o.disabled && "bg-[#192a56]/10",
                        o.index === selectedIndex && "font-bold text-[#192a56]",
                      )}
                    >
                      <span className="whitespace-normal break-words">{o.label || " "}</span>
                      {o.index === selectedIndex && <Check size={14} className="shrink-0" />}
                    </span>
                  </React.Fragment>
                ))
              )}
            </span>
          </span>
        )}
      </span>
    );
  },
);
