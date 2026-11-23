/**
 * الملفات الخاصة (المكتبة القانونية ومرفقات الدعم) — بديل Firebase Storage.
 * الملفات على السيرفر خارج مجلد الموقع، والرفع والتنزيل يمرون من /api/v1/files بعد التحقق
 * من الصلاحية (public/api/_lib/routes_files.php).
 */

import { apiRequest, ApiError } from "./authApi";

export interface StoredFile {
  path: string;
  name: string;
  size: number;
  /** نوع الملف كما فحصه السيرفر من محتواه */
  contentType: string;
}

export type FileKind = "legal" | "support";

/** رفع ملف مع نسبة التقدم (XHR لأن fetch ما يعطي تقدم الرفع) */
export function uploadPrivateFile(
  kind: FileKind,
  file: File,
  opts: { ticketId?: string; onProgress?: (percent: number) => void } = {},
): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("kind", kind);
    if (opts.ticketId) form.append("ticketId", opts.ticketId);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/files/upload");
    // ترويسة مخصصة = حماية CSRF (نموذج من موقع ثاني ما يقدر يضيفها)
    xhr.setRequestHeader("X-Mz-Upload", "1");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* رد غير JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as StoredFile);
      else reject(new ApiError(data?.error || "تعذّر رفع الملف.", xhr.status, data?.code || "ERROR"));
    };
    xhr.onerror = () => reject(new ApiError("تعذر الاتصال بالخادم أثناء رفع الملف.", 0, "NETWORK"));
    xhr.send(form);
  });
}

export async function downloadPrivateFile(path: string): Promise<Blob> {
  const res = await fetch(`/api/v1/files/download?path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data?.error || "تعذّر تنزيل الملف.", res.status, data?.code || "ERROR");
  }
  return res.blob();
}

export async function deletePrivateFile(path: string): Promise<void> {
  await apiRequest("POST", "files/delete", { path });
}

/** ينزّل Blob كملف باسمه */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
