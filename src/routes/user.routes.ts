import { Router } from 'express';
import { body } from 'express-validator';
import * as userController from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createPromoter } from '../controllers/promoter.api.controller';
import { syncTeaseMeForUser } from '../controllers/teaseme.controller';
import { UserRole } from '@prisma/client';
import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from '../utils/password-policy';

const router = Router();

// Create promoter (admin only, JWT-authenticated)
router.post(
  '/promoter',
  authenticate,
  authorize(UserRole.ADMIN),
  createPromoter
);

// Create account manager (superuser only)
router.post(
  '/account-manager',
  authenticate,
  authorize(UserRole.ADMIN),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: PASSWORD_MIN_LENGTH }).withMessage(PASSWORD_TOO_SHORT_MESSAGE),
    body('firstName').optional().trim(),
    body('lastName').optional().trim()
  ],
  userController.createAccountManager
);

// Create a non-admin user. Admins can create AMs/TMs/promoters; account
// managers can create promoters only. Controller enforces the role rules.
router.post(
  '/create',
  authenticate,
  userController.createUserByAdmin
);

// Get all users. Admins see everyone; account managers see only users whose
// effective account manager resolves to themselves (their direct team +
// everyone transitively under them via referrals). The role check happens
// inside the controller because AMs have role=PROMOTER + userType=ACCOUNT_MANAGER.
router.get(
  '/',
  authenticate,
  userController.getAllUsers
);

// Get promoters + team managers (account managers can access this)
router.get('/promoters', authenticate, userController.getPromoters);

// Get user by ID
router.get('/:id', authenticate, userController.getUserById);

// Update user
router.put('/:id', authenticate, userController.updateUser);

// Reassign a user to a different account manager (admin only; drag-drop on Users page)
router.patch(
  '/:id/account-manager',
  authenticate,
  authorize(UserRole.ADMIN),
  userController.assignAccountManager,
);

// Delete user (superuser only)
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  userController.deleteUser
);

// Get account managers (superuser only)
router.get(
  '/role/account-managers',
  authenticate,
  authorize(UserRole.ADMIN),
  userController.getAccountManagers
);

// Sync a user's profile from TeaseMe (admin only)
router.post(
  '/:id/sync-teaseme',
  authenticate,
  authorize(UserRole.ADMIN),
  syncTeaseMeForUser
);

export default router;
