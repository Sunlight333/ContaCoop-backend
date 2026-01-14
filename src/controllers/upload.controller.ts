import { Response } from 'express';
import * as XLSX from 'xlsx';
import prisma from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, UploadResult } from '../types/index.js';
import { BalanceCategory, CashFlowCategory, FeeStatus } from '@prisma/client';

// Helper function to parse Excel/CSV file
function parseFile(buffer: Buffer, filename: string): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON, skipping header rows that contain instructions
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];

  // Filter out instruction rows (those that start with known instruction text)
  const filtered = data.filter((row: Record<string, any>) => {
    const firstValue = String(Object.values(row)[0] || '').toLowerCase();
    return !firstValue.startsWith('plantilla') &&
      !firstValue.startsWith('instrucciones') &&
      !firstValue.startsWith('columnas requeridas') &&
      !firstValue.startsWith('datos de ejemplo') &&
      firstValue !== '' &&
      !firstValue.startsWith('-');
  });

  return filtered;
}

// Map Spanish column names to English database fields
const balanceSheetColumnMap: Record<string, string> = {
  codigo_cuenta: 'accountCode',
  nombre_cuenta: 'accountName',
  tipo_cuenta: 'category',
  monto: 'amount',
  cuenta_padre: 'parentAccount',
};

const cashFlowColumnMap: Record<string, string> = {
  tipo_actividad: 'category',
  descripcion: 'description',
  monto: 'amount',
};

const membershipFeesColumnMap: Record<string, string> = {
  id_socio: 'memberId',
  nombre_socio: 'memberName',
  email: 'email',
  tipo_cuota: 'feeType',
  monto_esperado: 'expectedContribution',
  monto_pagado: 'paymentMade',
  fecha_pago: 'paymentDate',
  estado: 'status',
};

const ratiosColumnMap: Record<string, string> = {
  nombre_ratio: 'name',
  valor: 'value',
  tendencia: 'trend',
  descripcion: 'description',
};

// Map row using column mapping
function mapRow(row: Record<string, any>, columnMap: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().trim();
    const mappedKey = columnMap[normalizedKey];
    if (mappedKey) {
      mapped[mappedKey] = value;
    }
  }
  return mapped;
}

// Upload balance sheet from file
export async function uploadBalanceSheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.body.cooperativeId || req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.body.year || req.query.year as string);
    const month = parseInt(req.body.month || req.query.month as string);
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month || month < 1 || month > 12) {
      sendError(res, 'Valid year and month are required', 400);
      return;
    }

    const file = (req as any).file;
    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    // Parse file
    let records: Record<string, any>[];
    try {
      const rawData = parseFile(file.buffer, file.originalname);
      records = rawData.map(row => mapRow(row, balanceSheetColumnMap));
    } catch (error) {
      sendError(res, 'Failed to parse file. Please check the file format.', 400);
      return;
    }

    if (records.length === 0) {
      sendError(res, 'No valid records found in file', 400);
      return;
    }

    // Check if data exists and overwrite is not enabled
    if (!overwrite) {
      const existingData = await prisma.balanceSheetEntry.findFirst({
        where: { cooperativeId, year, month },
      });

      if (existingData) {
        sendError(res, 'Data already exists for this period. Enable overwrite to replace.', 400);
        return;
      }
    }

    // Delete existing data if overwrite
    if (overwrite) {
      await prisma.balanceSheetEntry.deleteMany({
        where: { cooperativeId, year, month },
      });
    }

    // Map category values
    const categoryMap: Record<string, BalanceCategory> = {
      activo: BalanceCategory.assets,
      pasivo: BalanceCategory.liabilities,
      patrimonio: BalanceCategory.equity,
    };

    // Save records to database
    const validRecords = records.filter(r => r.accountCode && r.accountName);
    if (validRecords.length > 0) {
      await prisma.balanceSheetEntry.createMany({
        data: validRecords.map((r) => ({
          cooperativeId,
          year,
          month,
          accountCode: String(r.accountCode),
          accountName: String(r.accountName),
          category: categoryMap[String(r.category).toLowerCase()] || BalanceCategory.assets,
          subcategory: r.parentAccount ? String(r.parentAccount) : null,
          initialDebit: 0,
          initialCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          finalDebit: parseFloat(r.amount) || 0,
          finalCredit: 0,
        })),
      });
    }

    // Ensure period exists
    await prisma.period.upsert({
      where: {
        cooperativeId_year_month: { cooperativeId, year, month },
      },
      update: {},
      create: { cooperativeId, year, month },
    });

    // Log success
    await prisma.uploadHistory.create({
      data: {
        cooperativeId,
        userId: req.user!.id,
        year,
        month,
        module: 'balance_sheet',
        status: 'success',
        recordsCount: validRecords.length,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Importó Balance General',
        details: `Período: ${month}/${year}, Registros: ${validRecords.length}`,
        ipAddress: req.ip,
      },
    });

    const result: UploadResult = {
      status: 'success',
      message: `Se importaron ${validRecords.length} registros del balance general`,
      recordsCount: validRecords.length,
    };

    sendSuccess(res, result);
  } catch (error) {
    console.error('Upload balance sheet error:', error);
    sendError(res, 'Failed to upload balance sheet', 500);
  }
}

