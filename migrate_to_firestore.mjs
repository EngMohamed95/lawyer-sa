import { PrismaClient } from '@prisma/client';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Load your service account key
// You need to download this from Firebase Console: Project Settings -> Service Accounts -> Generate New Private Key
const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error("Please place your 'serviceAccountKey.json' in the project root directory.");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting migration to Firestore...");

  try {
    // 1. Migrate Users
    console.log("Migrating Users...");
    const users = await prisma.user.findMany();
    for (const user of users) {
      await db.collection('users').doc(user.id).set({
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        joinDate: user.joinDate.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    }

    // 2. Migrate Clients
    console.log("Migrating Clients...");
    const clients = await prisma.client.findMany();
    for (const client of clients) {
      await db.collection('clients').doc(client.id).set({
        fullName: client.fullName,
        phone: client.phone,
        email: client.email,
        address: client.address,
        clientType: client.clientType,
        nationalId: client.nationalId,
        totalFees: client.totalFees,
        notes: client.notes,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
      });
    }

    // 3. Migrate Cases
    console.log("Migrating Cases...");
    const cases = await prisma.case.findMany({
      include: {
        hearings: true,
        documents: true,
        memos: true,
        tasks: true,
        payments: true,
        expenses: true
      }
    });

    for (const c of cases) {
      const caseRef = db.collection('cases').doc(c.id);
      const lawyerId = c.lawyerId; // Get parent lawyerId
      
      await caseRef.set({
        title: c.title,
        caseNumber: c.caseNumber,
        type: c.type,
        courtName: c.courtName,
        circuit: c.circuit,
        status: c.status,
        clientId: c.clientId,
        opponentName: c.opponentName,
        opponentLawyer: c.opponentLawyer,
        lawyerId: c.lawyerId,
        startDate: c.startDate.toISOString(),
        nextHearingDate: c.nextHearingDate ? c.nextHearingDate.toISOString() : null,
        summary: c.summary,
        internalNotes: c.internalNotes,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      });

      for (const h of c.hearings) {
        await caseRef.collection('hearings').doc(h.id).set({
          lawyerId, // Added for indexing
          hearingDate: h.hearingDate.toISOString(),
          court: h.court,
          circuit: h.circuit,
          requiredActions: h.requiredActions,
          previousDecision: h.previousDecision,
          result: h.result,
          nextHearingDate: h.nextHearingDate ? h.nextHearingDate.toISOString() : null,
          notes: h.notes,
          createdAt: h.createdAt.toISOString(),
        });
      }

      for (const d of c.documents) {
        await caseRef.collection('documents').doc(d.id).set({
          lawyerId, // Added for indexing
          name: d.name,
          fileUrl: d.fileUrl,
          content: d.content,
          type: d.type,
          uploadedBy: d.uploadedBy,
          uploadDate: d.uploadDate.toISOString(),
          notes: d.notes,
        });
      }

      for (const m of c.memos) {
        await caseRef.collection('memos').doc(m.id).set({
          lawyerId, // Added for indexing
          title: m.title,
          content: m.content,
          type: m.type,
          authorId: m.authorId,
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        });
      }

      for (const p of c.payments) {
        await caseRef.collection('payments').doc(p.id).set({
          lawyerId, // Added for indexing
          amount: p.amount,
          date: p.date.toISOString(),
          notes: p.notes,
          clientId: p.clientId,
        });
      }

      for (const e of c.expenses) {
        await caseRef.collection('expenses').doc(e.id).set({
          lawyerId, // Added for indexing
          amount: e.amount,
          type: e.type,
          date: e.date.toISOString(),
          notes: e.notes,
        });
      }
    }

    // 4. Migrate Global Tasks and Comments
    console.log("Migrating Global Tasks...");
    const tasks = await prisma.task.findMany({
      include: { comments: true }
    });
    for (const t of tasks) {
      const taskRef = db.collection('tasks').doc(t.id);
      await taskRef.set({
        title: t.title,
        description: t.description,
        assignedTo: t.assignedTo, // This acts as lawyerId for tasks
        lawyerId: t.assignedTo,   // Consistent field name
        caseId: t.caseId,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      });

      for (const com of t.comments) {
        await taskRef.collection('comments').doc(com.id).set({
          text: com.text,
          authorId: com.authorId,
          createdAt: com.createdAt.toISOString(),
        });
      }
    }

    // 5. Migrate Payments (Global/Orphaned)
    console.log("Migrating Payments...");
    const allPayments = await prisma.payment.findMany({
        include: { caseRef: true }
    });
    for (const p of allPayments) {
      await db.collection('payments').doc(p.id).set({
        lawyerId: p.caseRef?.lawyerId || null,
        caseId: p.caseId,
        clientId: p.clientId,
        amount: p.amount,
        date: p.date.toISOString(),
        notes: p.notes,
      });
    }

    // 6. Migrate Trainee Evaluations
    console.log("Migrating Trainee Evaluations...");
    const evaluations = await prisma.traineeEvaluation.findMany();
    for (const ev of evaluations) {
      await db.collection('evaluations').doc(ev.id).set({
        traineeId: ev.traineeId,
        reviewerId: ev.reviewerId,
        score: ev.score,
        notes: ev.notes,
        date: ev.date.toISOString(),
      });
    }

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
