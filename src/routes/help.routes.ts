import { Request, Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';
import {
  getHelpVideos,
  adminListVideos,
  adminCreateVideo,
  adminUpdateVideo,
  adminDeleteVideo,
} from '../controllers/help.controller';

const router = Router();
const rateLimitKeyByUserOrIp = (req: Request) => {
  const authReq = req as AuthRequest;
  return authReq.user?.id ? `user:${authReq.user.id}` : ipKeyGenerator(req.ip ?? 'unknown');
};
const helpRoutesRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  limit: 30,
  keyGenerator: rateLimitKeyByUserOrIp,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// User-facing: returns videos for the logged-in user's type
router.get('/', helpRoutesRateLimit, authenticate, getHelpVideos);

// Admin management
router.get('/admin', helpRoutesRateLimit, authenticate, authorize(UserRole.ADMIN), adminListVideos);
router.post('/admin', helpRoutesRateLimit, authenticate, authorize(UserRole.ADMIN), adminCreateVideo);
router.put('/admin/:id', helpRoutesRateLimit, authenticate, authorize(UserRole.ADMIN), adminUpdateVideo);
router.delete('/admin/:id', helpRoutesRateLimit, authenticate, authorize(UserRole.ADMIN), adminDeleteVideo);

export default router;
