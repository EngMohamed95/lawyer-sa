import React, { useState, useRef, useEffect } from "react";
import { 
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, 
  AlignCenter, AlignRight, Type, Eraser, Table, Palette, 
  Grid, Settings2, FolderPlus, ArrowUpDown, Sparkles
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const FONTS = [
  { name: "تجوال (Tajawal)", value: "'Tajawal', sans-serif" },
  { name: "أميري (Amiri)", value: "'Amiri', serif" },
  { name: "القاهرة (Cairo)", value: "'Cairo', sans-serif" },
  { name: "قياسي (Arial)", value: "Arial, sans-serif" },
  { name: "مونو (Courier New)", value: "'Courier New', monospace" }
];

const COLORS = [
  { name: "أسود", value: "#000000" },
  { name: "كحلي", value: "#0A192F" },
  { name: "ذهبي", value: "#D4AF37" },
  { name: "أحمر", value: "#E53E3E" },
  { name: "أزرق", value: "#3182CE" },
  { name: "أخضر", value: "#38A169" },
  { name: "رمادي", value: "#718096" }
];

const HIGHLIGHT_COLORS = [
  { name: "بدون تظليل", value: "transparent" },
  { name: "أصفر", value: "#FFFF00" },
  { name: "أخضر", value: "#00FF00" },
  { name: "أزرق فاتح", value: "#00FFFF" },
  { name: "وردي", value: "#FF00FF" }
];

const SPACING_OPTIONS = [
  { name: "تباعد ١.١٥", value: "1.15" },
  { name: "تباعد ١.٥", value: "1.5" },
  { name: "تباعد ٢.٠", value: "2.0" }
];

const BORDER_STYLES = [
  { name: "بدون إطار", value: "none" },
  { name: "إطار بسيط", value: "solid" },
  { name: "إطار مزدوج", value: "double" },
  { name: "إطار ذهبي مزدوج", value: "gold" }
];

const getBorderInlineStyle = (style: string) => {
  switch (style) {
    case 'solid': return 'border: 4px solid #0A192F; padding: 25px; min-height: 400px; direction: rtl; text-align: justify;';
    case 'double': return 'border: 6px double #0A192F; padding: 25px; min-height: 400px; direction: rtl; text-align: justify;';
    case 'gold': return 'border: 6px double #D4AF37; padding: 25px; min-height: 400px; direction: rtl; text-align: justify;';
    default: return '';
  }
};

const getBorderClassName = (style: string) => {
  switch (style) {
    case 'solid': return 'border-4 border-[#0A192F] p-8 m-2 shadow-inner';
    case 'double': return 'border-8 border-double border-[#0A192F] p-8 m-2 shadow-inner';
    case 'gold': return 'border-8 border-double border-[#D4AF37] p-8 m-2 shadow-inner';
    default: return 'p-8';
  }
};

const extractContent = (html: string) => {
  if (!html) return "";
  if (html.includes('data-border=')) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const firstChild = div.firstElementChild;
    if (firstChild && firstChild.getAttribute('data-border')) {
      return firstChild.innerHTML;
    }
  }
  return html;
};

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [borderStyle, setBorderStyle] = useState<'none' | 'solid' | 'double' | 'gold'>('none');
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  // Set initial content and border state from parent HTML
  useEffect(() => {
    if (editorRef.current) {
      const cleanHtml = extractContent(value);
      if (editorRef.current.innerHTML !== cleanHtml) {
        editorRef.current.innerHTML = cleanHtml;
      }
    }
    const match = value?.match(/data-border="([^"]+)"/);
    if (match) {
      setBorderStyle(match[1] as any);
    }
  }, []);

  const execCommand = (command: string, value: string = "") => {
    document.execCommand(command, false, value);
    handleInput();
  };

  const handleInput = () => {
    if (editorRef.current) {
      let innerHtml = editorRef.current.innerHTML;
      if (borderStyle !== 'none') {
        const borderCss = getBorderInlineStyle(borderStyle);
        innerHtml = `<div data-border="${borderStyle}" style="${borderCss}">${innerHtml}</div>`;
      }
      onChange(innerHtml);
    }
  };

  const updateBorder = (newStyle: 'none' | 'solid' | 'double' | 'gold') => {
    setBorderStyle(newStyle);
    if (editorRef.current) {
      let innerHtml = editorRef.current.innerHTML;
      // Strip old wrapper if there was one (already stripped in editorRef.current.innerHTML)
      if (newStyle !== 'none') {
        const borderCss = getBorderInlineStyle(newStyle);
        innerHtml = `<div data-border="${newStyle}" style="${borderCss}">${innerHtml}</div>`;
      }
      onChange(innerHtml);
    }
  };

  const insertTable = (e: React.FormEvent) => {
    e.preventDefault();
    let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #ddd; direction: rtl;">`;
    tableHtml += `<thead><tr style="background-color: #f8f9fa;">`;
    for (let j = 0; j < tableCols; j++) {
      tableHtml += `<th style="border: 1px solid #ddd; padding: 10px; font-weight: bold; text-align: right; background-color: #f1f3f5;">رأس ${j + 1}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;
    for (let i = 0; i < tableRows - 1; i++) {
      tableHtml += `<tr>`;
      for (let j = 0; j < tableCols; j++) {
        tableHtml += `<td style="border: 1px solid #ddd; padding: 10px; text-align: right; min-height: 24px;">&nbsp;</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p>&nbsp;</p>`;
    
    if (editorRef.current) {
      editorRef.current.focus();
    }
    execCommand("insertHTML", tableHtml);
    setShowTableModal(false);
  };

  const handleLineHeightChange = (lineHeight: string) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const parent = range.commonAncestorContainer.parentElement;
      if (parent && parent.closest('[contenteditable]')) {
        const block = parent.closest('p') || parent.closest('div') || parent;
        block.style.lineHeight = lineHeight;
        handleInput();
      }
    }
  };

  return (
    <div className="border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#0A192F]/10 transition-all font-sans" dir="rtl">
      
      {/* Table Insertion Modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-5 border-b bg-[#0A192F] text-white flex justify-between items-center">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Table size={18} />
                إدراج جدول جديد
              </h2>
              <button onClick={() => setShowTableModal(false)} className="text-white hover:opacity-70">✕</button>
            </div>
            <form onSubmit={insertTable} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">عدد الصفوف</label>
                  <Input 
                    type="number" 
                    min={1} 
                    max={20} 
                    value={tableRows} 
                    onChange={e => setTableRows(parseInt(e.target.value) || 3)} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">عدد الأعمدة</label>
                  <Input 
                    type="number" 
                    min={1} 
                    max={10} 
                    value={tableCols} 
                    onChange={e => setTableCols(parseInt(e.target.value) || 3)} 
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1 py-5 rounded-xl text-xs" onClick={() => setShowTableModal(false)}>إلغاء</Button>
                <Button type="submit" className="flex-1 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-white py-5 rounded-xl font-bold text-xs">إدراج الجدول</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Word-like Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 p-3 bg-gray-50/80 border-b border-gray-200/60 print:hidden text-gray-600 select-none">
        
        {/* Font Family Select */}
        <div className="flex items-center gap-1 bg-white border rounded-xl px-2 py-1 shadow-sm shrink-0">
          <Type size={14} className="text-gray-400" />
          <select 
            onChange={(e) => execCommand("fontName", e.target.value)}
            className="text-xs bg-transparent border-none outline-none font-bold text-[#0A192F] py-0.5 cursor-pointer max-w-[120px]"
            title="نوع الخط"
            defaultValue=""
          >
            <option value="" disabled>نوع الخط</option>
            {FONTS.map(f => (
              <option key={f.name} value={f.value}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Font Size Select */}
        <div className="flex items-center bg-white border rounded-xl px-2 py-1 shadow-sm shrink-0">
          <select 
            onChange={(e) => execCommand("fontSize", e.target.value)}
            className="text-xs bg-transparent border-none outline-none font-bold text-[#0A192F] py-0.5 cursor-pointer"
            title="حجم الخط"
            defaultValue="3"
          >
            <option value="1">صغير جداً</option>
            <option value="2">صغير</option>
            <option value="3">عادي</option>
            <option value="4">متوسط</option>
            <option value="5">كبير</option>
            <option value="6">كبير جداً</option>
            <option value="7">ضخم</option>
          </select>
        </div>

        {/* Line Spacing */}
        <div className="flex items-center bg-white border rounded-xl px-2 py-1 shadow-sm shrink-0">
          <ArrowUpDown size={14} className="text-gray-400 ml-1" />
          <select 
            onChange={(e) => handleLineHeightChange(e.target.value)}
            className="text-xs bg-transparent border-none outline-none font-bold text-[#0A192F] py-0.5 cursor-pointer"
            title="تباعد الأسطر"
            defaultValue="1.5"
          >
            {SPACING_OPTIONS.map(s => (
              <option key={s.name} value={s.value}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Page Borders */}
        <div className="flex items-center bg-white border rounded-xl px-2 py-1 shadow-sm shrink-0">
          <Settings2 size={14} className="text-gray-400 ml-1" />
          <select 
            value={borderStyle}
            onChange={(e) => updateBorder(e.target.value as any)}
            className="text-xs bg-transparent border-none outline-none font-bold text-[#0A192F] py-0.5 cursor-pointer"
            title="إطار الصفحة"
          >
            {BORDER_STYLES.map(b => (
              <option key={b.name} value={b.value}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-6 bg-gray-200/80 mx-1 shrink-0" />

        {/* Font Styling Buttons */}
        <div className="flex bg-white border rounded-xl p-0.5 shadow-sm shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700 font-bold"
            onClick={() => execCommand("bold")}
            title="عريض"
          >
            <Bold size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("italic")}
            title="مائل"
          >
            <Italic size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("underline")}
            title="تحته خط"
          >
            <Underline size={15} />
          </Button>
        </div>

        {/* Color Pickers Dropdowns */}
        <div className="flex bg-white border rounded-xl p-0.5 shadow-sm shrink-0">
          
          {/* Text Color Selection */}
          <div className="relative group/color flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700 flex items-center justify-center"
              title="لون الخط"
            >
              <Palette size={15} />
            </Button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover/color:grid grid-cols-4 gap-1 p-2 bg-white border rounded-xl shadow-lg z-50 min-w-[100px]">
              {COLORS.map(c => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => execCommand("foreColor", c.value)}
                  className="w-5 h-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Highlight Color Selection */}
          <div className="relative group/highlight flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700 flex items-center justify-center"
              title="تظليل النص"
            >
              <Sparkles size={15} className="text-amber-500 fill-amber-500/20" />
            </Button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover/highlight:grid grid-cols-3 gap-1 p-2 bg-white border rounded-xl shadow-lg z-50 min-w-[110px]">
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => execCommand("backColor", c.value)}
                  className={`w-6 h-6 rounded border border-gray-200 text-[9px] flex items-center justify-center ${c.value === 'transparent' ? 'bg-gray-100' : ''}`}
                  style={{ backgroundColor: c.value === 'transparent' ? undefined : c.value }}
                  title={c.name}
                >
                  {c.value === 'transparent' ? '✕' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alignment Options */}
        <div className="flex bg-white border rounded-xl p-0.5 shadow-sm shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("justifyRight")}
            title="محاذاة لليمين"
          >
            <AlignRight size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("justifyCenter")}
            title="توسيط"
          >
            <AlignCenter size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("justifyLeft")}
            title="محاذاة لليسار"
          >
            <AlignLeft size={15} />
          </Button>
        </div>

        {/* Lists */}
        <div className="flex bg-white border rounded-xl p-0.5 shadow-sm shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("insertUnorderedList")}
            title="قائمة نقطية"
          >
            <List size={15} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-700"
            onClick={() => execCommand("insertOrderedList")}
            title="قائمة رقمية"
          >
            <ListOrdered size={15} />
          </Button>
        </div>

        {/* Extra Actions */}
        <div className="flex bg-white border rounded-xl p-0.5 shadow-sm shrink-0">
          {/* Table Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-[#0A192F]"
            onClick={() => setShowTableModal(true)}
            title="إدراج جدول"
          >
            <Table size={15} />
          </Button>
          
          {/* Erase Styling */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-100 text-red-500"
            onClick={() => execCommand("removeFormat")}
            title="مسح التنسيق"
          >
            <Eraser size={15} />
          </Button>
        </div>

      </div>

      {/* Page Canvas Container with Borders Applied */}
      <div className="p-4 bg-gray-50/30 overflow-x-auto min-h-[550px]">
        {/* Editable Sheet Workspace */}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          className={`min-h-[500px] outline-none focus:outline-none bg-white text-sm leading-relaxed text-gray-800 dir-rtl prose prose-slate max-w-none transition-all duration-300 rounded-2xl shadow-sm ${getBorderClassName(borderStyle)}`}
          placeholder={placeholder}
          style={{ direction: 'rtl', textAlign: 'right', fontFamily: "'Tajawal', sans-serif" }}
        />
      </div>

    </div>
  );
}
