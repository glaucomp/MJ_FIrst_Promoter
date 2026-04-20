import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '../types';
import {
  IconHome,
  IconModels,
  IconPersona,
  IconChatters,
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
  { id: 'dashboard', Icon: IconHome, label: 'Dashboard', path: '/dashboard', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter'] },
  { id: 'models', Icon: IconModels, label: 'Models', path: '/models', allowedRoles: ['admin', 'team_manager', 'account_manager', 'promoter'] },
  { id: 'chatter-portal', Icon: IconPersona, label: 'Persona', path: '/chatter-portal', allowedRoles: ['chatter'] },
  { id: 'chatters', Icon: IconChatters, label: 'Chatters', path: '/chatters', allowedRoles: ['account_manager'] },
  { id: 'chatter-groups', Icon: IconChatterGroups, label: 'Chatter Groups', path: '/chatter-groups', allowedRoles: ['account_manager'] },
  { id: 'campaigns', Icon: IconCampaign, label: 'Campaigns', path: '/campaigns', adminOnly: true },
  { id: 'reports', Icon: IconReport, label: 'Reports', path: '/reports' },
  { id: 'payouts', Icon: IconPayout, label: 'Payouts', path: '/payouts', adminOnly: true },
  { id: 'settings', Icon: IconSettings, label: 'Settings', path: '/settings' },
];
