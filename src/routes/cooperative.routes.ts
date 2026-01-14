import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getCooperatives,
  getCooperativeInfo,
  updateCooperativeInfo,
  createCooperative,
} from '../controllers/cooperative.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get cooperatives user can access
router.get('/', getCooperatives);

// Get cooperative details
router.get('/info', getCooperativeInfo);

// Update cooperative info (admin only)
router.put('/info', requireAdmin, updateCooperativeInfo);

// Create new cooperative (admin only)
router.post('/', requireAdmin, createCooperative);

export default router;
