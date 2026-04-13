import { NextFunction, Response, Router } from 'express';
import { UserType } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { textToSpeech, transcribe } from '../controllers/elevenlabs.controller';

const router = Router();

const ELEVENLABS_ALLOWED_USER_TYPES = new Set<UserType>([UserType.CHATTER]);

const ELEVENLABS_RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const ELEVENLABS_RATE_LIMIT_MAX_REQUESTS = 10;
const elevenLabsRequestLog = new Map<string, number[]>();

const authorizeElevenLabsAccess = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userType = req.user?.userType;
  if (!userType || !ELEVENLABS_ALLOWED_USER_TYPES.has(userType)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};

const elevenLabsRateLimit = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  const now = Date.now();
  const windowStart = now - ELEVENLABS_RATE_LIMIT_WINDOW_MS;

  const recentRequests = (elevenLabsRequestLog.get(identifier) ?? []).filter(
    (ts) => ts > windowStart,
  );

  if (recentRequests.length >= ELEVENLABS_RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  recentRequests.push(now);
  elevenLabsRequestLog.set(identifier, recentRequests);
  next();
};

router.post('/tts', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, textToSpeech);
router.post('/transcribe', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, transcribe);

export default router;
