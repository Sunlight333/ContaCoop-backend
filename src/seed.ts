import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create default cooperative
  const cooperative = await prisma.cooperative.upsert({
    where: { id: 'coop-default' },
    update: {},
    create: {
      id: 'coop-default',
      name: 'Cooperativa Financiera XYZ',
      ruc: '12-3456789',
      address: 'Calle Cooperativa 123, Ciudad, País',
      email: 'info@cooperativa.com',
      phone: '+56 9 1234 5678',
    },
  });
  console.log('✅ Created cooperative:', cooperative.name);

  // Create default settings
  await prisma.settings.upsert({
    where: { cooperativeId: cooperative.id },
    update: {},
    create: {
      cooperativeId: cooperative.id,
      emailNotifications: true,
      uploadNotifications: true,
      paymentReminders: false,
      twoFactorAuth: false,
      sessionTimeout: true,
      sessionTimeoutMinutes: 30,
      autoBackup: true,
    },
  });
  console.log('✅ Created default settings');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cooperative.com' },
    update: {},
    create: {
      email: 'admin@cooperative.com',
      password: adminPassword,
      name: 'María García',
      role: 'admin',
      status: 'active',
      memberId: 'M001',
      cooperativeId: cooperative.id,
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create socio user
  const socioPassword = await bcrypt.hash('socio123', 10);
  const socio = await prisma.user.upsert({
    where: { email: 'socio@cooperative.com' },
    update: {},
    create: {
      email: 'socio@cooperative.com',
      password: socioPassword,
      name: 'Carlos López',
      role: 'socio',
      status: 'active',
      memberId: 'M002',
      cooperativeId: cooperative.id,
    },
  });
  console.log('✅ Created socio user:', socio.email);

  // Create additional members
  const members = [
    { name: 'Ana Rodríguez', email: 'ana@cooperative.com', memberId: 'M003' },
    { name: 'Pedro Martínez', email: 'pedro@cooperative.com', memberId: 'M004' },
    { name: 'Laura Sánchez', email: 'laura@cooperative.com', memberId: 'M005' },
    { name: 'Diego Fernández', email: 'diego@cooperative.com', memberId: 'M006' },
    { name: 'Carmen Ruiz', email: 'carmen@cooperative.com', memberId: 'M007' },
  ];

  for (const member of members) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: {},
      create: {
        email: member.email,
        password: socioPassword,
        name: member.name,
        role: 'socio',
        status: 'active',
        memberId: member.memberId,
        cooperativeId: cooperative.id,
      },
    });
  }
  console.log('✅ Created additional members');

  // Create periods (last 12 months)
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    await prisma.period.upsert({
      where: {
        cooperativeId_year_month: {
          cooperativeId: cooperative.id,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        },
      },
      update: {},
      create: {
        cooperativeId: cooperative.id,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        isActive: true,
      },
    });
  }
  console.log('✅ Created periods');

  // Create sample balance sheet data (current month)
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const balanceSheetEntries = [
    // Assets
    { accountCode: '1100', accountName: 'Efectivo y Equivalentes', category: 'assets', subcategory: 'Activo Corriente', finalDebit: 125000 },
    { accountCode: '1200', accountName: 'Cuentas por Cobrar', category: 'assets', subcategory: 'Activo Corriente', finalDebit: 85000 },
    { accountCode: '1300', accountName: 'Inventarios', category: 'assets', subcategory: 'Activo Corriente', finalDebit: 45000 },
    { accountCode: '1400', accountName: 'Inversiones a Corto Plazo', category: 'assets', subcategory: 'Activo Corriente', finalDebit: 50000 },
    { accountCode: '1500', accountName: 'Propiedad, Planta y Equipo', category: 'assets', subcategory: 'Activo No Corriente', finalDebit: 180000 },
    { accountCode: '1600', accountName: 'Activos Intangibles', category: 'assets', subcategory: 'Activo No Corriente', finalDebit: 25000 },
    // Liabilities
    { accountCode: '2100', accountName: 'Cuentas por Pagar', category: 'liabilities', subcategory: 'Pasivo Corriente', finalCredit: 65000 },
    { accountCode: '2200', accountName: 'Préstamos a Corto Plazo', category: 'liabilities', subcategory: 'Pasivo Corriente', finalCredit: 45000 },
    { accountCode: '2300', accountName: 'Obligaciones Laborales', category: 'liabilities', subcategory: 'Pasivo Corriente', finalCredit: 25000 },
    { accountCode: '2400', accountName: 'Préstamos a Largo Plazo', category: 'liabilities', subcategory: 'Pasivo No Corriente', finalCredit: 120000 },
    // Equity
    { accountCode: '3100', accountName: 'Capital Social', category: 'equity', subcategory: 'Patrimonio', finalCredit: 150000 },
    { accountCode: '3200', accountName: 'Reservas', category: 'equity', subcategory: 'Patrimonio', finalCredit: 55000 },
    { accountCode: '3300', accountName: 'Resultados Acumulados', category: 'equity', subcategory: 'Patrimonio', finalCredit: 50000 },
  ];

  for (const entry of balanceSheetEntries) {
    await prisma.balanceSheetEntry.upsert({
      where: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-${entry.accountCode}`,
      },
      update: {},
      create: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-${entry.accountCode}`,
        cooperativeId: cooperative.id,
        year: currentYear,
        month: currentMonth,
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        category: entry.category as 'assets' | 'liabilities' | 'equity',
        subcategory: entry.subcategory,
        initialDebit: 0,
        initialCredit: 0,
        periodDebit: entry.finalDebit || 0,
        periodCredit: entry.finalCredit || 0,
        finalDebit: entry.finalDebit || 0,
        finalCredit: entry.finalCredit || 0,
      },
    });
  }
  console.log('✅ Created balance sheet entries');

  // Create sample cash flow data
  const cashFlowEntries = [
    { description: 'Ingresos por Ventas', category: 'operating', amount: 85000 },
    { description: 'Pagos a Proveedores', category: 'operating', amount: -35000 },
    { description: 'Pagos de Salarios', category: 'operating', amount: -25000 },
    { description: 'Otros Gastos Operativos', category: 'operating', amount: -8000 },
    { description: 'Compra de Equipos', category: 'investing', amount: -45000 },
    { description: 'Venta de Inversiones', category: 'investing', amount: 15000 },
    { description: 'Préstamo Bancario Recibido', category: 'financing', amount: 30000 },
    { description: 'Pago de Dividendos', category: 'financing', amount: -12000 },
  ];

  for (const [index, entry] of cashFlowEntries.entries()) {
    await prisma.cashFlowEntry.upsert({
      where: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-cf-${index}`,
      },
      update: {},
      create: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-cf-${index}`,
        cooperativeId: cooperative.id,
        year: currentYear,
        month: currentMonth,
        description: entry.description,
        category: entry.category as 'operating' | 'investing' | 'financing',
        amount: entry.amount,
      },
    });
  }
  console.log('✅ Created cash flow entries');

  // Create sample membership fees
  const allMembers = ['M001', 'M002', 'M003', 'M004', 'M005', 'M006', 'M007'];
  const memberNames: Record<string, string> = {
    M001: 'María García',
    M002: 'Carlos López',
    M003: 'Ana Rodríguez',
    M004: 'Pedro Martínez',
    M005: 'Laura Sánchez',
    M006: 'Diego Fernández',
    M007: 'Carmen Ruiz',
  };

  for (const memberId of allMembers) {
    const paymentMade = Math.random() > 0.3 ? 500 : Math.floor(Math.random() * 400);
    const debt = 500 - paymentMade;

    await prisma.membershipFee.upsert({
      where: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-${memberId}`,
      },
      update: {},
      create: {
        id: `${cooperative.id}-${currentYear}-${currentMonth}-${memberId}`,
        cooperativeId: cooperative.id,
        year: currentYear,
        month: currentMonth,
        memberId,
        memberName: memberNames[memberId],
        expectedContribution: 500,
        paymentMade,
        debt,
        status: debt === 0 ? 'up_to_date' : 'with_debt',
      },
    });
  }
  console.log('✅ Created membership fees');

  // Create sample financial ratios
  const ratios = [
    { name: 'Current Ratio', value: 2.27, trend: 'up', description: 'Capacidad de pago a corto plazo' },
    { name: 'Debt to Assets', value: 0.5, trend: 'stable', description: 'Nivel de endeudamiento' },
    { name: 'Return on Equity', value: 0.12, trend: 'up', description: 'Rentabilidad para los socios' },
    { name: 'Operating Margin', value: 0.18, trend: 'up', description: 'Eficiencia operativa' },
  ];

  for (const ratio of ratios) {
    await prisma.financialRatio.upsert({
      where: {
        cooperativeId_year_month_name: {
          cooperativeId: cooperative.id,
          year: currentYear,
          month: currentMonth,
          name: ratio.name,
        },
      },
      update: {},
      create: {
        cooperativeId: cooperative.id,
        year: currentYear,
        month: currentMonth,
        name: ratio.name,
        value: ratio.value,
        trend: ratio.trend,
        description: ratio.description,
      },
    });
  }
  console.log('✅ Created financial ratios');

  // Create historical data (previous 5 months)
  for (let i = 1; i <= 5; i++) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Historical ratios with slight variations
    for (const ratio of ratios) {
      const variation = (Math.random() - 0.5) * 0.1;
      await prisma.financialRatio.upsert({
        where: {
          cooperativeId_year_month_name: {
            cooperativeId: cooperative.id,
            year,
            month,
            name: ratio.name,
          },
        },
        update: {},
        create: {
          cooperativeId: cooperative.id,
          year,
          month,
          name: ratio.name,
          value: Math.max(0, ratio.value + variation),
          trend: variation > 0 ? 'up' : 'down',
          description: ratio.description,
        },
      });
    }
  }
  console.log('✅ Created historical data');

  console.log('\n✨ Seed completed successfully!');
  console.log('\n📝 Default credentials:');
  console.log('   Admin: admin@cooperative.com / admin123');
  console.log('   Socio: socio@cooperative.com / socio123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
