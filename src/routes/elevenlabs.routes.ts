import { NextFunction, Request, Response, Router } from 'express';
import multer, { MulterError } from 'multer';
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
    // Browsers/MediaRecorder often send "audio/webm;codecs=opus" — strip params first
    const baseType = file.mimetype.split(';')[0].trim();
    if (ALLOWED_AUDIO_TYPES.has(baseType)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${baseType}`));
    }
  },
});

// Wraps upload.single so multer errors become proper 4xx responses instead of
// falling through to the global 500 error handler.
const audioUpload = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('audio')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Audio file exceeds the 10 MB limit' });
      return;
    }
    // fileFilter rejections arrive here as plain Errors
    res.status(415).json({ error: err.message });
  });
};

router.post('/tts', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, textToSpeech);
router.post('/transcribe', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, audioUpload, transcribe);

export default router;