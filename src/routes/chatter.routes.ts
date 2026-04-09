import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import * as chatterController from '../controllers/chatter.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  chatterController.createChatter,
);
router.get('/', authenticate, chatterController.listChatters);
router.get('/:id', authenticate, chatterController.getChatter);
router.delete('/:id', authenticate, chatterController.deleteChatter);

export default router;
