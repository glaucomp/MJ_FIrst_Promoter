import type { ComponentType, SVGProps } from "react";
import type { UserRole } from "../types";
import {
  IconCampaign,
  IconChatterGroups,
  IconHelp,
  IconModels,
  IconNetwork,
  IconPayout,
  IconPersona,
  IconPromoters,
  IconReport,
  IconSettings,
} from "./NavIcons";

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
  // Only admins see /models in the nav as "Users".
  // Account managers, team managers, and promoters reach the shared Models page via /referrals.
  {
    id: "users",
    Icon: IconModels,
    label: "Users",
    path: "/models",
    allowedRoles: ["admin"],
  },
  {
    id: "referrals",
    Icon: IconPromoters,
    label: "Promoters",
    path: "/referrals",
    allowedRoles: ["team_manager", "account_manager", "promoter"],
  },
  {
    id: "network",
    Icon: IconNetwork,
    label: "Network",
    path: "/network",
    allowedRoles: ["account_manager"],
  },
  {
    id: "chatter-portal",
    Icon: IconPersona,
    label: "Persona",
    path: "/chatter-portal",
    allowedRoles: ["chatter"],
  },
  {
    id: "chatter-groups",
    Icon: IconChatterGroups,
    label: "Chatter Groups",
    path: "/chatter-groups",
    allowedRoles: ["account_manager"],
  },
  {
    id: "campaigns",
    Icon: IconCampaign,
    label: "Campaigns",
    path: "/campaigns",
    adminOnly: true,
  },
  // Payers are a back-office role that only sees Reports, Payouts and Settings.
  {
    id: "reports",
    Icon: IconReport,
    label: "Reports",
    path: "/reports",
    allowedRoles: [
      "admin",
      "team_manager",
      "account_manager",
      "promoter",
      "payer",
    ],
  },
  {
    id: "payouts",
    Icon: IconPayout,
    label: "Payouts",
    path: "/payouts",
    allowedRoles: ["admin", "payer"],
  },
  {
    id: "help",
    Icon: IconHelp,
    label: "Help",
    path: "/help",
    allowedRoles: ["admin", "account_manager", "chatter"],
  },
  {
    id: "settings",
    Icon: IconSettings,
    label: "Settings",
    path: "/settings",
    allowedRoles: [
      "admin",
      "team_manager",
      "account_manager",
      "promoter",
      "chatter",
      "payer",
    ],
  },
];

/** Ordered list of nav item IDs per role — determines display order in the menu. */
export const navOrderByRole: Partial<Record<UserRole, string[]>> = {
  admin: ["users", "campaigns", "reports", "payouts", "help", "settings"],
  account_manager: [
    "referrals",
    "chatter-groups",
    "reports",
    "network",
    "settings",
    "help",
  ],
  team_manager: ["referrals", "reports", "settings"],
  promoter: ["reports", "referrals", "settings"],
  chatter: ["chatter-portal", "settings", "help"],
  payer: ["reports", "payouts", "settings"],
};

/** Returns nav items visible to `role`, sorted by that role's preferred order. */
export function getNavForRole(role: UserRole | undefined): NavItem[] {
  const filtered = navItems.filter((item) => {
    if (item.adminOnly) return role === "admin";
    if (item.allowedRoles)
      return role != null && item.allowedRoles.includes(role);
    return true;
  });
  if (!role) return filtered;
  const order = navOrderByRole[role];
  if (!order) return filtered;
  return [...filtered].sort(
    (a, b) =>
      (order.indexOf(a.id) !== -1 ? order.indexOf(a.id) : 99) -
      (order.indexOf(b.id) !== -1 ? order.indexOf(b.id) : 99),
  );
}

/** First meaningful screen per role when Dashboard is not the default entry. */
export const defaultLandingPath = (role: UserRole): string => {
  if (role === "chatter") return "/chatter-portal";
  if (role === "payer") return "/reports";
  if (role === "admin") return "/models";
  if (role === "account_manager") return "/referrals";
  if (role === "team_manager" || role === "promoter") return "/referrals";
  return "/reports";
};
