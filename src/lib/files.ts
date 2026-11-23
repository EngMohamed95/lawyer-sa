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

/* ─── ملفات المكتب المشفّرة (مرفقات القضايا وغيرها — public/api/_lib/routes_officefiles.php) ─── */

export interface ShareLink {
  url: string;
  expiresAt: string;
  days: number;
}

/** رابط مؤقت لملف من ملفات المكتب (للعميل) — يفتح بدون دخول حتى ينتهي أو يُلغى */
export function createShareLink(fileUrl: string, days = 7, note?: string): Promise<ShareLink> {
  return apiRequest<ShareLink>("POST", "files/share", { url: fileUrl, days, note });
}

export interface ShareInfo {
  id: string;
  fileName: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  uses: number;
  lastUsedAt: string | null;
  active: boolean;
  revoked: boolean;
}

export async function listShareLinks(): Promise<ShareInfo[]> {
  return (await apiRequest<{ shares: ShareInfo[] }>("GET", "files/shares")).shares;
}

export async function revokeShareLink(id: string): Promise<void> {
  await apiRequest("POST", "files/shares/revoke", { id });
}

export interface FileAccessEntry {
  at: string;
  fileName: string;
  viaShare: boolean;
  user: string | null;
  ip: string | null;
  device: string | null;
}

/** سجل الاطلاع على ملفات المكتب — لمالك المكتب */
export async function fileAccessLog(): Promise<FileAccessEntry[]> {
  return (await apiRequest<{ entries: FileAccessEntry[] }>("GET", "files/access-log")).entries;
}

export interface LegacyMigrationResult {
  scanned: number;
  docsUpdated: number;
  filesMigrated: number;
  missing: number;
  unassigned: number;
}

/**
 * مدير المنصة: ينقل ملفات uploads/ القديمة إلى التخزين المشفّر على دفعات، ثم يتأكد من
 * كل نسخة ويحذف الأصل ويقفل المجلد.
 */
export async function migrateLegacyUploads(onProgress?: (total: LegacyMigrationResult) => void) {
  const total: LegacyMigrationResult = { scanned: 0, docsUpdated: 0, filesMigrated: 0, missing: 0, unassigned: 0 };
  /** ملفات يذكرها أكثر من مكتب — ما انتقلت لأحد (تظل في المجلد المقفل للمراجعة) */
  const conflicts = new Map<string, string[]>();
  let cursor: unknown = null;
  for (let i = 0; i < 10_000; i++) {
    const r = await apiRequest<LegacyMigrationResult & { done: boolean; cursor: unknown; conflicts?: { file: string; offices: string[] }[] }>(
      "POST", "files/migrate-legacy", cursor ? { cursor } : {});
    (Object.keys(total) as (keyof LegacyMigrationResult)[]).forEach((k) => { total[k] += r[k] || 0; });
    (r.conflicts || []).forEach((c) => conflicts.set(c.file, c.offices));
    onProgress?.({ ...total });
    cursor = r.cursor;
    if (r.done) break;
  }
  const finalize = await apiRequest<{ deleted: number; keptUnverified: number; unreferencedLocked: number }>(
    "POST", "files/migrate-legacy/finalize", {});
  return { ...total, ...finalize, conflicts: [...conflicts].map(([file, offices]) => ({ file, offices })) };
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