// Upload cash flow from file
export async function uploadCashFlow(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.body.cooperativeId || req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.body.year || req.query.year as string);
    const month = parseInt(req.body.month || req.query.month as string);
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const file = (req as any).file;
    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    // Parse file
    let records: Record<string, any>[];
    try {
      const rawData = parseFile(file.buffer, file.originalname);
      records = rawData.map(row => mapRow(row, cashFlowColumnMap));
    } catch (error) {
      sendError(res, 'Failed to parse file', 400);
      return;
    }

    if (records.length === 0) {
      sendError(res, 'No valid records found in file', 400);
      return;
    }

    if (!overwrite) {
      const existingData = await prisma.cashFlowEntry.findFirst({
        where: { cooperativeId, year, month },
      });

      if (existingData) {
        sendError(res, 'Data already exists for this period', 400);
        return;
      }
    }

    if (overwrite) {
      await prisma.cashFlowEntry.deleteMany({
        where: { cooperativeId, year, month },
      });
    }

    // Map category values
    const categoryMap: Record<string, CashFlowCategory> = {
      operacion: CashFlowCategory.operating,
      inversion: CashFlowCategory.investing,
      financiamiento: CashFlowCategory.financing,
    };

    const validRecords = records.filter(r => r.description && r.category);
    if (validRecords.length > 0) {
      await prisma.cashFlowEntry.createMany({
        data: validRecords.map((r) => ({
          cooperativeId,
          year,
          month,
          description: String(r.description),
          category: categoryMap[String(r.category).toLowerCase()] || CashFlowCategory.operating,
          amount: parseFloat(r.amount) || 0,
        })),
      });
    }

    await prisma.period.upsert({
      where: { cooperativeId_year_month: { cooperativeId, year, month } },
      update: {},
      create: { cooperativeId, year, month },
    });

    await prisma.uploadHistory.create({
      data: {
        cooperativeId,
        userId: req.user!.id,
        year,
        month,
        module: 'cash_flow',
        status: 'success',
        recordsCount: validRecords.length,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Importó Flujo de Caja',
        details: `Período: ${month}/${year}, Registros: ${validRecords.length}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, {
      status: 'success',
      message: `Se importaron ${validRecords.length} registros de flujo de caja`,
      recordsCount: validRecords.length,
    });
  } catch (error) {
    console.error('Upload cash flow error:', error);
    sendError(res, 'Failed to upload cash flow', 500);
  }
}

// Upload membership fees from file
export async function uploadMembershipFees(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.body.cooperativeId || req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.body.year || req.query.year as string);
    const month = parseInt(req.body.month || req.query.month as string);
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const file = (req as any).file;
    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    // Parse file
    let records: Record<string, any>[];
    try {
      const rawData = parseFile(file.buffer, file.originalname);
      records = rawData.map(row => mapRow(row, membershipFeesColumnMap));
    } catch (error) {
      sendError(res, 'Failed to parse file', 400);
      return;
    }

    if (records.length === 0) {
      sendError(res, 'No valid records found in file', 400);
      return;
    }

    if (!overwrite) {
      const existingData = await prisma.membershipFee.findFirst({
        where: { cooperativeId, year, month },
      });

      if (existingData) {
        sendError(res, 'Data already exists for this period', 400);
        return;
      }
    }

    if (overwrite) {
      await prisma.membershipFee.deleteMany({
        where: { cooperativeId, year, month },
      });
    }

    // Map status values
    const statusMap: Record<string, FeeStatus> = {
      pagado: FeeStatus.up_to_date,
      parcial: FeeStatus.with_debt,
      pendiente: FeeStatus.with_debt,
      atrasado: FeeStatus.with_debt,
    };

    const validRecords = records.filter(r => r.memberId && r.memberName);
    if (validRecords.length > 0) {
      await prisma.membershipFee.createMany({
        data: validRecords.map((r) => {
          const expected = parseFloat(r.expectedContribution) || 0;
          const paid = parseFloat(r.paymentMade) || 0;
          const debt = expected - paid;

          return {
            cooperativeId,
            year,
            month,
            memberId: String(r.memberId),
            memberName: String(r.memberName),
            expectedContribution: expected,
            paymentMade: paid,
            debt: debt > 0 ? debt : 0,
            status: statusMap[String(r.status).toLowerCase()] || (debt > 0 ? FeeStatus.with_debt : FeeStatus.up_to_date),
          };
        }),
      });
    }

    await prisma.period.upsert({
      where: { cooperativeId_year_month: { cooperativeId, year, month } },
      update: {},
      create: { cooperativeId, year, month },
    });

    await prisma.uploadHistory.create({
      data: {
        cooperativeId,
        userId: req.user!.id,
        year,
        month,
        module: 'membership_fees',
        status: 'success',
        recordsCount: validRecords.length,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Importó Cuotas de Socios',
        details: `Período: ${month}/${year}, Registros: ${validRecords.length}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, {
      status: 'success',
      message: `Se importaron ${validRecords.length} registros de cuotas de socios`,
      recordsCount: validRecords.length,
    });
  } catch (error) {
    console.error('Upload membership fees error:', error);
    sendError(res, 'Failed to upload membership fees', 500);
  }
}

