import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node scripts/reset-password.ts <email> <new-password>');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    console.log(`✅ Password reset for ${email}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 New password: ${newPassword}`);
    console.log(`👤 Username: ${user.username || 'N/A'}`);
    console.log(`🔗 Ref ID: ${user.inviteCode || 'N/A'}`);
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
