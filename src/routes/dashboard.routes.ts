import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Get dashboard stats for current user
router.get('/stats', authenticate, dashboardController.getDashboardStats);

// Get recent activity
router.get('/activity', authenticate, dashboardController.getRecentActivity);

// Get earnings/commissions
router.get('/earnings', authenticate, dashboardController.getEarnings);

// Get top performers (for superuser and account managers)
router.get('/top-performers', authenticate, dashboardController.getTopPerformers);

export default router;
