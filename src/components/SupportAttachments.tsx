import { useRef, useState } from "react";
import { Download, Loader2, Paperclip, X } from "lucide-react";
import {
  downloadSupportAttachment,
  supportError,
  validateSupportFiles,
  type SupportAttachment,
} from "../lib/support";

export function SupportFilePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2 text-xs">
      <input
        ref={input}
        aria-label="إرفاق ملفات الدعم"
        className="sr-only"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf"
        disabled={disabled}
        onChange={(event) => {
          try {
            const next = [...files, ...Array.from(event.target.files || [])];
            validateSupportFiles(next);
            onChange(next);
            setError("");
          } catch (err) {
            setError(supportError(err));
          }
          event.target.value = "";
        }}
      />
      <button
        className="inline-flex items-center gap-2 rounded-lg border border-[#133B2E]/20 px-3 py-2 text-[#133B2E] hover:border-[#D4AF37] disabled:opacity-50"
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Paperclip size={16} /> إضافة ملفات
      </button>
      <p className="text-gray-400">
        PNG، JPG، WEBP، PDF · حتى 4 ملفات، 5 ميجابايت لكل ملف.
      </p>
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="flex items-center justify-between gap-2 rounded-lg bg-[#D4AF37]/10 px-3 py-2 text-[#133B2E]"
        >
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`إزالة ${file.name}`}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function SupportAttachmentList({
  files = [],
}: {
  files?: SupportAttachment[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  return files.length ? (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          disabled={!!busy}
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[#133B2E]/20 bg-white px-3 py-2 text-xs text-[#133B2E] hover:border-[#D4AF37]"
          onClick={async () => {
            setBusy(file.path);
            setError("");
            try {
              await downloadSupportAttachment(file);
            } catch (err) {
              setError(supportError(err));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === file.path ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          <span className="truncate">{file.name}</span>
          <span className="shrink-0 text-gray-400">
            {(file.size / 1024).toFixed(0)} KB
          </span>
        </button>
      ))}
      {error && (
        <p role="alert" className="w-full text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  ) : null;
}
