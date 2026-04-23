import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from '../utils/password-policy';

const router = Router();

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

// Get user type (account manager, promoter, or both)
router.get('/user-type', authenticate, authController.getUserType);

// Refresh token
router.post('/refresh', authenticate, authController.refreshToken);

// Forgot password: always responds 200 regardless of whether the email
// matches a real user, to avoid account enumeration.
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  authController.forgotPassword,
);

// Validate an invite / reset token so the FE can show a friendly header
// before collecting a new password.
router.get('/password-reset/:token/validate', authController.validateResetToken);

// Consume an invite / reset token and set a new password. Returns a JWT so
// the user lands straight in their dashboard.
router.post(
  '/password-reset',
  [
    body('token').isString().notEmpty(),
    body('password').isString().isLength({ min: PASSWORD_MIN_LENGTH }).withMessage(PASSWORD_TOO_SHORT_MESSAGE),
  ],
  authController.resetPassword,
);

export default router;
