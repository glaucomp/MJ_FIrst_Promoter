export type UserRole = 'admin' | 'team_manager' | 'account_manager' | 'promoter';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  baseRole: UserRole; // The user's actual role in the system
  canSwitchToPromoter?: boolean; // Only team_managers have this
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
