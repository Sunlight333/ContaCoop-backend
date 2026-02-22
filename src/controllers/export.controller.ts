import { Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../config/database.js';
import { sendError } from '../utils/response.js';
import { AuthRequest } from '../types/index.js';

// Export Balance Sheet to Excel
export async function exportBalanceSheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const entries = await prisma.balanceSheetEntry.findMany({
      where: { cooperativeId, year, month },
      orderBy: [{ category: 'asc' }, { accountCode: 'asc' }],
    });

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CoopFinanzas';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Balance General');

    // Header
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = cooperative?.name || 'Cooperativa';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:H2');
    worksheet.getCell('A2').value = `Balance de Comprobación - ${month}/${year}`;
    worksheet.getCell('A2').font = { size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Column headers
    worksheet.getRow(4).values = [
      'Código',
      'Nombre de Cuenta',
      'Inicial (Db)',
      'Inicial (Cr)',
      'Período (Db)',
      'Período (Cr)',
      'Final (Db)',
      'Final (Cr)',
    ];
    worksheet.getRow(4).font = { bold: true };
    worksheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Column widths
    worksheet.columns = [
      { width: 12 },
      { width: 35 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    let rowIndex = 5;

    // Group by category
    const categories = ['assets', 'liabilities', 'equity'] as const;
    const categoryNames = { assets: 'ACTIVOS', liabilities: 'PASIVOS', equity: 'PATRIMONIO' };

    for (const category of categories) {
      const categoryEntries = entries.filter((e) => e.category === category);

      // Category header
      worksheet.getRow(rowIndex).values = [categoryNames[category]];
      worksheet.getRow(rowIndex).font = { bold: true };
      worksheet.getRow(rowIndex).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: category === 'assets' ? 'FFE3F2FD' : category === 'liabilities' ? 'FFFCE4EC' : 'FFF3E5F5' },
      };
      rowIndex++;

      // Entries
      for (const entry of categoryEntries) {
        worksheet.getRow(rowIndex).values = [
          entry.accountCode,
          entry.accountName,
          entry.initialDebit || '',
          entry.initialCredit || '',
          entry.periodDebit || '',
          entry.periodCredit || '',
          entry.finalDebit || '',
          entry.finalCredit || '',
        ];
        rowIndex++;
      }

      // Subtotal
      const totalDebit = categoryEntries.reduce((sum, e) => sum + e.finalDebit, 0);
      const totalCredit = categoryEntries.reduce((sum, e) => sum + e.finalCredit, 0);
      worksheet.getRow(rowIndex).values = [
        '',
        `Total ${categoryNames[category]}`,
        '',
        '',
        '',
        '',
        totalDebit || '',
        totalCredit || '',
      ];
      worksheet.getRow(rowIndex).font = { bold: true };
      rowIndex++;
      rowIndex++; // Empty row
    }

    // Format currency columns
    for (let col = 3; col <= 8; col++) {
      worksheet.getColumn(col).numFmt = '$#,##0.00';
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Exportó Balance General',
        details: `Período: ${month}/${year}`,
        ipAddress: req.ip,
      },
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="balance-sheet-${year}-${month}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export balance sheet error:', error);
    sendError(res, 'Failed to export balance sheet', 500);
  }
}

