import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getUsers,
  createUser,
  changeUserRole,
  changeUserStatus,
  resetUserPassword,
  getUserById,
} from '../controllers/user.controller.js';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

// User management
router.get('/', getUsers);
router.post('/', createUser);
router.get('/:userId', getUserById);
router.put('/:userId/role', changeUserRole);
router.put('/:userId/status', changeUserStatus);
router.post('/:userId/reset-password', resetUserPassword);

export default router;
