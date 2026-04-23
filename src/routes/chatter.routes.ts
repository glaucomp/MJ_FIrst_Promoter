import { Request, Router } from 'express';
import { body } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as chatterController from '../controllers/chatter.controller';

const router = Router();
const rateLimitKeyByUserOrIp = (req: Request) => {
  const authReq = req as AuthRequest;
  return authReq.user?.id ? `user:${authReq.user.id}` : ipKeyGenerator(req.ip ?? 'unknown');
};

router.post(
  '/',
  authenticate,
  rateLimit({
    windowMs: 60 * 1_000,
    limit: 10,
    keyGenerator: rateLimitKeyByUserOrIp,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
  [
    body('email').isEmail().normalizeEmail(),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  chatterController.createChatter,
);
router.post(
  '/preregister-vip',
  authenticate,
  rateLimit({
    windowMs: 60 * 1_000,
    limit: 10,
    keyGenerator: rateLimitKeyByUserOrIp,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
  [
    body('email').isEmail().normalizeEmail(),
    body('influencer_id').isString().trim().notEmpty(),
    body('telegram_id').isInt({ min: 1 }).toInt(),
    body('full_name').isString().trim().notEmpty(),
  ],
  chatterController.preregisterVipUser,
);
router.get('/me/groups', authenticate, chatterController.getMyGroups);
router.get('/', authenticate, chatterController.listChatters);
router.get('/:id', authenticate, chatterController.getChatter);
router.delete('/:id', authenticate, chatterController.deleteChatter);

export default router;
