import { Request, Router } from 'express';
import { body } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from '../utils/password-policy';

const router = Router();

// Public endpoints below accept unauthenticated traffic, so rate-limit
// aggressively to prevent email-spam / enumeration / DB-load abuse.
const tooManyRequestsHandler = (_req: Request, res: any) =>
  res.status(429).json({ error: 'Too many requests. Please try again later.' });

// Cap how often a single IP can request invite/reset emails.
const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  limit: 20,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  handler: tooManyRequestsHandler,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Cap how often a single mailbox can receive invite/reset emails, regardless
// of source IP — prevents distributed spray attacks at one address. Runs
// before express-validator, so normalize the email manually.
const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  limit: 5,
  keyGenerator: (req) => {
    const raw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return raw ? `email:${raw}` : `email:unknown:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  handler: tooManyRequestsHandler,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Token-consumption endpoints are equally abusable (brute-forcing tokens),
// so apply a per-IP limiter there too.
const passwordResetIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  handler: tooManyRequestsHandler,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Register new user (with optional invite code)
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: PASSWORD_MIN_LENGTH }).withMessage(PASSWORD_TOO_SHORT_MESSAGE),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('inviteCode').optional().trim()
  ],
  authController.register
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  authController.login
);

// Get current user profile
router.get('/me', authenticate, authController.getCurrentUser);

// Logout (clears httpOnly cookie)
router.post('/logout', authenticate, authController.logout);

// Get user type (account manager, promoter, or both)
router.get('/user-type', authenticate, authController.getUserType);

// Refresh token
router.post('/refresh', authenticate, authController.refreshToken);

// Forgot password: always responds 200 regardless of whether the email
// matches a real user, to avoid account enumeration. Rate-limited by IP and
// normalized email to prevent email-spam abuse.
router.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  [body('email').isEmail().normalizeEmail()],
  authController.forgotPassword,
);

// Validate an invite / reset token so the FE can show a friendly header
// before collecting a new password.
router.get(
  '/password-reset/:token/validate',
  passwordResetIpLimiter,
  authController.validateResetToken,
);

// Consume an invite / reset token and set a new password. Returns a JWT so
// the user lands straight in their dashboard.
router.post(
  '/password-reset',
  passwordResetIpLimiter,
  [
    body('token').isString().notEmpty(),
    body('password').isString().isLength({ min: PASSWORD_MIN_LENGTH }).withMessage(PASSWORD_TOO_SHORT_MESSAGE),
  ],
  authController.resetPassword,
);

export default router;
