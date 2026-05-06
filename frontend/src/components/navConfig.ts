import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '../types';
import {
  IconModels,
  IconPersona,
  IconChatterGroups,
  IconCampaign,
  IconReport,
  IconPayout,
  IconSettings,
  IconNetwork,
} from './NavIcons';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  id: string;
  Icon: IconComponent;
  label: string;
  path: string;
  adminOnly?: boolean;
  allowedRoles?: UserRole[];
}

export const navItems: NavItem[] = [
  // { id: 'dashboard', Icon: IconHome, label: 'Dashboard', path: '/dashboard', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter'] },
  // Admins + account managers manage users directly on /models.
  // Team managers / promoters see the same page as "Referrals" (their own list).
  { id: 'users', Icon: IconModels, label: 'Users', path: '/models', allowedRoles: ['admin', 'account_manager'] },
  { id: 'referrals', Icon: IconModels, label: 'Referrals', path: '/referrals', allowedRoles: ['team_manager', 'account_manager', 'promoter'] },
  { id: 'network', Icon: IconNetwork, label: 'Network', path: '/network', allowedRoles: ['account_manager'] },
  { id: 'chatter-portal', Icon: IconPersona, label: 'Persona', path: '/chatter-portal', allowedRoles: ['chatter'] },
  { id: 'chatter-groups', Icon: IconChatterGroups, label: 'Chatter Groups', path: '/chatter-groups', allowedRoles: ['account_manager'] },
  { id: 'campaigns', Icon: IconCampaign, label: 'Campaigns', path: '/campaigns', adminOnly: true },
  // Payers are a back-office role that only sees Reports, Payouts and Settings.
  { id: 'reports', Icon: IconReport, label: 'Reports', path: '/reports', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter', 'payer'] },
  { id: 'payouts', Icon: IconPayout, label: 'Payouts', path: '/payouts', allowedRoles: ['admin', 'payer'] },
  { id: 'settings', Icon: IconSettings, label: 'Settings', path: '/settings', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter', 'chatter', 'payer'] },
];

/** First meaningful screen per role when Dashboard is not the default entry. */
export const defaultLandingPath = (role: UserRole): string => {
  if (role === 'chatter') return '/chatter-portal';
  if (role === 'payer') return '/reports';
  if (role === 'admin' || role === 'account_manager') return '/models';
  if (role === 'team_manager' || role === 'promoter') return '/referrals';
  return '/reports';
};
