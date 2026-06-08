import {
  getUserTypeBadgeClass,
  getUserTypeLabel,
  getUserTypeSectionClass,
  normalizeUserTypeKey,
  userInitials,
} from "../lib/userTypes";

type UserTypeBadgeProps = {
  userType?: string | null;
  size?: "sm" | "md";
  className?: string;
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[11px] leading-none",
  md: "px-2.5 py-1 text-xs leading-none",
} as const;

export const UserTypeBadge = ({
  userType,
  size = "md",
  className = "",
}: UserTypeBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-md font-semibold border whitespace-nowrap ${sizeClasses[size]} ${getUserTypeBadgeClass(userType)} ${className}`}
  >
    {getUserTypeLabel(userType)}
  </span>
);

type UserTypeSectionHeaderProps = {
  userType?: string | null;
  count: number;
  className?: string;
};

export const UserTypeSectionHeader = ({
  userType,
  count,
  className = "",
}: UserTypeSectionHeaderProps) => (
  <div
    className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 ${getUserTypeSectionClass(userType)} ${className}`}
  >
    <UserTypeBadge userType={userType} size="sm" />
    <span className="text-[11px] text-tm-text-color09 tabular-nums shrink-0">
      {count} {count === 1 ? "user" : "users"}
    </span>
  </div>
);

type UserTypeBreakdownPillsProps = {
  groups: { typeKey: string; count: number }[];
  className?: string;
};

export const UserTypeBreakdownPills = ({
  groups,
  className = "",
}: UserTypeBreakdownPillsProps) => {
  if (groups.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center justify-end gap-1 ${className}`}>
      {groups.map(({ typeKey, count }) => (
        <span
          key={typeKey}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${getUserTypeSectionClass(typeKey)}`}
          title={`${getUserTypeLabel(typeKey)}: ${count}`}
        >
          <UserTypeBadge userType={typeKey} size="sm" />
          <span className="text-[10px] font-semibold text-tm-text-color08 tabular-nums">
            {count}
          </span>
        </span>
      ))}
    </div>
  );
};

export const UserStatusBadge = ({
  isActive,
  size = "md",
}: {
  isActive: boolean;
  size?: "sm" | "md";
}) => {
  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] leading-none"
      : "px-2.5 py-1 text-xs leading-none";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold border whitespace-nowrap ${sizeClass} ${
        isActive
          ? "bg-tm-success-color12/80 border-tm-success-color09/70 text-tm-success-color05"
          : "bg-tm-danger-color12/80 border-tm-danger-color09/70 text-tm-danger-color05"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isActive ? "bg-tm-success-color05" : "bg-tm-danger-color05"
        }`}
        aria-hidden
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
};

export const UserAvatar = ({
  user,
  userType,
}: {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  userType?: string | null;
}) => {
  const key = normalizeUserTypeKey(userType);
  const ringClass =
    key === "TEAM_MANAGER"
      ? "ring-tm-primary-color09/60"
      : key === "PROMOTER"
        ? "ring-emerald-400/40"
        : key === "CHATTER"
          ? "ring-violet-400/40"
          : key === "PAYER"
            ? "ring-amber-400/40"
            : "ring-white/10";

  return (
    <div
      className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white ring-2 ${ringClass}`}
      style={{ background: "linear-gradient(135deg,#ff0f5f,#cc0047)" }}
      aria-hidden
    >
      {userInitials(user)}
    </div>
  );
};
