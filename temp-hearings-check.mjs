import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const hearings = await prisma.hearing.findMany({ include: { caseRef: true }, orderBy: { hearingDate: 'asc' } });
  console.log('hearings count', hearings.length);
  hearings.forEach((h) => {
    console.log({
      id: h.id,
      hearingDate: h.hearingDate,
      caseTitle: h.caseRef?.title,
      court: h.court,
      requiredActions: h.requiredActions,
      nextHearingDate: h.nextHearingDate,
    });
  });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
