import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';
import {
  getHelpVideos,
  adminListVideos,
  adminCreateVideo,
  adminUpdateVideo,
  adminDeleteVideo,
} from '../controllers/help.controller';

const router = Router();

// User-facing: returns videos for the logged-in user's type
router.get('/', authenticate, getHelpVideos);

// Admin management
router.get('/admin', authenticate, authorize(UserRole.ADMIN), adminListVideos);
router.post('/admin', authenticate, authorize(UserRole.ADMIN), adminCreateVideo);
router.put('/admin/:id', authenticate, authorize(UserRole.ADMIN), adminUpdateVideo);
router.delete('/admin/:id', authenticate, authorize(UserRole.ADMIN), adminDeleteVideo);

export default router;
