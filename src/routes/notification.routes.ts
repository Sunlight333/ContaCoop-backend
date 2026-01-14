import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  sendNotification,
  getNotificationHistory,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from '../controllers/notification.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User notifications (all users)
router.get('/me', getMyNotifications);
router.get('/me/unread-count', getUnreadCount);
router.put('/me/read-all', markAllNotificationsAsRead);
router.put('/:notificationId/read', markNotificationAsRead);

// Admin notifications
router.post('/send', requireAdmin, sendNotification);
router.get('/history', requireAdmin, getNotificationHistory);

export default router;
