import { PrismaClient, UserRole, UserType } from '@prisma/client';

const prisma = new PrismaClient();

export type UserTypeString =
  | 'admin'
  | 'account_manager'
  | 'team_manager'
  | 'promoter'
  | 'payer';

export interface UserTypeInfo {
  userId: string;
  userType: UserTypeString;
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
    select: { id: true, role: true, userType: true }
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

  // Payer: admin-created, back-office role. No referrals or downline, just
  // read-only access to Reports / Payouts / Settings.
  if (user.userType === UserType.PAYER) {
    return {
      userId,
      userType: 'payer',
      isAccountManager: false,
      isTeamLeader: false,
      isPromoter: false,
      isAdmin: false,
      invitedByAdmin: false,
      hasDownline: false,
      totalReferrals: 0,
      totalCustomers: 0,
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

  let userType: UserTypeString;
  if (isAccountManager) {
    userType = 'account_manager';
  } else if (isTeamLeader) {
    userType = 'team_manager';
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

// Helper function to sync userType field in database with calculated type
export const syncUserType = async (userId: string): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, userType: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Admins always have ADMIN type
    if (user.role === UserRole.ADMIN) {
      await prisma.user.update({
        where: { id: userId },
        data: { userType: UserType.ADMIN }
      });
      return;
    }

    // Payers are assigned explicitly by an admin via POST /api/users/create.
    // They have no referral / downline signal, so skip the referral-based
    // recomputation to avoid accidentally demoting them to PROMOTER.
    if (user.userType === UserType.PAYER) {
      return;
    }

    // For promoters, calculate their type based on relationships
    const typeInfo = await getUserTypeInfo(userId);
    
    let dbUserType: UserType;
    if (typeInfo.userType === 'account_manager') {
      dbUserType = UserType.ACCOUNT_MANAGER;
    } else if (typeInfo.userType === 'team_manager') {
      dbUserType = UserType.TEAM_MANAGER;
    } else {
      dbUserType = UserType.PROMOTER;
    }

    // Update the database field
    await prisma.user.update({
      where: { id: userId },
      data: { userType: dbUserType }
    });

    console.log(`✅ User type synced for user ${userId}: ${dbUserType}`);
  } catch (error) {
    console.error(`❌ Failed to sync user type for ${userId}:`, error);
    throw error;
  }
};
