import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  login,
  register,
  logout,
  getCurrentUser,
  changePassword,
  getUserActivity,
} from '../controllers/auth.controller.js';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);
router.put('/me/password', authenticate, changePassword);
router.get('/me/activity', authenticate, getUserActivity);

export default router;
