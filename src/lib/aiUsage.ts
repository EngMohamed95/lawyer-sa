/**
 * استهلاك المكتب من المساعد الذكي هذا الشهر — للعرض فقط.
 * الفرض الفعلي للحصة على الخادم (public/ai-proxy.php و src/server/aiQuota.ts).
 *
 * العدّاد في ai_usage/{lawyerId}_{YYYY-MM} (الشهر بتوقيت UTC، كما يكتبه الخادم).
 * الحصة: quotaOverrides.ai لمالك المكتب إن وُجدت، وإلا quotas.ai لباقته. 0 = غير محدود.
 */

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

/** يُطلق بعد كل رد ناجح من المساعد ليتحدّث العدّاد المعروض */
export const AI_USAGE_EVENT = "ai-usage-changed";

export const currentAiMonth = () => new Date().toISOString().slice(0, 7);

export interface AiUsage {
  used: number;
  /** 0 = غير محدود */
  quota: number;
}

/** null لمدير المنصة (مستثنى) أو عند تعذّر القراءة */
export async function loadMyAiUsage(): Promise<AiUsage | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const me = await getDoc(doc(db, "users", uid));
    if (!me.exists()) return null;
    const user = me.data();
    if (user.role === "SUPER_ADMIN") return null;

    const tenant: string = typeof user.lawyerId === "string" && user.lawyerId ? user.lawyerId : uid;
    const owner = tenant === uid ? user : (await getDoc(doc(db, "users", tenant))).data() ?? {};

    let quota = 0;
    const override = owner.quotaOverrides?.ai;
    if (typeof override === "number" && override >= 0) {
      quota = override;
    } else if (typeof owner.planId === "string" && owner.planId) {
      const plan = await getDoc(doc(db, "subscriptionPlans", owner.planId));
      const q = Number(plan.data()?.quotas?.ai ?? 0);
      quota = Number.isFinite(q) && q > 0 ? q : 0;
    }

    const usage = await getDoc(doc(db, "ai_usage", `${tenant}_${currentAiMonth()}`));
    return { used: Number(usage.data()?.count ?? 0) || 0, quota };
  } catch {
    return null;
  }
}
