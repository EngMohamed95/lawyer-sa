import { prisma } from '../src/server/db.ts';

async function main() {
  const existingCases = await prisma.case.count();
  if (existingCases > 0) {
    console.log("Database already contains case data. Seed skipped.");
    return;
  }

  console.log("Seeding database...");

  // Generate Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lawfirm.com' },
    update: {},
    create: {
      email: 'admin@lawfirm.com',
      password: 'password_hash_placeholder',
      name: 'أحمد محمد',
      role: 'ADMIN',
      phone: '01000000000',
    },
  });

  // Generate Lawyer
  const lawyer = await prisma.user.upsert({
    where: { email: 'lawyer@lawfirm.com' },
    update: {},
    create: {
      email: 'lawyer@lawfirm.com',
      password: 'password_hash_placeholder',
      name: 'محمود عبد السلام',
      role: 'LAWYER',
      phone: '01111111111',
    },
  });

  // Generate Clients
  const client1 = await prisma.client.create({
    data: {
      fullName: 'شركة النور للمقاولات',
      phone: '01222222222',
      email: 'info@alnoor.com',
      clientType: 'COMPANY',
      address: 'القاهرة، مدينة نصر',
      nationalId: '123456789',
      totalFees: 55000,
    }
  });

  const client2 = await prisma.client.create({
    data: {
      fullName: 'مصطفى حسين',
      phone: '01555555555',
      clientType: 'INDIVIDUAL',
      address: 'الإسكندرية، الازاريطة',
      nationalId: '29001010101010',
      totalFees: 12000,
    }
  });

  const client3 = await prisma.client.create({
    data: {
      fullName: 'ياسمين طارق',
      phone: '01099998888',
      clientType: 'INDIVIDUAL',
      address: 'الجيزة، الدقي',
      nationalId: '29202020202020',
      totalFees: 8500,
    }
  });

  // Generate Cases
  const case1 = await prisma.case.create({
    data: {
      title: 'نزاع تجاري - تأخير توريد',
      caseNumber: 'CASE-2026-001',
      type: 'COMMERCIAL',
      status: 'OPEN',
      clientId: client1.id,
      lawyerId: lawyer.id,
      courtName: 'محكمة القاهرة الاقتصادية',
      opponentName: 'شركة الأمل للتوريدات',
      opponentLawyer: 'سمير خليل',
      summary: 'مطالبة بتعويض مالي نتيجة تأخير التوريد لمدة ٣ أشهر',
    }
  });

  const case2 = await prisma.case.create({
    data: {
      title: 'دعوى عمالية - فصل تعسفي',
      caseNumber: 'CASE-2026-002',
      type: 'LABOR',
      status: 'PENDING',
      clientId: client2.id,
      lawyerId: lawyer.id,
      courtName: 'محكمة العمال - الجيزة',
      opponentName: 'مصنع المنسوجات',
      summary: 'دعوى تعويض عن فصل تعسفي دون سابق إنذار',
    }
  });

  const case3 = await prisma.case.create({
    data: {
      title: 'دعوى نفقة',
      caseNumber: 'CASE-2026-003',
      type: 'FAMILY',
      status: 'OPEN',
      clientId: client3.id,
      lawyerId: admin.id,
      courtName: 'محكمة الأسرة - مدينة نصر',
      opponentName: 'أحمد محمود',
      summary: 'دعوى نفقة زوجية ومصاريف دراسية',
    }
  });

  // Generate Hearings
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 10);
  const futureDate1 = new Date(today);
  futureDate1.setDate(futureDate1.getDate() + 5);
  const futureDate2 = new Date(today);
  futureDate2.setDate(futureDate2.getDate() + 14);

  await prisma.hearing.create({
    data: {
      caseId: case1.id,
      hearingDate: pastDate,
      court: 'الاقتصادية - الدائرة الاولى',
      circuit: '١ اقتصادي',
      requiredActions: 'تقديم المذكرات الختامية',
      result: 'تأجيل للاطلاع',
    }
  });

  await prisma.hearing.create({
    data: {
      caseId: case2.id,
      hearingDate: today,
      court: 'العمالية - الجيزة',
      circuit: '٥ عمال',
      requiredActions: 'حضور الشهود',
    }
  });

  await prisma.hearing.create({
    data: {
      caseId: case3.id,
      hearingDate: futureDate1,
      court: 'محكمة الأسرة',
      circuit: '٧ أسرة',
      requiredActions: 'تقديم مفردات المرتب',
    }
  });

  await prisma.hearing.create({
    data: {
      caseId: case1.id,
      hearingDate: futureDate2,
      court: 'الاقتصادية - الدائرة الاولى',
      circuit: '١ اقتصادي',
      requiredActions: 'مرافعة ختامية',
    }
  });

  // Generate More Clients
  const client4 = await prisma.client.create({
    data: {
      fullName: 'خالد السيد',
      phone: '01211112222',
      clientType: 'INDIVIDUAL',
      address: 'المنصورة، المشاية',
      nationalId: '28005050505050',
    }
  });

  const client5 = await prisma.client.create({
    data: {
      fullName: 'البنك العربي المتحد',
      phone: '01012345678',
      clientType: 'COMPANY',
      address: 'القاهرة، التجمع الخامس',
      nationalId: '987654321',
    }
  });

  // Generate More Cases
  const case4 = await prisma.case.create({
    data: {
      title: 'دعوى صحة توقيع',
      caseNumber: 'CASE-2026-004',
      type: 'CIVIL',
      status: 'OPEN',
      clientId: client4.id,
      lawyerId: lawyer.id,
      courtName: 'محكمة المنصورة الابتدائية',
      summary: 'إثبات صحة توقيع على عقد بيع شقة سكنية',
    }
  });

  const case5 = await prisma.case.create({
    data: {
      title: 'تحصيل ديون متعثرة',
      caseNumber: 'CASE-2026-005',
      type: 'COMMERCIAL',
      status: 'OPEN',
      clientId: client5.id,
      lawyerId: admin.id,
      courtName: 'محكمة القاهرة الاقتصادية',
      summary: 'المطالبة بمستحقات مالية متأخرة لم يتم سدادها من عدة شركات',
    }
  });

  const case6 = await prisma.case.create({
    data: {
      title: 'قضية تعويض عن حادث',
      caseNumber: 'CASE-2026-006',
      type: 'CIVIL',
      status: 'CLOSED',
      clientId: client2.id,
      lawyerId: lawyer.id,
      courtName: 'محكمة الإسكندرية',
      summary: 'المطالبة بتعويض عن الأضرار المادية والمعنوية الناتجة عن حادث سير',
    }
  });

  await prisma.payment.create({
    data: {
      clientId: client1.id,
      caseId: case1.id,
      amount: 24000,
      notes: 'دفع مقدم على الأتعاب',
    }
  });

  await prisma.payment.create({
    data: {
      clientId: client2.id,
      caseId: case2.id,
      amount: 4000,
      notes: 'دفعة أولى من الرسوم',
    }
  });

  await prisma.payment.create({
    data: {
      clientId: client3.id,
      caseId: case3.id,
      amount: 3000,
      notes: 'دفعة جزئية',
    }
  });

  // Generate More Hearings
  const futureDate3 = new Date(today);
  futureDate3.setDate(futureDate3.getDate() + 2);
  const futureDate4 = new Date(today);
  futureDate4.setDate(futureDate4.getDate() + 7);

  await prisma.hearing.create({
    data: {
      caseId: case4.id,
      hearingDate: futureDate3,
      court: 'المنصورة الابتدائية - مدني',
      circuit: '٣ مدني',
      requiredActions: 'تقديم أصل العقد',
    }
  });

  await prisma.hearing.create({
    data: {
      caseId: case5.id,
      hearingDate: futureDate4,
      court: 'القاهرة الاقتصادية',
      circuit: '١٠ استئناف',
      requiredActions: 'مرافعة',
    }
  });

  // Generate More Tasks
  await prisma.task.create({
    data: {
      title: 'تجهيز ملف البنك العربي',
      description: 'جمع الفواتير والعقود المتعلقة بالديون المتأخرة.',
      assignedTo: admin.id,
      caseId: case5.id,
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      dueDate: new Date(Date.now() + 86400000 * 1),
    }
  });

  await prisma.task.create({
    data: {
      title: 'الاتصال بالموكل خالد السيد',
      assignedTo: lawyer.id,
      caseId: case4.id,
      priority: 'LOW',
      status: 'NEW',
      dueDate: new Date(Date.now() + 86400000 * 3),
    }
  });

  await prisma.task.create({
    data: {
      title: 'سداد رسوم المحكمة',
      assignedTo: lawyer.id,
      caseId: case1.id,
      priority: 'HIGH',
      status: 'OVERDUE',
      dueDate: new Date(Date.now() - 86400000 * 5),
    }
  });

  console.log("Seeding finished.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
