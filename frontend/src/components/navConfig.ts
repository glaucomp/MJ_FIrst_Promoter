import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '../types';
import {
  IconHome,
  IconModels,
  IconPersona,
  IconChatterGroups,
  IconCampaign,
  IconReport,
  IconPayout,
  IconSettings,
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
  { id: 'chatter-portal', Icon: IconPersona, label: 'Persona', path: '/chatter-portal', allowedRoles: ['chatter'] },
  { id: 'chatter-groups', Icon: IconChatterGroups, label: 'Chatter Groups', path: '/chatter-groups', allowedRoles: ['account_manager'] },
  { id: 'campaigns', Icon: IconCampaign, label: 'Campaigns', path: '/campaigns', adminOnly: true },
  // Payers are a back-office role that only sees Reports, Payouts and Settings.
  { id: 'reports', Icon: IconReport, label: 'Reports', path: '/reports', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter', 'payer'] },
  { id: 'payouts', Icon: IconPayout, label: 'Payouts', path: '/payouts', allowedRoles: ['admin', 'payer'] },
  { id: 'settings', Icon: IconSettings, label: 'Settings', path: '/settings', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter', 'chatter', 'payer'] },
];
