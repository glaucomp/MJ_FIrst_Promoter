import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';
import { getMyPromoterLink } from '../controllers/promoter-link.controller';

const router = Router();

// Get dashboard stats for current user
router.get('/stats', authenticate, dashboardController.getDashboardStats);

// Get recent activity
router.get('/activity', authenticate, dashboardController.getRecentActivity);

// Get earnings/commissions
router.get('/earnings', authenticate, dashboardController.getEarnings);

// Get team earnings breakdown (for team managers)
router.get('/team-earnings', authenticate, dashboardController.getTeamEarningsBreakdown);

// Get top performers (for superuser and account managers)
router.get('/top-performers', authenticate, dashboardController.getTopPerformers);

// Get promoter's permanent referral link (username-based)
router.get('/my-link', authenticate, getMyPromoterLink);

export default router;
