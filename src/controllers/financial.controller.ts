import { Response } from 'express';
import prisma from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, DashboardKPI, BalanceSheetSummary, CashFlowSummary, MembershipFeeSummary } from '../types/index.js';

// Get available periods
export async function getPeriods(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const periods = await prisma.period.findMany({
      where: { cooperativeId, isActive: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true },
    });

    // If no periods in DB, generate last 24 months
    if (periods.length === 0) {
      const generatedPeriods = [];
      const now = new Date();
      for (let i = 0; i < 24; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        generatedPeriods.push({
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        });
      }
      sendSuccess(res, generatedPeriods);
      return;
    }

    sendSuccess(res, periods);
  } catch (error) {
    sendError(res, 'Failed to get periods', 500);
  }
}

// Dashboard KPIs
export async function getDashboardKPIs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    // Get balance sheet data
    const balanceData = await prisma.balanceSheetEntry.findMany({
      where: { cooperativeId, year, month },
    });

    const totalAssets = balanceData
      .filter((e) => e.category === 'assets')
      .reduce((sum, e) => sum + e.finalDebit - e.finalCredit, 0);

    const totalLiabilities = balanceData
      .filter((e) => e.category === 'liabilities')
      .reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);

    // Get cash flow data
    const cashFlowData = await prisma.cashFlowEntry.findMany({
      where: { cooperativeId, year, month },
    });

    const netCashFlow = cashFlowData.reduce((sum, e) => sum + e.amount, 0);

    // Get ratios
    const ratios = await prisma.financialRatio.findMany({
      where: { cooperativeId, year, month },
    });

    const debtRatio = ratios.find((r) => r.name === 'Debt to Assets')?.value || 0;

    // Get previous period for comparison
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const prevBalanceData = await prisma.balanceSheetEntry.findMany({
      where: { cooperativeId, year: prevYear, month: prevMonth },
    });

    const prevTotalAssets = prevBalanceData
      .filter((e) => e.category === 'assets')
      .reduce((sum, e) => sum + e.finalDebit - e.finalCredit, 0);

    const prevCashFlowData = await prisma.cashFlowEntry.findMany({
      where: { cooperativeId, year: prevYear, month: prevMonth },
    });

    const prevNetCashFlow = prevCashFlowData.reduce((sum, e) => sum + e.amount, 0);

    const kpis: DashboardKPI[] = [
      {
        id: '1',
        label: 'Activos Totales',
        value: totalAssets,
        previousValue: prevTotalAssets,
        trend: totalAssets > prevTotalAssets ? 'up' : totalAssets < prevTotalAssets ? 'down' : 'stable',
        format: 'currency',
      },
      {
        id: '2',
        label: 'Ingreso Neto',
        value: totalAssets - totalLiabilities,
        previousValue: prevTotalAssets - (prevBalanceData.filter((e) => e.category === 'liabilities').reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0)),
        trend: 'up',
        format: 'currency',
      },
      {
        id: '3',
        label: 'Flujo de Caja',
        value: netCashFlow,
        previousValue: prevNetCashFlow,
        trend: netCashFlow > prevNetCashFlow ? 'up' : netCashFlow < prevNetCashFlow ? 'down' : 'stable',
        format: 'currency',
      },
      {
        id: '4',
        label: 'Ratio de Deuda',
        value: debtRatio,
        trend: debtRatio < 0.5 ? 'up' : 'down',
        format: 'percentage',
      },
    ];

    sendSuccess(res, kpis);
  } catch (error) {
    console.error('Dashboard KPIs error:', error);
    sendError(res, 'Failed to get dashboard KPIs', 500);
  }
}

// Balance Sheet
export async function getBalanceSheet(req: AuthRequest, res: Response): Promise<void> {
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

    // Calculate totals
    const totalAssets = entries
      .filter((e) => e.category === 'assets')
      .reduce((sum, e) => sum + e.finalDebit - e.finalCredit, 0);

    const totalLiabilities = entries
      .filter((e) => e.category === 'liabilities')
      .reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);

    const totalEquity = entries
      .filter((e) => e.category === 'equity')
      .reduce((sum, e) => sum + e.finalCredit - e.finalDebit, 0);

    const summary: BalanceSheetSummary = {
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };

    sendSuccess(res, { entries, summary });
  } catch (error) {
    sendError(res, 'Failed to get balance sheet', 500);
  }
}

// Cash Flow
export async function getCashFlow(req: AuthRequest, res: Response): Promise<void> {
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

    const operating = entries.filter((e) => e.category === 'operating');
    const investing = entries.filter((e) => e.category === 'investing');
    const financing = entries.filter((e) => e.category === 'financing');

    const summary: CashFlowSummary = {
      operating: operating.reduce((sum, e) => sum + e.amount, 0),
      investing: investing.reduce((sum, e) => sum + e.amount, 0),
      financing: financing.reduce((sum, e) => sum + e.amount, 0),
      netCashFlow: entries.reduce((sum, e) => sum + e.amount, 0),
    };

    sendSuccess(res, { entries, summary });
  } catch (error) {
    sendError(res, 'Failed to get cash flow', 500);
  }
}