// Upload financial ratios from file
export async function uploadRatios(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.body.cooperativeId || req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.body.year || req.query.year as string);
    const month = parseInt(req.body.month || req.query.month as string);
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const file = (req as any).file;
    if (!file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    // Parse file
    let records: Record<string, any>[];
    try {
      const rawData = parseFile(file.buffer, file.originalname);
      records = rawData.map(row => mapRow(row, ratiosColumnMap));
    } catch (error) {
      sendError(res, 'Failed to parse file', 400);
      return;
    }

    if (records.length === 0) {
      sendError(res, 'No valid records found in file', 400);
      return;
    }

    // Delete existing if overwrite
    if (overwrite) {
      await prisma.financialRatio.deleteMany({
        where: { cooperativeId, year, month },
      });
    }

    // Map trend values
    const trendMap: Record<string, string> = {
      up: 'up',
      down: 'down',
      stable: 'stable',
      subiendo: 'up',
      bajando: 'down',
      estable: 'stable',
    };

    // Save ratios
    const validRecords = records.filter(r => r.name && r.value !== undefined);
    for (const ratio of validRecords) {
      await prisma.financialRatio.upsert({
        where: {
          cooperativeId_year_month_name: {
            cooperativeId,
            year,
            month,
            name: String(ratio.name),
          },
        },
        update: {
          value: parseFloat(ratio.value) || 0,
          trend: trendMap[String(ratio.trend).toLowerCase()] || 'stable',
          description: ratio.description ? String(ratio.description) : null,
        },
        create: {
          cooperativeId,
          year,
          month,
          name: String(ratio.name),
          value: parseFloat(ratio.value) || 0,
          trend: trendMap[String(ratio.trend).toLowerCase()] || 'stable',
          description: ratio.description ? String(ratio.description) : null,
        },
      });
    }

    await prisma.period.upsert({
      where: { cooperativeId_year_month: { cooperativeId, year, month } },
      update: {},
      create: { cooperativeId, year, month },
    });

    await prisma.uploadHistory.create({
      data: {
        cooperativeId,
        userId: req.user!.id,
        year,
        month,
        module: 'ratios',
        status: 'success',
        recordsCount: validRecords.length,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Importó Ratios Financieros',
        details: `Período: ${month}/${year}, Registros: ${validRecords.length}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, {
      status: 'success',
      message: `Se importaron ${validRecords.length} ratios financieros`,
      recordsCount: validRecords.length,
    });
  } catch (error) {
    console.error('Upload ratios error:', error);
    sendError(res, 'Failed to upload ratios', 500);
  }
}

// Get upload history
export async function getUploadHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const history = await prisma.uploadHistory.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { name: true },
        },
      },
    });

    const moduleNames: Record<string, string> = {
      balance_sheet: 'Balance General',
      cash_flow: 'Flujo de Caja',
      membership_fees: 'Cuotas de Socios',
      ratios: 'Ratios Financieros',
    };

    const formatted = history.map((h) => ({
      id: h.id,
      date: h.createdAt.toISOString(),
      user: h.user.name,
      period: `${h.month}/${h.year}`,
      modules: [moduleNames[h.module] || h.module],
      status: h.status,
      recordsCount: h.recordsCount,
      errorMessage: h.errorMessage,
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    sendError(res, 'Failed to get upload history', 500);
  }
}

// Get latest upload
export async function getLatestUpload(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const latest = await prisma.uploadHistory.findFirst({
      where: { cooperativeId, status: 'success' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
      },
    });

    if (!latest) {
      sendSuccess(res, null);
      return;
    }

    sendSuccess(res, {
      id: latest.id,
      date: latest.createdAt.toISOString(),
      user: latest.user.name,
      period: `${latest.month}/${latest.year}`,
      module: latest.module,
      status: latest.status,
    });
  } catch (error) {
    sendError(res, 'Failed to get latest upload', 500);
  }
}
