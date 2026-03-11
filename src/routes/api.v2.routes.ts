import { Router } from 'express';
import { validateApiKeyV2 } from '../middleware/apiKey.middleware';
import { trackSale, trackSignup, trackRefund } from '../controllers/conversion.controller';
import { getPromoterById, searchPromoters } from '../controllers/promoter.api.controller';

const router = Router();

// All v2 routes require Bearer token + Account-ID header
router.use(validateApiKeyV2);

// Track endpoints
router.post('/track/sale', trackSale);
router.post('/track/signup', trackSignup);
router.post('/track/refund', trackRefund);

// Company/Promoter endpoints
router.get('/company/promoters/:id', getPromoterById);
router.get('/company/promoters', searchPromoters);

export default router;
