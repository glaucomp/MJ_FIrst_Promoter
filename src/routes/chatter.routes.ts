import { Request, Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as chatterController from '../controllers/chatter.controller';
import * as vipInviteController from '../controllers/vip-invite.controller';
import { EMAIL_NORMALIZE_OPTIONS } from '../utils/email-normalize';

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
    body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS),
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
    body('instagram_username').isString().trim().notEmpty(),
    body('influencer_id').isString().trim().notEmpty(),
    body('full_name').isString().trim().notEmpty(),
    body('group_id').isString().trim().notEmpty(),
  ],
  chatterController.preregisterVipUser,
);
router.get(
  '/vip-invites',
  authenticate,
  [
    query('groupId').isString().trim().notEmpty(),
    query('search').optional().isString().trim(),
    query('includeExpired').optional().isIn(['true', 'false']),
  ],
  vipInviteController.listVipInvites,
);
router.get(
  '/vip-invites/:inviteId/status',
  authenticate,
  [param('inviteId').isString().trim().notEmpty()],
  vipInviteController.getVipInviteStatus,
);
router.post(
  '/vip-invites/:inviteId/send-email',
  authenticate,
  rateLimit({
    windowMs: 60 * 1_000,
    limit: 5,
    keyGenerator: rateLimitKeyByUserOrIp,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
  [param('inviteId').isString().trim().notEmpty()],
  vipInviteController.sendVipInviteEmail,
);
router.post(
  '/promo-codes',
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
    body('code').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 64 }),
    body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS),
    body('reward_credits').optional().isInt({ min: 1 }).toInt(),
    body('influencer_id').isString().trim().notEmpty(),
    body('max_redemptions').optional().isInt({ min: 1 }).toInt(),
    body('expires_at').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  ],
  chatterController.createPromoCode,
);
router.get('/me/groups', authenticate, chatterController.getMyGroups);
router.get('/', authenticate, chatterController.listChatters);
router.get('/:id', authenticate, chatterController.getChatter);
router.patch(
  '/:id',
  authenticate,
  [
    body('email').optional().isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  chatterController.updateChatter,
);
router.post(
  '/:id/resend-invite',
  authenticate,
  rateLimit({
    windowMs: 60 * 1_000,
    limit: 10,
    keyGenerator: rateLimitKeyByUserOrIp,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
  chatterController.resendInviteEmail,
);
router.delete('/:id', authenticate, chatterController.deleteChatter);

export default router;
