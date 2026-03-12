import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiKeyRequest } from '../middleware/apiKey.middleware';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// POST /api/v1/promoters/reset-password
export const resetPromoterPassword = async (req: ApiKeyRequest, res: Response) => {
  try {
    const { email, new_password } = req.body;

    if (!email || !new_password) {
      return res.status(400).json({ 
        error: 'email and new_password are required' 
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    console.log(`✅ Password reset for: ${email}`);

    res.json({
      success: true,
      email: user.email,
      username: user.username || null,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};
