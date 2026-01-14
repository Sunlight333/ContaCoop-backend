import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getSettings,
  updateNotificationSettings,
  updateSecuritySettings,
  updateBackupSettings,
  getOdooStatus,
  saveOdooConfig,
  testOdooConnection,
  exportAllData,
} from '../controllers/settings.controller.js';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

// Settings
router.get('/', getSettings);
router.put('/notifications', updateNotificationSettings);
router.put('/security', updateSecuritySettings);
router.put('/backups', updateBackupSettings);

// Odoo
router.get('/odoo/status', getOdooStatus);
router.put('/odoo/config', saveOdooConfig);
router.post('/odoo/test', testOdooConnection);

// Data export
router.get('/data/export', exportAllData);

export default router;
