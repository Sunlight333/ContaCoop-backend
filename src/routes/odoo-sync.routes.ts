import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  syncBalanceSheet,
  syncCashFlow,
  syncMembershipFees,
} from '../controllers/odoo-sync.controller.js';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

// Sync from Odoo
router.post('/balance-sheet', syncBalanceSheet);
router.post('/cash-flow', syncCashFlow);
router.post('/membership-fees', syncMembershipFees);

export default router;
