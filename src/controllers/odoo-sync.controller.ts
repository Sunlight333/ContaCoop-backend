import { Response } from 'express';
import odooService from '../services/odoo.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest } from '../types/index.js';
import prisma from '../config/database.js';

// Sync Balance Sheet from Odoo
export async function syncBalanceSheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const { year, month } = req.body;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const result = await odooService.fetchBalanceSheet(cooperativeId, Number(year), Number(month));

    if (!result.success) {
      sendError(res, result.error || 'Failed to sync from Odoo', 400);
      return;
    }

    // Save to database
    const entries = result.records.map((record: any) => ({
      cooperativeId,
      year: Number(year),
      month: Number(month),
      accountCode: String(record.accountCode || ''),
      accountName: String(record.accountName || ''),
      category: record.category,
      subcategory: record.subcategory || record.category,
      initialDebit: record.initialDebit || 0,
      initialCredit: record.initialCredit || 0,
      periodDebit: record.periodDebit || 0,
      periodCredit: record.periodCredit || 0,
      finalDebit: record.finalDebit || 0,
      finalCredit: record.finalCredit || 0,
      odooId: record.odooId || null,
    }));

    // Delete existing entries for this period and create new ones
    await prisma.balanceSheetEntry.deleteMany({
      where: { cooperativeId, year: Number(year), month: Number(month) },
    });

    await prisma.balanceSheetEntry.createMany({
      data: entries,
    });

    await odooService.updateLastSync(cooperativeId);

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: `Sincronizó Balance General desde Odoo (${month}/${year})`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, { recordsCount: entries.length }, 'Balance sheet synced successfully');
  } catch (error) {
    console.error('Sync error:', error);
    sendError(res, 'Failed to sync balance sheet from Odoo', 500);
  }
}

// Sync Cash Flow from Odoo
export async function syncCashFlow(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const { year, month } = req.body;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const result = await odooService.fetchCashFlow(cooperativeId, Number(year), Number(month));

    if (!result.success) {
      sendError(res, result.error || 'Failed to sync from Odoo', 400);
      return;
    }

    // Save to database
    const entries = result.records.map((record: any) => ({
      cooperativeId,
      year: Number(year),
      month: Number(month),
      description: record.description,
      amount: record.amount || 0,
      category: record.category,
      odooId: record.odooId || null,
    }));

    // Delete existing entries for this period and create new ones
    await prisma.cashFlowEntry.deleteMany({
      where: { cooperativeId, year: Number(year), month: Number(month) },
    });

    await prisma.cashFlowEntry.createMany({
      data: entries,
    });

    await odooService.updateLastSync(cooperativeId);

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: `Sincronizó Flujo de Caja desde Odoo (${month}/${year})`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, { recordsCount: entries.length }, 'Cash flow synced successfully');
  } catch (error) {
    console.error('Sync error:', error);
    sendError(res, 'Failed to sync cash flow from Odoo', 500);
  }
}

// Sync Membership Fees from Odoo
export async function syncMembershipFees(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const { year, month } = req.body;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    if (!year || !month) {
      sendError(res, 'Year and month are required', 400);
      return;
    }

    const result = await odooService.fetchMembershipFees(cooperativeId, Number(year), Number(month));

    if (!result.success) {
      sendError(res, result.error || 'Failed to sync from Odoo', 400);
      return;
    }

    // Save to database
    const entries = result.records.map((record: any) => ({
      cooperativeId,
      year: Number(year),
      month: Number(month),
      memberId: record.memberId,
      memberName: record.memberName,
      expectedContribution: record.expectedContribution || 0,
      paymentMade: record.paymentMade || 0,
      debt: record.debt || 0,
      status: record.status || 'with_debt',
      odooPartnerId: record.odooPartnerId || null,
    }));

    // Delete existing entries for this period and create new ones
    await prisma.membershipFee.deleteMany({
      where: { cooperativeId, year: Number(year), month: Number(month) },
    });

    await prisma.membershipFee.createMany({
      data: entries,
    });

    await odooService.updateLastSync(cooperativeId);

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: `Sincronizó Cuotas de Socios desde Odoo (${month}/${year})`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, { recordsCount: entries.length }, 'Membership fees synced successfully');
  } catch (error) {
    console.error('Sync error:', error);
    sendError(res, 'Failed to sync membership fees from Odoo', 500);
  }
}
