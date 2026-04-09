import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as chatterController from '../controllers/chatter.controller';

const router = Router();

router.post('/', authenticate, chatterController.createChatter);
router.get('/', authenticate, chatterController.listChatters);
router.get('/:id', authenticate, chatterController.getChatter);
router.delete('/:id', authenticate, chatterController.deleteChatter);

export default router;
