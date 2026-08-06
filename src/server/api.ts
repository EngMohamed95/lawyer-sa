import express from "express";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { authGate, requireAuth, requireRole, requireUserAdmin } from "./middleware/auth.js";

function initializeFirestore() {
  if (admin.apps.length) {
    return admin.firestore();
  }

  try {
    const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    const serviceAccountPath = path.resolve(process.cwd(), "serviceAccountKey.json");
    const serviceAccount = envServiceAccount
      ? JSON.parse(envServiceAccount)
      : fs.existsSync(serviceAccountPath)
        ? JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))
        : null;

    if (!serviceAccount) {
      console.warn("Firebase Admin credentials were not found. Firestore API routes are disabled.");
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    return admin.firestore();
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    return null;
  }
}

const db = initializeFirestore();
const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * بوابة المصادقة — أول ما يُسجَّل، فتسبق أي حارس آخر (الثغرة V3).
 *
 * المسار العام الوحيد:
 *   /subscribe — طلب اشتراك يُقدَّم قبل وجود حساب أصلاً
 *
 * ملاحظة: /ai/generate يبقى محمياً رغم أنه لا يمسّ بيانات المكتب — فتحه
 * يعني أن أي شخص يستنزف رصيد مفتاح المكتب. نقلُ المفتاح للخادم يمنع سرقته،
 * ولا يمنع إساءة استخدامه ما لم يُصادَق على الطلب.
 *
 * ما عدا ذلك محمي بالافتراض؛ أي مسار جديد يبقى مغلقاً ما لم يُستثنَ صراحةً.
 */
router.use(authGate(["/subscribe"]));

/* ────────────────────────── تحديد المعدل (الثغرة V9) ────────────────────────── */

/**
 * عدّاد بسيط في الذاكرة لكل عنوان.
 * كافٍ لعملية واحدة على الاستضافة الحالية؛ عند التوسّع لعدة عمليات
 * يُستبدل بمخزن مشترك (Redis) — الواجهة نفسها لا تتغيّر.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMinute: number) {
  const windowMs = 60_000;
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip ?? "unknown"}|${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // تنظيف كسول يمنع تضخّم الخريطة بلا حدود
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
      }
      return next();
    }

    entry.count++;
    if (entry.count > maxPerMinute) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "تجاوزت حد الطلبات المسموح. حاول بعد قليل.",
        retryAfter,
      });
    }
    return next();
  };
}

/* ────────────────────────── وسيط الذكاء الاصطناعي (الثغرة V4) ────────────────────────── */

/**
 * ينفّذ نداء النموذج بمفتاح المكتب المخزَّن على الخادم،
 * فلا يُشحن أي مفتاح داخل حزمة الواجهة.
 * مفتاح المستخدم الخاص يبقى يعمل من المتصفح ولا يمرّ من هنا.
 */
