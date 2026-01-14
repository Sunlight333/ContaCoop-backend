import { Router } from 'express';
import authRoutes from './auth.routes.js';
import cooperativeRoutes from './cooperative.routes.js';
import uploadRoutes from './upload.routes.js';
import financialRoutes from './financial.routes.js';
import userRoutes from './user.routes.js';
import notificationRoutes from './notification.routes.js';
import settingsRoutes from './settings.routes.js';
import odooSyncRoutes from './odoo-sync.routes.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/cooperatives', cooperativeRoutes);
router.use('/upload', uploadRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);
router.use('/odoo/sync', odooSyncRoutes);

// Financial data routes (mounted at root for cleaner URLs)
router.use('/', financialRoutes);

export default router;
