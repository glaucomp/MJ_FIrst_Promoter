import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export type UserType = 'admin' | 'account_manager' | 'team_leader' | 'promoter';

export interface UserTypeInfo {
  userId: string;
  userType: UserType;
  isAccountManager: boolean;
  isTeamLeader: boolean;
  isPromoter: boolean;
  isAdmin: boolean;
  invitedByAdmin: boolean;
  hasDownline: boolean;
  totalReferrals: number;
  totalCustomers: number;
  upline?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isAccountManager: boolean;
  };
}

export const getUserTypeInfo = async (userId: string): Promise<UserTypeInfo> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if admin
  if (user.role === UserRole.ADMIN) {
    return {
      userId,
      userType: 'admin',
      isAccountManager: false,
      isTeamLeader: false,
      isPromoter: false,
      isAdmin: true,
      invitedByAdmin: false,
      hasDownline: false,
      totalReferrals: 0,
      totalCustomers: 0
    };
  }

  // Check if user was invited by an admin (Account Manager)
  const invitedByAdminReferral = await prisma.referral.findFirst({
    where: {
      referredUserId: userId,
      referrer: { role: UserRole.ADMIN },
      status: 'ACTIVE'
    },
    include: {
      referrer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });

  // Check who invited this user (their upline)
  const uplineReferral = await prisma.referral.findFirst({
    where: {
      referredUserId: userId,
      status: 'ACTIVE'
    },
    include: {
      referrer: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  // Check if upline is an account manager
  let uplineIsAccountManager = false;
  if (uplineReferral) {
    const uplineInvitedByAdmin = await prisma.referral.findFirst({
      where: {
        referredUserId: uplineReferral.referrerId,
        referrer: { role: UserRole.ADMIN },
        status: 'ACTIVE'
      }
    });
    uplineIsAccountManager = !!uplineInvitedByAdmin;
  }

  // Count referrals where this user has invited other promoters (their downline)
  const promoterReferrals = await prisma.referral.count({
    where: {
      referrerId: userId,
      referredUserId: { not: null }, // Has a referred user (not customer tracking)
      status: 'ACTIVE'
    }
  });

  // Count customer tracking referrals (for commission tracking)
  const customerTrackingReferrals = await prisma.referral.findMany({
    where: {
      referrerId: userId,
      referredUserId: null, // NULL means customer tracking
      status: 'ACTIVE'
    },
    include: {
      commissions: true,
      _count: {
        select: { commissions: true }
      }
    }
  });

  const totalCustomers = customerTrackingReferrals.reduce((sum, ref) => 
    sum + ref._count.commissions, 0
  );

  // Determine user classification
  const isAccountManager = !!invitedByAdminReferral;
  const hasDownline = promoterReferrals > 0;
  const isTeamLeader = hasDownline && !isAccountManager; // Has team but not account manager

  let userType: UserType;
  if (isAccountManager) {
    userType = 'account_manager';
  } else if (isTeamLeader) {
    userType = 'team_leader';
  } else {
    userType = 'promoter';
  }

  return {
    userId,
    userType,
    isAccountManager,
    isTeamLeader,
    isPromoter: true, // All non-admin users are promoters
    isAdmin: false,
    invitedByAdmin: isAccountManager,
    hasDownline,
    totalReferrals: promoterReferrals,
    totalCustomers,
    upline: uplineReferral ? {
      id: uplineReferral.referrer.id,
      email: uplineReferral.referrer.email,
      firstName: uplineReferral.referrer.firstName,
      lastName: uplineReferral.referrer.lastName,
      isAccountManager: uplineIsAccountManager
    } : undefined
  };
};
