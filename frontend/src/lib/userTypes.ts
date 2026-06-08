export type UserTypeKey =
  | "ADMIN"
  | "ACCOUNT_MANAGER"
  | "TEAM_MANAGER"
  | "PROMOTER"
  | "CHATTER"
  | "PAYER";

export const USER_TYPE_META: Record<
  UserTypeKey,
  {
    label: string;
    badgeClass: string;
    sectionClass: string;
    pluralLabel: string;
  }
> = {
  ADMIN: {
    label: "Admin",
    pluralLabel: "admins",
    badgeClass:
      "bg-tm-neutral-color05/80 border-[rgba(255,255,255,0.12)] text-tm-text-color08",
    sectionClass: "bg-tm-neutral-color05/40 border-[rgba(255,255,255,0.06)]",
  },
  ACCOUNT_MANAGER: {
    label: "Account manager",
    pluralLabel: "account managers",
    badgeClass: "bg-sky-500/20 border-sky-400/30 text-sky-200",
    sectionClass: "bg-sky-500/10 border-sky-400/20",
  },
  TEAM_MANAGER: {
    label: "PROMOTER +",
    pluralLabel: "PROMOTER +",
    badgeClass:
      "bg-tm-primary-color12/90 border-tm-primary-color09/80 text-[var(--color-accent-bright)]",
    sectionClass: "bg-tm-primary-color12/50 border-tm-primary-color09/30",
  },
  PROMOTER: {
    label: "Promoter",
    pluralLabel: "promoters",
    badgeClass: "bg-emerald-500/20 border-emerald-400/30 text-emerald-200",
    sectionClass: "bg-emerald-500/10 border-emerald-400/20",
  },
  CHATTER: {
    label: "Chatter",
    pluralLabel: "chatters",
    badgeClass: "bg-violet-500/20 border-violet-400/30 text-violet-200",
    sectionClass: "bg-violet-500/10 border-violet-400/20",
  },
  PAYER: {
    label: "Payer",
    pluralLabel: "payers",
    badgeClass: "bg-amber-500/20 border-amber-400/30 text-amber-200",
    sectionClass: "bg-amber-500/10 border-amber-400/20",
  },
};

export const USER_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "ACCOUNT_MANAGER", label: USER_TYPE_META.ACCOUNT_MANAGER.label },
  { value: "TEAM_MANAGER", label: USER_TYPE_META.TEAM_MANAGER.label },
  { value: "PROMOTER", label: USER_TYPE_META.PROMOTER.label },
  { value: "CHATTER", label: USER_TYPE_META.CHATTER.label },
  { value: "PAYER", label: USER_TYPE_META.PAYER.label },
];

export const normalizeUserTypeKey = (userType?: string | null): UserTypeKey | null => {
  const key = (userType ?? "").toUpperCase();
  if (key in USER_TYPE_META) return key as UserTypeKey;
  return null;
};

export const getUserTypeLabel = (userType?: string | null): string => {
  const key = normalizeUserTypeKey(userType);
  if (key) return USER_TYPE_META[key].label;
  if (!userType) return "User";
  return userType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const getUserTypeBadgeClass = (userType?: string | null): string => {
  const key = normalizeUserTypeKey(userType);
  if (key) return USER_TYPE_META[key].badgeClass;
  return "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-tm-text-color08";
};

export const getUserTypeSectionClass = (userType?: string | null): string => {
  const key = normalizeUserTypeKey(userType);
  if (key) return USER_TYPE_META[key].sectionClass;
  return "bg-[#1a1a1a]/60 border-[rgba(255,255,255,0.06)]";
};

export const formatUserDisplayName = (user: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
};

export const userHasDisplayName = (user: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean =>
  Boolean([user.firstName, user.lastName].filter(Boolean).join(" ").trim());

export const userInitials = (user: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts.at(-1);
      return (parts[0][0] + (last?.[0] ?? "")).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
};

export const formatUserTypeCount = (
  count: number,
  userType?: string | null,
): string => {
  const key = normalizeUserTypeKey(userType);
  if (!key) return `${count} ${getUserTypeLabel(userType).toLowerCase()}${count !== 1 ? "s" : ""}`;
  const meta = USER_TYPE_META[key];
  if (count === 1) return `1 ${meta.label}`;
  if (key === "TEAM_MANAGER") return `${count} ${meta.pluralLabel}`;
  return `${count} ${meta.pluralLabel}`;
};