// Cash Flow Summary
export async function getCashFlowSummary(req: AuthRequest, res: Response): Promise<void> {
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
    });

    const summary: CashFlowSummary = {
      operating: entries.filter((e) => e.category === 'operating').reduce((sum, e) => sum + e.amount, 0),
      investing: entries.filter((e) => e.category === 'investing').reduce((sum, e) => sum + e.amount, 0),
      financing: entries.filter((e) => e.category === 'financing').reduce((sum, e) => sum + e.amount, 0),
      netCashFlow: entries.reduce((sum, e) => sum + e.amount, 0),
    };

    sendSuccess(res, summary);
  } catch (error) {
    sendError(res, 'Failed to get cash flow summary', 500);
  }
}

// Cash Flow History (6 months)
export async function getCashFlowHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const months = parseInt(req.query.months as string) || 6;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const history = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const entries = await prisma.cashFlowEntry.findMany({
        where: { cooperativeId, year, month },
      });

      history.push({
        year,
        month,
        period: `${month}/${year}`,
        operating: entries.filter((e) => e.category === 'operating').reduce((sum, e) => sum + e.amount, 0),
        investing: entries.filter((e) => e.category === 'investing').reduce((sum, e) => sum + e.amount, 0),
        financing: entries.filter((e) => e.category === 'financing').reduce((sum, e) => sum + e.amount, 0),
        net: entries.reduce((sum, e) => sum + e.amount, 0),
      });
    }

    sendSuccess(res, history.reverse());
  } catch (error) {
    sendError(res, 'Failed to get cash flow history', 500);
  }
}

// Membership Fees
export async function getMembershipFees(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const search = req.query.search as string;
    const status = req.query.status as string;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    // For socio users, only show their own data
    const where: any = { cooperativeId, year, month };

    if (req.user?.role === 'socio' && req.user.memberId) {
      where.memberId = req.user.memberId;
    }

    if (search) {
      where.OR = [
        { memberName: { contains: search, mode: 'insensitive' } },
        { memberId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status === 'up-to-date' ? 'up_to_date' : 'with_debt';
    }

    const fees = await prisma.membershipFee.findMany({
      where,
      orderBy: { memberName: 'asc' },
    });

    // Calculate summary
    const allFees = await prisma.membershipFee.findMany({
      where: { cooperativeId, year, month },
    });

    const summary: MembershipFeeSummary = {
      totalExpected: allFees.reduce((sum, f) => sum + f.expectedContribution, 0),
      totalPaid: allFees.reduce((sum, f) => sum + f.paymentMade, 0),
      totalDebt: allFees.reduce((sum, f) => sum + f.debt, 0),
      membersWithDebt: allFees.filter((f) => f.status === 'with_debt').length,
      totalMembers: allFees.length,
      collectionRate: allFees.length > 0
        ? (allFees.reduce((sum, f) => sum + f.paymentMade, 0) /
           allFees.reduce((sum, f) => sum + f.expectedContribution, 0)) * 100
        : 0,
    };

    sendSuccess(res, { fees, summary });
  } catch (error) {
    sendError(res, 'Failed to get membership fees', 500);
  }
}

// Get my membership fees (for socio)
export async function getMyMembershipFees(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId || !req.user?.memberId) {
      sendError(res, 'Member ID not found', 400);
      return;
    }

    const fees = await prisma.membershipFee.findMany({
      where: {
        cooperativeId,
        memberId: req.user.memberId,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    sendSuccess(res, fees);
  } catch (error) {
    sendError(res, 'Failed to get membership fees', 500);
  }
}

// Financial Ratios
export async function getFinancialRatios(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const ratios = await prisma.financialRatio.findMany({
      where: { cooperativeId, year, month },
    });

    // Get history for each ratio (last 6 months)
    const ratiosWithHistory = await Promise.all(
      ratios.map(async (ratio) => {
        const history = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date(year, month - 1 - i, 1);
          const hYear = date.getFullYear();
          const hMonth = date.getMonth() + 1;

          const historyEntry = await prisma.financialRatio.findFirst({
            where: { cooperativeId, year: hYear, month: hMonth, name: ratio.name },
          });

          history.push({
            period: `${hMonth}/${hYear}`,
            value: historyEntry?.value || 0,
          });
        }

        return {
          id: ratio.id,
          name: ratio.name,
          value: ratio.value,
          trend: ratio.trend,
          description: ratio.description,
          history,
        };
      })
    );

    sendSuccess(res, ratiosWithHistory);
  } catch (error) {
    sendError(res, 'Failed to get financial ratios', 500);
  }
}

// Ratio History
export async function getRatioHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const months = parseInt(req.query.months as string) || 6;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const history = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const ratios = await prisma.financialRatio.findMany({
        where: { cooperativeId, year, month },
      });

      history.push({
        year,
        month,
        period: `${month}/${year}`,
        ratios: ratios.map((r) => ({ name: r.name, value: r.value })),
      });
    }

    sendSuccess(res, history);
  } catch (error) {
    sendError(res, 'Failed to get ratio history', 500);
  }
}