router.post("/ai/generate", rateLimit(20), async (req, res) => {
  try {
    const { provider = "GEMINI", model, contents, generationConfig, messages, temperature } = req.body ?? {};

    if (provider === "GEMINI") {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(501).json({ error: "مفتاح الذكاء الاصطناعي غير مضبوط على الخادم." });
      }
      if (!Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ error: "محتوى الطلب مفقود." });
      }

      const modelName = typeof model === "string" && model ? model : "gemini-flash-latest";
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}` +
        `:generateContent?key=${encodeURIComponent(key)}`;

      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: generationConfig ?? { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });

      const data = await upstream.json();
      // نمرّر الرد كما هو لتبقى معالجة الأخطاء في الواجهة كما كانت
      return res.status(upstream.ok ? 200 : upstream.status).json(data);
    }

    if (provider === "GROQ") {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        return res.status(501).json({ error: "مفتاح Groq غير مضبوط على الخادم." });
      }
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: temperature ?? 0.7 }),
      });
      const data = await upstream.json();
      return res.status(upstream.ok ? 200 : upstream.status).json(data);
    }

    return res.status(400).json({ error: "مزوّد غير مدعوم." });
  } catch (error: unknown) {
    console.error("AI proxy error:", error);
    return res.status(500).json({ error: "تعذّر تنفيذ طلب الذكاء الاصطناعي." });
  }
});

router.post("/extract-text", requireAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const type = mimeType || 'image/jpeg';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "قُم باستخراج جميع النصوص من هذا المستند بدقة عالية وبنفس اللغة المكتوبة به. حافظ على التنسيق والفقرات. لا تضف أي نص من عندك بخلاف المستخرج." },
            {
              inlineData: {
                data: imageBase64,
                mimeType: type,
              }
            }
          ]
        }
      ]
    });

    res.json({ text: response.text });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "Failed to extract text" });
  }
});

router.use((req, res, next) => {
  if (!db) {
    return res.status(500).json({
      error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or provide serviceAccountKey.json.",
    });
  }
  next();
});

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const casesSnap = await db.collection("cases").get();
    const clientsSnap = await db.collection("clients").get();
    const tasksSnap = await db.collection("tasks").get();
    
    const cases = casesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const totalCases = casesSnap.size;
    const openCases = cases.filter((c: any) => c.status === "OPEN").length;
    const closedCases = cases.filter((c: any) => c.status === "CLOSED").length;
    const totalClients = clientsSnap.size;
    
    const upcomingSessionsSnap = await db.collectionGroup("hearings")
      .where("hearingDate", ">=", new Date().toISOString())
      .orderBy("hearingDate", "asc")
      .limit(5)
      .get();
      
    const upcomingSessions = upcomingSessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const recentCases = cases
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((c: any) => {
        const client = clients.find((cl: any) => cl.id === c.clientId);
        return { ...c, client };
      });

    res.json({
      totalCases,
      openCases,
      closedCases,
      totalClients,
      pendingTasks: tasksSnap.docs.filter(doc => doc.data().status === "NEW").length,
      overdueTasks: tasksSnap.docs.filter(doc => doc.data().status === "OVERDUE").length,
      upcomingSessions,
      recentCases,
      recentActivity: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Clients API
router.get("/clients", requireAuth, async (req, res) => {
  try {
    const snap = await db.collection("clients").orderBy("createdAt", "desc").get();
    const clients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/clients", requireAuth, async (req, res) => {
  try {
    const data = { 
      ...req.body, 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString() 
    };
    const docRef = await db.collection("clients").add(data);
    res.json({ id: docRef.id, ...data });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client: " + (err.message || String(err)) });
  }
});

router.put("/clients/:id", requireAuth, async (req, res) => {
  try {
    const data = { ...req.body, updatedAt: new Date().toISOString() };
    await db.collection("clients").doc(req.params.id).update(data);
    res.json({ id: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ error: "Failed to update client" });
  }
});

// Cases API
router.get("/cases", requireAuth, async (req, res) => {
  try {
    const casesSnap = await db.collection("cases").orderBy("createdAt", "desc").get();
    const clientsSnap = await db.collection("clients").get();
    const clients = clientsSnap.docs.reduce((acc: any, doc) => {
      acc[doc.id] = doc.data();
      return acc;
    }, {});

    const cases = casesSnap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, client: clients[data.clientId] };
    });
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/cases/:id", requireAuth, async (req, res) => {
  try {
    const caseDoc = await db.collection("cases").doc(req.params.id).get();
    if (!caseDoc.exists) return res.status(404).json({ error: "Case not found" });
    
    const caseData = { id: caseDoc.id, ...caseDoc.data() as any };
    
    const clientDoc = await db.collection("clients").doc(caseData.clientId).get();
    caseData.client = clientDoc.exists ? clientDoc.data() : null;

    const hearingsSnap = await db.collection("cases").doc(req.params.id).collection("hearings").orderBy("hearingDate", "asc").get();
    caseData.hearings = hearingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const docsSnap = await db.collection("cases").doc(req.params.id).collection("documents").orderBy("uploadDate", "desc").get();
    caseData.documents = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const tasksSnap = await db.collection("tasks").where("caseId", "==", req.params.id).get();
    caseData.tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json(caseData);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/cases", requireAuth, async (req, res) => {
  try {
    const data = { 
      ...req.body, 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString() 
    };
    const docRef = await db.collection("cases").add(data);
    res.json({ id: docRef.id, ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create case" });
  }
});

// Tasks API
router.get("/tasks", requireAuth, async (req, res) => {
  try {
    const snap = await db.collection("tasks").orderBy("createdAt", "desc").get();
    const tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/tasks", requireAuth, async (req, res) => {
  try {
    const data = { 
      ...req.body, 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString() 
    };
    const docRef = await db.collection("tasks").add(data);
    res.json({ id: docRef.id, ...data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.put("/tasks/:id", requireAuth, async (req, res) => {
  try {
    const data = { ...req.body, updatedAt: new Date().toISOString() };
    await db.collection("tasks").doc(req.params.id).update(data);
    res.json({ id: req.params.id, ...data });
  } catch (error) {
    res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/tasks/:id", requireAuth, async (req, res) => {
  try {
    await db.collection("tasks").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ===================== User Management (Admin) =====================

router.put("/users/:uid/password", requireAuth, requireUserAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    await admin.auth().updateUser(req.params.uid, { password });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "فشل تغيير كلمة المرور" });
  }
});

router.put("/users/:uid/email", requireAuth, requireUserAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    await admin.auth().updateUser(req.params.uid, { email });
    await db.collection("users").doc(req.params.uid).update({ email });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "فشل تغيير البريد الإلكتروني" });
  }
});

// ===================== Subscription API =====================

async function sendWhatsAppNotification(message: string) {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  const phone = "201094040671";
  if (!apiKey) return;
  try {
    const encoded = encodeURIComponent(message);
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apiKey}`);
  } catch (err) {
    console.error("WhatsApp notification failed:", err);
  }
}

