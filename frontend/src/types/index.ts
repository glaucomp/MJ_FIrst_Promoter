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

export interface Chatter {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: string;
  groups: Pick<ChatterGroup, 'id' | 'name'>[];
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
  members: ChatterGroupMember[];
  promoter: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
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
