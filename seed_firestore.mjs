import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error("Please place your 'serviceAccountKey.json' in the project root directory.");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function seed() {
  console.log("Seeding Firestore with fake data...");

  try {
    // 1. Create Admin User
    console.log("Creating Admin User...");
    const adminId = "admin_user_001";
    await db.collection('users').doc(adminId).set({
      email: "admin@lawyer.com",
      name: "الأستاذ حمدي عطا",
      role: "ADMIN",
      phone: "01000000000",
      joinDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Create Clients
    console.log("Creating Fake Clients...");
    const clientIds = [];
    const fakeClients = [
      { fullName: "شركة النيل للتجارة", clientType: "COMPANY", phone: "0123456789", nationalId: "987654321" },
      { fullName: "محمد أحمد علي", clientType: "INDIVIDUAL", phone: "0111222333", nationalId: "290010100001" },
      { fullName: "سارة محمود حسن", clientType: "INDIVIDUAL", phone: "0155666777", nationalId: "295050500002" }
    ];

    for (const client of fakeClients) {
      const docRef = await db.collection('clients').add({
        ...client,
        totalFees: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      clientIds.push(docRef.id);
    }

    // 3. Create Cases
    console.log("Creating Fake Cases...");
    const caseIds = [];
    const fakeCases = [
      { title: "قضية تعويضات مدنية", caseNumber: "١٢٣/٢٠٢٤", type: "CIVIL", clientId: clientIds[0], status: "OPEN" },
      { title: "نزاع عمالي", caseNumber: "٤٥٦/٢٠٢٤", type: "LABOR", clientId: clientIds[1], status: "PENDING" },
      { title: "قضية جنح مستأنف", caseNumber: "٧٨٩/٢٠٢٣", type: "CRIMINAL", clientId: clientIds[2], status: "OPEN" }
    ];

    for (const c of fakeCases) {
      const docRef = await db.collection('cases').add({
        ...c,
        courtName: "محكمة شمال القاهرة",
        circuit: "الدائرة ٥ مدني",
        lawyerId: adminId,
        startDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      caseIds.push(docRef.id);

      // Add one hearing per case
      await docRef.collection('hearings').add({
        hearingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week later
        court: "محكمة شمال القاهرة",
        circuit: "الدائرة ٥ مدني",
        requiredActions: "تقديم مذكرات الدفاع",
        notes: "جلسة هامة للمرافعة",
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Create Tasks
    console.log("Creating Fake Tasks...");
    const fakeTasks = [
      { title: "تجهيز حافظة مستندات", description: "تجهيز أوراق قضية التعويضات", priority: "HIGH", status: "NEW", caseId: caseIds[0] },
      { title: "إعلان الخصم", description: "إعلان بالصحيفة الافتتاحية", priority: "MEDIUM", status: "IN_PROGRESS", caseId: caseIds[1] }
    ];

    for (const t of fakeTasks) {
      await db.collection('tasks').add({
        ...t,
        assignedTo: adminId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    console.log("Firestore seeding completed successfully!");
  } catch (error) {
    console.error("Seeding failed:", error);
  }
}

seed();