// Export Cash Flow to Excel
export async function exportCashFlow(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const entries = await prisma.cashFlowEntry.findMany({
      where: { cooperativeId, year, month },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
    });

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Flujo de Caja');

    // Header
    worksheet.mergeCells('A1:B1');
    worksheet.getCell('A1').value = cooperative?.name || 'Cooperativa';
    worksheet.getCell('A1').font = { size: 16, bold: true };

    worksheet.mergeCells('A2:B2');
    worksheet.getCell('A2').value = `Estado de Flujo de Caja - ${month}/${year}`;
    worksheet.getCell('A2').font = { size: 12 };

    worksheet.columns = [{ width: 50 }, { width: 20 }];

    let rowIndex = 4;
    const categories = ['operating', 'investing', 'financing'] as const;
    const categoryNames = {
      operating: 'Actividades de Operación',
      investing: 'Actividades de Inversión',
      financing: 'Actividades de Financiamiento',
    };

    for (const category of categories) {
      const categoryEntries = entries.filter((e) => e.category === category);

      worksheet.getRow(rowIndex).values = [categoryNames[category]];
      worksheet.getRow(rowIndex).font = { bold: true };
      worksheet.getRow(rowIndex).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      rowIndex++;

      for (const entry of categoryEntries) {
        worksheet.getRow(rowIndex).values = [entry.description, entry.amount];
        rowIndex++;
      }

      const subtotal = categoryEntries.reduce((sum, e) => sum + e.amount, 0);
      worksheet.getRow(rowIndex).values = ['Subtotal', subtotal];
      worksheet.getRow(rowIndex).font = { bold: true };
      rowIndex++;
      rowIndex++;
    }

    // Net Cash Flow
    const netCashFlow = entries.reduce((sum, e) => sum + e.amount, 0);
    worksheet.getRow(rowIndex).values = ['FLUJO DE CAJA NETO', netCashFlow];
    worksheet.getRow(rowIndex).font = { bold: true, size: 14 };

    worksheet.getColumn(2).numFmt = '$#,##0.00';

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Exportó Flujo de Caja',
        details: `Período: ${month}/${year}`,
        ipAddress: req.ip,
      },
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cash-flow-${year}-${month}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    sendError(res, 'Failed to export cash flow', 500);
  }
}

// Export Membership Fees to Excel
export async function exportMembershipFees(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const fees = await prisma.membershipFee.findMany({
      where: { cooperativeId, year, month },
      orderBy: { memberName: 'asc' },
    });

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cuotas de Socios');

    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = cooperative?.name || 'Cooperativa';
    worksheet.getCell('A1').font = { size: 16, bold: true };

    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = `Cuotas de Socios - ${month}/${year}`;
    worksheet.getCell('A2').font = { size: 12 };

    worksheet.getRow(4).values = [
      'ID Socio',
      'Nombre',
      'Cuota Esperada',
      'Monto Pagado',
      'Deuda',
      'Estado',
    ];
    worksheet.getRow(4).font = { bold: true };
    worksheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    worksheet.columns = [
      { width: 12 },
      { width: 30 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 15 },
    ];

    let rowIndex = 5;
    for (const fee of fees) {
      worksheet.getRow(rowIndex).values = [
        fee.memberId,
        fee.memberName,
        fee.expectedContribution,
        fee.paymentMade,
        fee.debt,
        fee.status === 'up_to_date' ? 'Al día' : 'Con deuda',
      ];
      rowIndex++;
    }

    // Totals
    const totalExpected = fees.reduce((sum, f) => sum + f.expectedContribution, 0);
    const totalPaid = fees.reduce((sum, f) => sum + f.paymentMade, 0);
    const totalDebt = fees.reduce((sum, f) => sum + f.debt, 0);

    rowIndex++;
    worksheet.getRow(rowIndex).values = ['', 'TOTALES', totalExpected, totalPaid, totalDebt, ''];
    worksheet.getRow(rowIndex).font = { bold: true };

    for (let col = 3; col <= 5; col++) {
      worksheet.getColumn(col).numFmt = '$#,##0.00';
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Exportó Cuotas de Socios',
        details: `Período: ${month}/${year}`,
        ipAddress: req.ip,
      },
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="membership-fees-${year}-${month}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    sendError(res, 'Failed to export membership fees', 500);
  }
}

