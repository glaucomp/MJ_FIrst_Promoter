import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { textToSpeech, transcribe } from '../controllers/elevenlabs.controller';

const router = Router();

router.post('/tts', authenticate, textToSpeech);
router.post('/transcribe', authenticate, transcribe);

export default router;
