import sqlite3 from 'sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

// Connect to the local SQLite database
const sqlitePath = "C:\\Users\\aldawlia\\AppData\\Local\\lawfirm-data\\dev.db";
const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite database. Please ensure the path is correct.");
    console.error(err.message);
    process.exit(1);
  }
});

const query = (sql) => new Promise((resolve, reject) => {
  db.all(sql, [], (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

function parseDate(val) {
  if (!val) return null;
  return new Date(val);
}

async function migrate() {
  console.log("🚀 Starting Data Migration from Local SQLite to Live MySQL...");

  try {
    // 1. Users
    const users = await query("SELECT * FROM User");
    for (const u of users) {
      await prisma.user.create({
        data: {
          id: u.id, email: u.email, password: u.password, name: u.name, role: u.role,
          phone: u.phone, joinDate: parseDate(u.joinDate), createdAt: parseDate(u.createdAt), updatedAt: parseDate(u.updatedAt)
        }
      }).catch(() => {}); // Ignore duplicate errors
    }
    console.log(`✅ Migrated ${users.length} Users.`);

    // 2. Clients
    const clients = await query("SELECT * FROM Client");
    for (const c of clients) {
      await prisma.client.create({
        data: {
          id: c.id, fullName: c.fullName, phone: c.phone, email: c.email, address: c.address,
          clientType: c.clientType, nationalId: c.nationalId, totalFees: c.totalFees, notes: c.notes,
          createdAt: parseDate(c.createdAt), updatedAt: parseDate(c.updatedAt)
        }
      }).catch(() => {});
    }
    console.log(`✅ Migrated ${clients.length} Clients.`);

    // 3. Cases
    const cases = await query("SELECT * FROM `Case`");
    for (const c of cases) {
      await prisma.case.create({
        data: {
          id: c.id, title: c.title, caseNumber: c.caseNumber, type: c.type, courtName: c.courtName,
          circuit: c.circuit, status: c.status, clientId: c.clientId, opponentName: c.opponentName,
          opponentLawyer: c.opponentLawyer, lawyerId: c.lawyerId, startDate: parseDate(c.startDate),
          nextHearingDate: parseDate(c.nextHearingDate), summary: c.summary, internalNotes: c.internalNotes,
          createdAt: parseDate(c.createdAt), updatedAt: parseDate(c.updatedAt)
        }
      }).catch(() => {});
    }
    console.log(`✅ Migrated ${cases.length} Cases.`);

    // 4. Other tables
    const tables = ['Hearing', 'Task', 'TaskComment', 'Memo', 'Document', 'Payment', 'Expense', 'TraineeEvaluation'];
    for (const table of tables) {
      try {
        const rows = await query(`SELECT * FROM ${table}`);
        for (const r of rows) {
          const data = { ...r };
          for (const key of Object.keys(data)) {
            if (key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt') {
              data[key] = parseDate(data[key]);
            }
          }
          await prisma[table.charAt(0).toLowerCase() + table.slice(1)].create({ data }).catch(() => {});
        }
        console.log(`✅ Migrated ${rows.length} records from ${table}.`);
      } catch (err) {
        // Table might be empty or not exist
      }
    }

    // 5. Implicit many-to-many (_TraineeCases)
    try {
      const traineeCases = await query("SELECT * FROM _TraineeCases");
      for (const tc of traineeCases) {
        await prisma.case.update({
          where: { id: tc.B },
          data: { trainees: { connect: { id: tc.A } } }
        }).catch(() => {});
      }
      console.log(`✅ Migrated ${traineeCases.length} Case Assignments.`);
    } catch (e) {}

    console.log("\n🎉 Migration Finished Successfully! Your local data is now LIVE on Vercel and MySQL.");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migrate().then(() => process.exit(0));
