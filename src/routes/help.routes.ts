import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
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
router.get('/admin', authenticate, adminListVideos);
router.post('/admin', authenticate, adminCreateVideo);
router.put('/admin/:id', authenticate, adminUpdateVideo);
router.delete('/admin/:id', authenticate, adminDeleteVideo);

export default router;
