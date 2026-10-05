// Disposable localhost-only accounts for manual browser verification.
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const sdk = require("module").createRequire(
  require.resolve("@firebase/rules-unit-testing"),
)("firebase/firestore");
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-lawyer-support",
    firestore: { host: "127.0.0.1", port: 8088 },
  });
  try {
    await env.clearFirestore();
    await fetch("http://127.0.0.1:9098/emulator/v1/projects/demo-lawyer-support/accounts", { method: "DELETE" });
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (const [email, role, name] of [
        ["owner@support.test", "LAWYER", "مكتب الاختبار"],
        ["admin@support.test", "SUPER_ADMIN", "مدير المنصة"],
      ]) {
        const response = await fetch(
          "http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password: "SupportDemo123!",
              returnSecureToken: true,
            }),
          },
        );
        const user = await response.json();
        if (!response.ok) throw Error(user.error.message);
        await sdk.setDoc(sdk.doc(ctx.firestore(), "users", user.localId), {
          name,
          role,
          status: "ACTIVE",
          plan: "PREMIUM",
        });
        if (role === "LAWYER") {
          for (let i = 0; i < 13; i++) {
            await sdk.setDoc(
              sdk.doc(
                ctx.firestore(),
                "supportTickets",
                `demoticket${String(i).padStart(11, "0")}`,
              ),
              {
                subject: [
                  "مشكلة في رفع مستندات القضية",
                  "استفسار عن تجديد الاشتراك",
                  "اقتراح تحسين تقارير المكتب",
                ][i % 3],
                description:
                  "أحتاج إلى مساعدة فريق الدعم في هذا الطلب. تظهر المشكلة عند حفظ البيانات، وأرغب في معرفة الخطوات المناسبة لحلها.",
                category: [
                  "مشكلة تقنية أو عطل في النظام",
                  "الاشتراكات والفواتير والمدفوعات",
                  "اقتراح وتطوير",
                ][i % 3],
                priority: i % 3 === 0 ? "HIGH" : "NORMAL",
                status: ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"][i % 4],
                createdBy: user.localId,
                requesterName: name,
                lawyerId: user.localId,
                createdAt: new Date(Date.now() - i * 3600000),
                updatedAt: new Date(Date.now() - i * 3600000),
                lastMessageId: "",
                lastReplyBy: "",
                messageCount: 1,
                attachments: [],
              },
            );
          }
          for (let i = 0; i < 8; i++) {
            await sdk.setDoc(
              sdk.doc(ctx.firestore(), "productSuggestions", `demo-suggestion-${i}`),
              {
                title: ["تطوير لوحة التقارير", "تحسين البحث في القضايا", "إضافة تنبيهات ذكية"][i % 3],
                details: "اقتراح يساعد فريق المكتب على إنجاز العمل بصورة أسرع ويوضح المعلومات المهمة للمستخدم.",
                category: ["الحسابات والتقارير", "إدارة القضايا والجلسات", "واجهة وتجربة المستخدم"][i % 3],
                status: ["RECEIVED", "UNDER_REVIEW", "PLANNED", "IMPLEMENTED"][i % 4],
                createdBy: user.localId,
                requesterName: name,
                lawyerId: user.localId,
                adminResponse: i > 2 ? "تمت مراجعة الاقتراح وإضافته إلى خطة تطوير النظام." : "",
                createdAt: new Date(Date.now() - i * 7200000),
                updatedAt: new Date(Date.now() - i * 3600000),
                respondedAt: i > 2 ? new Date(Date.now() - i * 3600000) : null,
              },
            );
          }
        }
      }
    });
    console.log(
      "Local support demo seeded. owner@support.test / admin@support.test — password: SupportDemo123!",
    );
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
