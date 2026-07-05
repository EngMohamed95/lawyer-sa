import { PrismaClient } from '@prisma/client';
import "dotenv/config";

const envUrl = process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  log: ['error'],
  ...(envUrl ? { datasources: { db: { url: envUrl } } } : {}),
});

// Helper to check if DB is healthy with timeout
export async function checkDbHealth() {
  try {
    // Create a promise that rejects after 5 seconds
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Database connection timeout")), 5000)
    );
    
    // Race the prisma query against the timeout
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      timeout
    ]);
    
    return true;
  } catch (e: any) {
    console.error("Database health check failed:", e.message || e);
    return false;
  }
}
