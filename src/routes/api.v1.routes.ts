import { Router } from 'express';
import { validateApiKeyV1 } from '../middleware/apiKey.middleware';
import { createPromoter } from '../controllers/promoter.api.controller';
import { resetPromoterPassword } from '../controllers/password.controller';

const router = Router();

// All v1 routes require X-API-KEY header
router.use(validateApiKeyV1);

// POST /api/v1/promoters/create
router.post('/promoters/create', createPromoter);

// POST /api/v1/promoters/reset-password
router.post('/promoters/reset-password', resetPromoterPassword);

export default router;
