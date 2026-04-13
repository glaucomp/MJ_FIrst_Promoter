import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { textToSpeech, transcribe } from '../controllers/elevenlabs.controller';

const router = Router();

// Accept audio file uploads up to 50 MB in memory (no temp files on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/tts', authenticate, textToSpeech);
router.post('/transcribe', authenticate, upload.single('audio'), transcribe);

export default router;