router.post("/subscribe", async (req, res) => {
  try {
    const { name, phone, email, plan, billing, amount, planName } = req.body;
    if (!name || !phone || !email || !plan) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }

    const data = {
      name,
      phone,
      email,
      plan,
      planName,
      billing,
      amount,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("subscriptionRequests").add(data);

    const billingText = billing === "monthly" ? "شهري" : "سنوي";
    const msg =
      `🔔 طلب اشتراك جديد!\n` +
      `الاسم: ${name}\n` +
      `الهاتف: ${phone}\n` +
      `البريد: ${email}\n` +
      `الباقة: ${planName} (${amount} ج.م - ${billingText})\n` +
      `رابط الإدارة: lawyers.smartcodix.com/app/subscriptions`;

    await sendWhatsAppNotification(msg);

    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "فشل في حفظ الطلب" });
  }
});

router.get("/subscriptions", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const snap = await db
      .collection("subscriptionRequests")
      .orderBy("createdAt", "desc")
      .get();
    const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/subscriptions/:id/approve", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const { email, durationMonths } = req.body;
    const reqDoc = await db.collection("subscriptionRequests").doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ error: "الطلب غير موجود" });

    const reqData = reqDoc.data() as any;
    const targetEmail = email || reqData.email;

    const usersSnap = await db.collection("users").where("email", "==", targetEmail).limit(1).get();
    if (usersSnap.empty) return res.status(404).json({ error: "المستخدم غير موجود في قاعدة البيانات" });

    const userDoc = usersSnap.docs[0];
    const months = durationMonths || (reqData.billing === "annual" ? 12 : 1);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + months);

    await userDoc.ref.update({
      plan: reqData.plan,
      subscriptionExpiry: expiry.toISOString(),
      subscriptionBilling: reqData.billing,
    });

    await db.collection("subscriptionRequests").doc(req.params.id).update({
      status: "approved",
      approvedAt: new Date().toISOString(),
      linkedUserId: userDoc.id,
    });

    res.json({ success: true, expiry: expiry.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.put("/subscriptions/:id/reject", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    await db.collection("subscriptionRequests").doc(req.params.id).update({
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
