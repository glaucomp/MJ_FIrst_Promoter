import { Router } from 'express';
import { trackClickByRef, getReferralInfo } from '../controllers/click.controller';

const router = Router();

// Public endpoints (no authentication required)

// GET /api/public/referral?ref=username
// Get referral info from ref parameter (used by frontend to identify promoter)
router.get('/referral', getReferralInfo);

// POST /api/public/track-click
// Track click from ?ref=username URL parameter
router.post('/track-click', trackClickByRef);

export default router;
