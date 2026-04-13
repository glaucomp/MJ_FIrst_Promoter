import { NextFunction, Response, Router } from 'express';
import multer from 'multer';
import { UserType } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { textToSpeech, transcribe } from '../controllers/elevenlabs.controller';

const router = Router();

const ELEVENLABS_ALLOWED_USER_TYPES = new Set<UserType>([UserType.CHATTER]);

const ELEVENLABS_RATE_LIMIT_WINDOW_MS = 60 * 1_000;
const ELEVENLABS_RATE_LIMIT_MAX_REQUESTS = 10;
const elevenLabsRequestLog = new Map<string, number[]>();

// Periodically evict entries whose entire window has expired so the map
// does not grow without bound over long-running server lifetimes.
setInterval(() => {
  const cutoff = Date.now() - ELEVENLABS_RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of elevenLabsRequestLog) {
    if (timestamps.every((ts) => ts < cutoff)) {
      elevenLabsRequestLog.delete(key);
    }
  }
}, ELEVENLABS_RATE_LIMIT_WINDOW_MS).unref();

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

// Accept audio file uploads up to 10 MB in memory; reject non-audio MIME types
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_AUDIO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  },
});

router.post('/tts', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, textToSpeech);
router.post('/transcribe', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, upload.single('audio'), transcribe);

export default router;