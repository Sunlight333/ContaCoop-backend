import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  uploadBalanceSheet,
  uploadCashFlow,
  uploadMembershipFees,
  uploadRatios,
  uploadUsers,
  getUploadHistory,
  getLatestUpload,
} from '../controllers/upload.controller.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel and CSV files
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/csv',
    ];
    const allowedExts = ['.xlsx', '.xls', '.csv'];

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  },
});

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

// Upload endpoints (now accept file uploads)
router.post('/balance-sheet', upload.single('file'), uploadBalanceSheet);
router.post('/cash-flow', upload.single('file'), uploadCashFlow);
router.post('/membership-fees', upload.single('file'), uploadMembershipFees);
router.post('/ratios', upload.single('file'), uploadRatios);
router.post('/users', upload.single('file'), uploadUsers);

// History
router.get('/history', getUploadHistory);
router.get('/latest', getLatestUpload);

export default router;
