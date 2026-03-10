import { Router } from 'express';
import { body } from 'express-validator';
import * as campaignController from '../controllers/campaign.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// Create campaign (superuser only)
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  [
    body('name').trim().notEmpty(),
    body('websiteUrl').isURL(),
    body('commissionRate').isFloat({ min: 0, max: 100 }),
    body('secondaryRate').optional().isFloat({ min: 0, max: 100 })
  ],
  campaignController.createCampaign
);

// Get all campaigns (role-based filtering)
router.get('/', authenticate, campaignController.getAllCampaigns);

// Get campaign by ID
router.get('/:id', authenticate, campaignController.getCampaignById);

// Update campaign (superuser only)
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  campaignController.updateCampaign
);

// Delete campaign (superuser only)
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  campaignController.deleteCampaign
);

// Get campaign statistics
router.get('/:id/stats', authenticate, campaignController.getCampaignStats);

export default router;
