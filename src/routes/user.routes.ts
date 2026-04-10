import { Router } from 'express';
import { body } from 'express-validator';
import * as userController from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createPromoter } from '../controllers/promoter.api.controller';
import { UserRole } from '@prisma/client';

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
    body('password').isLength({ min: 6 }),
    body('firstName').optional().trim(),
    body('lastName').optional().trim()
  ],
  userController.createAccountManager
);

// Create any non-admin user (admin only)
router.post(
  '/create',
  authenticate,
  authorize(UserRole.ADMIN),
  userController.createUserByAdmin
);

// Get all users (superuser only)
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  userController.getAllUsers
);

// Get promoters + team managers (account managers can access this)
router.get('/promoters', authenticate, userController.getPromoters);

// Get user by ID
router.get('/:id', authenticate, userController.getUserById);

// Update user
router.put('/:id', authenticate, userController.updateUser);

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

export default router;
