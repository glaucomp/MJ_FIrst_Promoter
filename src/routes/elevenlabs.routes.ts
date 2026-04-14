import { NextFunction, Request, Response, Router } from 'express';
import multer, { MulterError } from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { UserType } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { textToSpeech, transcribe } from '../controllers/elevenlabs.controller';

const router = Router();

const ELEVENLABS_ALLOWED_USER_TYPES = new Set<UserType>([UserType.CHATTER]);

const authorizeElevenLabsAccess = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userType = req.user?.userType;
  if (!userType || !ELEVENLABS_ALLOWED_USER_TYPES.has(userType)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};

// Key by authenticated user ID so limits are per-user, not per-IP.
// To enforce limits across multiple processes/containers, swap the default
// MemoryStore for a shared store such as rate-limit-redis.
const elevenLabsRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  limit: 10,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    return authReq.user?.id ? `user:${authReq.user.id}` : ipKeyGenerator(req.ip ?? 'unknown');
  },
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

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

    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Audio file exceeds the 10 MB limit' });
        return;
      }

      switch (err.code) {
        case 'LIMIT_PART_COUNT':
        case 'LIMIT_FILE_COUNT':
        case 'LIMIT_FIELD_KEY':
        case 'LIMIT_FIELD_VALUE':
        case 'LIMIT_FIELD_COUNT':
        case 'LIMIT_UNEXPECTED_FILE':
          res.status(400).json({ error: err.message });
          return;
        default:
          res.status(400).json({ error: err.message });
          return;
      }
    }

    // fileFilter rejections arrive here as plain Errors
    if (err instanceof Error) {
      res.status(415).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: 'Invalid upload request' });
  });
};

router.post('/tts', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, textToSpeech);
router.post('/transcribe', authenticate, authorizeElevenLabsAccess, elevenLabsRateLimit, audioUpload, transcribe);

export default router;