// Helper: Calculate financial ratios from balance sheet and cash flow data
async function calculateRatiosForExport(cooperativeId: string, year: number, month: number) {
  const balanceEntries = await prisma.balanceSheetEntry.findMany({
    where: { cooperativeId, year, month },
  });
  const cashFlowEntries = await prisma.cashFlowEntry.findMany({
    where: { cooperativeId, year, month },
  });

  const currentAssetSubs = [
    'asset_receivable', 'asset_cash', 'asset_current', 'asset_prepayments',
    'current_assets', 'cash', 'receivable', 'current', 'prepayments',
    'activo corriente',
  ];
  const currentLiabilitySubs = [
    'liability_payable', 'liability_credit_card', 'liability_current',
    'current_liabilities', 'payable',
    'pasivo corriente',
  ];

  const totalAssets = balanceEntries.filter(e => e.category === 'assets').reduce((sum, e) => sum + e.finalDebit - e.finalCredit, 0);
  const totalLiabilities = balanceEntries.filter(e => e.category === 'liabilities').reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);
  const totalEquity = balanceEntries.filter(e => e.category === 'equity').reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);
  const currentAssets = balanceEntries.filter(e => e.category === 'assets' && e.subcategory && currentAssetSubs.includes(e.subcategory.toLowerCase())).reduce((sum, e) => sum + e.finalDebit - e.finalCredit, 0);
  const currentLiabilities = balanceEntries.filter(e => e.category === 'liabilities' && e.subcategory && currentLiabilitySubs.includes(e.subcategory.toLowerCase())).reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);
  const effectiveCurrentAssets = currentAssets > 0 ? currentAssets : totalAssets;
  const effectiveCurrentLiabilities = currentLiabilities > 0 ? currentLiabilities : totalLiabilities;

  const operatingEntries = cashFlowEntries.filter(e => e.category === 'operating');
  const operatingRevenue = operatingEntries.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const netOperatingIncome = operatingEntries.reduce((sum, e) => sum + e.amount, 0);

  return [
    { name: 'Liquidez Corriente', value: effectiveCurrentLiabilities !== 0 ? effectiveCurrentAssets / effectiveCurrentLiabilities : 0, isPercentage: false, description: 'Capacidad de pago a corto plazo' },
    { name: 'Endeudamiento', value: totalAssets !== 0 ? totalLiabilities / totalAssets : 0, isPercentage: true, description: 'Nivel de endeudamiento' },
    { name: 'Rentabilidad del Patrimonio', value: totalEquity !== 0 ? netOperatingIncome / totalEquity : 0, isPercentage: true, description: 'Rentabilidad para los socios' },
    { name: 'Margen Operacional', value: operatingRevenue !== 0 ? netOperatingIncome / operatingRevenue : 0, isPercentage: true, description: 'Eficiencia operativa' },
  ];
}

// Export Financial Ratios to Excel (calculated from Balance Sheet)
export async function exportRatios(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const ratios = await calculateRatiosForExport(cooperativeId, year, month);

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ratios Financieros');

    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = cooperative?.name || 'Cooperativa';
    worksheet.getCell('A1').font = { size: 16, bold: true };

    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = `Ratios Financieros - ${month}/${year}`;
    worksheet.getCell('A2').font = { size: 12 };

    worksheet.getRow(4).values = ['Ratio', 'Valor', 'Formato', 'Descripción'];
    worksheet.getRow(4).font = { bold: true };
    worksheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    worksheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 12 },
      { width: 40 },
    ];

    let rowIndex = 5;
    for (const ratio of ratios) {
      worksheet.getRow(rowIndex).values = [
        ratio.name,
        ratio.isPercentage ? `${(ratio.value * 100).toFixed(1)}%` : ratio.value.toFixed(2),
        ratio.isPercentage ? 'Porcentaje' : 'Valor',
        ratio.description,
      ];
      rowIndex++;
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Exportó Ratios Financieros',
        details: `Período: ${month}/${year}`,
        ipAddress: req.ip,
      },
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-ratios-${year}-${month}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    sendError(res, 'Failed to export ratios', 500);
  }
}
