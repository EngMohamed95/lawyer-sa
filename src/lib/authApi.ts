/**
 * عميل API الدخول في MySQL (public/api).
 *
 * الجلسة كوكي HttpOnly يضبطه السيرفر؛ الواجهة ما تلمس أي توكن دخول.
 */

/** المستخدم الداخل كما يحتاجه باقي التطبيق (بديل User من firebase/auth) */
export interface SessionUser {
  uid: string;
  email: string | null;
}

const API_BASE = "/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  role: string;
  lawyerId: string | null;
  status: string;
}

export async function apiRequest<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("تعذر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.", 0, "NETWORK");
  } finally {
    window.clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.error === "string" ? data.error : "حدث خطأ غير متوقع. أعد المحاولة.",
      res.status,
      typeof data?.code === "string" ? data.code : "ERROR",
      typeof data?.field === "string" ? data.field : undefined,
    );
  }
  return data as T;
}

export interface LoginResult {
  user: AccountUser;
  /** false = تسجيل ذاتي ما اكتمل (حساب بلا ملف شخصي) */
  hasProfile: boolean;
  sessionUser: SessionUser;
}

export const toSessionUser = (u: AccountUser): SessionUser => ({ uid: u.id, email: u.email });

export async function login(email: string, password: string, rememberMe: boolean): Promise<LoginResult> {
  const data = await apiRequest<{ user: AccountUser; hasProfile: boolean }>(
    "POST", "auth/login", { email: email.trim(), password, rememberMe },
  );
  return { user: data.user, hasProfile: data.hasProfile, sessionUser: toSessionUser(data.user) };
}

export async function logout(): Promise<void> {
  await apiRequest("POST", "auth/logout", {}).catch(() => { /* الخروج المحلي يكمل حتى لو السيرفر ما رد */ });
}

export async function me(): Promise<AccountUser | null> {
  try {
    return (await apiRequest<{ user: AccountUser }>("GET", "auth/me")).user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
  return apiRequest("POST", "auth/change-password", { currentPassword, newPassword });
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiRequest("POST", "auth/password-reset/request", { email: email.trim() });
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<unknown> {
  return apiRequest("POST", "auth/password-reset/confirm", { token, newPassword });
}

export interface NewAccount {
  email: string;
  password: string;
  name?: string;
  role: string;
  /** لمدير المنصة فقط عند إضافة عضو لمكتب محدد — مالك المكتب يُتجاهل منه */
  lawyerId?: string;
}

/**
 * ينشئ بيانات الدخول ويرجع المعرّف. بعدها المستدعي يكتب مستند users/{id} في Firestore
 * كما كان؛ لو فشلت الكتابة يستدعي rollbackAccount عشان البريد ما يظل محجوز.
 */
export async function createAccount(account: NewAccount): Promise<string> {
  const { id } = await apiRequest<{ id: string }>("POST", "accounts", { ...account, email: account.email.trim() });
  return id;
}

export async function rollbackAccount(id: string): Promise<void> {
  await apiRequest("DELETE", `accounts/${encodeURIComponent(id)}`).catch((err) => {
    console.warn("تعذر التراجع عن إنشاء الحساب:", err);
  });
}

/**
 * ينشئ الحساب ثم يكتب ملفه الشخصي بـ writeProfile(id). لو فشلت الكتابة نتراجع
 * عن الحساب ونرمي الخطأ الأصلي — فما يظل بريد محجوز لحساب ناقص.
 */
export async function createAccountWithProfile(
  account: NewAccount,
  writeProfile: (id: string) => Promise<unknown>,
): Promise<string> {
  const id = await createAccount(account);
  try {
    await writeProfile(id);
  } catch (err) {
    await rollbackAccount(id);
    throw err;
  }
  return id;
}

/** رسالة عربية لأي خطأ من هذا العميل أو غيره */
export function errorMessage(err: unknown, fallback = "حدث خطأ غير متوقع. أعد المحاولة."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
