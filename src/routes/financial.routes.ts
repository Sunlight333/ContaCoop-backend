import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPeriods,
  getDashboardKPIs,
  getBalanceSheet,
  getCashFlow,
  getCashFlowSummary,
  getCashFlowHistory,
  getMembershipFees,
  getMyMembershipFees,
  getFinancialRatios,
  getRatioHistory,
} from '../controllers/financial.controller.js';
import {
  exportBalanceSheet,
  exportCashFlow,
  exportMembershipFees,
  exportRatios,
} from '../controllers/export.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Periods
router.get('/periods', getPeriods);

// Dashboard
router.get('/dashboard/kpis', getDashboardKPIs);

// Balance Sheet
router.get('/balance-sheet', getBalanceSheet);
router.get('/balance-sheet/export', exportBalanceSheet);

// Cash Flow
router.get('/cash-flow', getCashFlow);
router.get('/cash-flow/summary', getCashFlowSummary);
router.get('/cash-flow/history', getCashFlowHistory);
router.get('/cash-flow/export', exportCashFlow);

// Membership Fees
router.get('/membership-fees', getMembershipFees);
router.get('/membership-fees/me', getMyMembershipFees);
router.get('/membership-fees/export', exportMembershipFees);

// Financial Ratios
router.get('/ratios', getFinancialRatios);
router.get('/ratios/history', getRatioHistory);
router.get('/ratios/export', exportRatios);

export default router;
