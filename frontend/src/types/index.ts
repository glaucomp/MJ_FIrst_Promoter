export type UserRole = 'admin' | 'team_manager' | 'account_manager' | 'promoter' | 'chatter';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  baseRole: UserRole; // The user's actual role in the system
  canSwitchToPromoter?: boolean; // Only team_managers have this
  wiseEmail?: string | null;
  wiseRecipientId?: string | null;
  wiseRecipientType?: string | null;
}

export interface AccountManagerRef {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface Chatter {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: string;
  /** Account manager (or admin) who created this chatter. Null for legacy records. */
  createdBy: AccountManagerRef | null;
  /** Groups this chatter belongs to; each group carries its own `createdBy`. */
  groups: (Pick<ChatterGroup, 'id' | 'name'> & {
    createdBy?: AccountManagerRef | null;
  })[];
}

export interface ChatterGroupMember {
  id: string;
  assignedAt: string;
  chatterId: string;
  chatter: Pick<Chatter, 'id' | 'email' | 'firstName' | 'lastName'>;
}

export interface ChatterGroup {
  id: string;
  name: string;
  tag: string | null;
  commissionPercentage: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
  /**
   * Effective Account Manager for this group — the AM responsible for the
   * linked promoter or chatters. `null` when nobody can be resolved. The
   * backend prefers this over `createdBy` because `createdBy` may be an admin
   * (and admins don't manage chatter groups).
   */
  accountManager: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  members: ChatterGroupMember[];
  promoter: {
    id: string;
    email: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    /** Presigned GET URL (1h expiry) for the promoter's profile photo. */
    photoUrl: string | null;
  } | null;
}

export interface DashboardStats {
  models?: number;
  modelsChange?: number;
  income: number;
  incomeChange: number;
  followers?: number;
  followersChange?: number;
}

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'pending' | 'inactive';
  joinedAt: string;
  earnings: number;
}

export interface ChartData {
  labels: string[];
  values: number[];
}
