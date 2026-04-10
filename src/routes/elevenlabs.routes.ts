import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { textToSpeech } from '../controllers/elevenlabs.controller';

const router = Router();

router.post('/tts', authenticate, textToSpeech);

export default router;
