import { useCallback, useEffect, useMemo, useState, type DragEventHandler } from "react";
import { useLocation } from "react-router-dom";
import { CreateUserModal } from "../components/CreateUserModal";
import { InviteModal } from "../components/InviteModal";
import { useAuth } from "../contexts/AuthContext";
import {
  modelsApi,
  usersApi,
  type AccountManagerSummary,
  type ApiUser,
  type Referral,
  type TrackingLink,
} from "../services/api";

const formatManagerName = (m: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) => {
  const parts = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return parts || m.email;
};

// User-type options that make sense to filter by on the admin Users page.
// ADMIN is excluded because admins are hidden from the list entirely.
const USER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "ACCOUNT_MANAGER", label: "Account manager" },
  { value: "TEAM_MANAGER", label: "Team manager" },
  { value: "PROMOTER", label: "Promoter" },
  { value: "CHATTER", label: "Chatter" },
  { value: "PAYER", label: "Payer" },
];

const SessionExpiredBanner = ({ onLogout }: { onLogout: () => void }) => (
  <div className="bg-tm-danger-color12 border border-[#cc0000] rounded-[8px] p-[16px] flex flex-col gap-[12px]">
    <p className="text-[#ff2a2a] text-[14px] font-bold">Session expired</p>
    <p className="text-[#ff8080] text-[13px]">
      Your login session is no longer valid. This usually happens after the
      server restarts. Please log out and log back in to continue.
    </p>
    <button
      onClick={onLogout}
      className="self-start bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
    >
      Log out &amp; log back in
    </button>
  </div>
);

export const Models = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  // Account managers share this component for two distinct pages:
  //   /models     → Users view (flat list of their team)
  //   /referrals  → Referrals view (their promoters / team managers)
  // Other non-admin roles never reach /models via navigation, but if they do
  // we fall back to the referrals view for them.
  const isUsersRoute = location.pathname === "/models";
  const [allUsers, setAllUsers] = useState<ApiUser[]>([]);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"referral" | "tracking">(
    "referral",
  );
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Admin view: account manager sections + filters. Grouping is always on;
  // filters just narrow what's visible inside each section.
  const [accountManagers, setAccountManagers] = useState<AccountManagerSummary[]>([]);
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const isAdmin = user?.baseRole === "admin";
  const isAccountManager = user?.baseRole === "account_manager";
  // AMs on /models get the Users view; AMs on /referrals get the referrals view.
  const showUsersView = isAdmin || (isAccountManager && isUsersRoute);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      if (showUsersView) {
        const users = await modelsApi.getAllUsers({
          userType: selectedUserType || undefined,
        });
        // Admins are never listed as rows here.
        setAllUsers(users.filter((u) => u.userType?.toLowerCase() !== "admin"));
      } else if (
        user?.baseRole === "account_manager" ||
        (user?.baseRole === "team_manager" && user?.role === "team_manager")
      ) {
        const referrals = await modelsApi.getMyReferrals();
        setMyReferrals(referrals);
      } else if (user?.baseRole === "promoter") {
        const links = await modelsApi.getMyTrackingLinks();
        setTrackingLinks(links);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load data";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [showUsersView, user?.baseRole, user?.role, selectedUserType]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .listAccountManagers()
      .then(setAccountManagers)
      .catch((err) => {
        console.warn("Failed to load account managers:", err);
      });
  }, [isAdmin]);

  // Users that match the text search (shared by admin Users view and AM Users view).
  const visibleAdminUsers = useMemo(() => {
    if (!showUsersView) return allUsers;
    const q = search.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      const owner = u.accountManager
        ? formatManagerName(u.accountManager).toLowerCase()
        : "";
      return (
        name.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        owner.includes(q)
      );
    });
  }, [allUsers, showUsersView, search]);

  // Build one section per account manager, plus a "Needs assignment" bucket
  // for users that don't yet belong to any AM (or whose creator is an admin /
  // a deleted AM). Admins themselves are never shown as owners.
  // Account managers themselves aren't listed as rows because they're the
  // section headers.
  const knownAmIds = useMemo(
    () => new Set(accountManagers.map((m) => m.id)),
    [accountManagers],
  );

  const NEEDS_ASSIGNMENT_KEY = "__needs_assignment__";
  const PAYERS_KEY = "__payers__";

  const adminSections = useMemo(() => {
    if (!isAdmin) return [];

    // Payers and account managers aren't rows in the AM-ownership grid:
    //   • ACCOUNT_MANAGER → rendered as a section header instead.
    //   • PAYER           → billing/finance identities that don't belong to
    //                       any AM and don't need "approval" in any form,
    //                       so we give them their own bottom section and
    //                       never add them to "Needs assignment".
    const rowableUsers: ApiUser[] = [];
    const payers: ApiUser[] = [];
    for (const u of visibleAdminUsers) {
      const t = u.userType?.toUpperCase();
      if (t === "ACCOUNT_MANAGER") continue;
      if (t === "PAYER") {
        payers.push(u);
        continue;
      }
      rowableUsers.push(u);
    }

    const byManager = new Map<string, ApiUser[]>();
    const needsAssignment: ApiUser[] = [];
    for (const u of rowableUsers) {
      // `accountManager` is resolved on the server: it prefers the explicit
      // `accountManagerId` assignment, then `createdById`, then the
      // referring AM from active referrals.
      const ownerId = u.accountManager?.id;
      if (ownerId && knownAmIds.has(ownerId)) {
        const arr = byManager.get(ownerId) ?? [];
        arr.push(u);
        byManager.set(ownerId, arr);
      } else {
        needsAssignment.push(u);
      }
    }

    const sections: {
      key: string;
      manager: AccountManagerSummary | null;
      users: ApiUser[];
      variant: "manager" | "needs" | "payers";
    }[] = [];

    if (needsAssignment.length > 0) {
      sections.push({
        key: NEEDS_ASSIGNMENT_KEY,
        manager: null,
        users: needsAssignment,
        variant: "needs",
      });
    }

    for (const am of accountManagers) {
      sections.push({
        key: am.id,
        manager: am,
        users: byManager.get(am.id) ?? [],
        variant: "manager",
      });
    }

    if (payers.length > 0) {
      sections.push({
        key: PAYERS_KEY,
        manager: null,
        users: payers,
        variant: "payers",
      });
    }

    return sections;
  }, [accountManagers, isAdmin, knownAmIds, visibleAdminUsers]);

  const totalVisibleUsers = adminSections.reduce((sum, s) => sum + s.users.length, 0);
  const needsAssignmentCount =
    adminSections.find((s) => s.key === NEEDS_ASSIGNMENT_KEY)?.users.length ?? 0;

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Drag & drop reassignment ────────────────────────────────────────────
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [reassigningUserId, setReassigningUserId] = useState<string | null>(null);

  const handleDropOnManager = async (
    targetManager: AccountManagerSummary,
    userId: string,
  ) => {
    setDropTargetKey(null);
    setDraggingUserId(null);

    const current = allUsers.find((u) => u.id === userId);
    if (!current) return;
    if (current.accountManager?.id === targetManager.id) return; // no-op

    const previousCreatedBy = current.createdBy ?? null;
    const previousAccountManager = current.accountManager ?? null;

    const nextOwner = {
      id: targetManager.id,
      email: targetManager.email,
      firstName: targetManager.firstName,
      lastName: targetManager.lastName,
      userType: "ACCOUNT_MANAGER",
    };

    // Optimistic update — keep createdBy and accountManager in sync so the
    // UI immediately reflects the new section placement.
    setAllUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, createdBy: nextOwner, accountManager: nextOwner }
          : u,
      ),
    );
    setReassigningUserId(userId);

    try {
      await modelsApi.assignAccountManager(userId, targetManager.id);
    } catch (err) {
      // Revert on failure
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                createdBy: previousCreatedBy,
                accountManager: previousAccountManager,
              }
            : u,
        ),
      );
      setError(err instanceof Error ? err.message : "Failed to reassign user");
    } finally {
      setReassigningUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      await modelsApi.deleteUser(userId);
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleOpenInviteModal = (type: "referral" | "tracking") => {
    setModalType(type);
    setIsInviteModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsInviteModalOpen(false);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
          Models
        </h1>
        <p className="text-[16px] text-[#9e9e9e]">Loading...</p>
      </div>
    );
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  if (user?.baseRole === "admin") {
    const activeFilterCount = (selectedUserType ? 1 : 0) + (search.trim() ? 1 : 0);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            All Users
          </h1>
          <div className="flex items-center  justify-between lg:justify-end lg:gap-4 w-full">
            <p className="text-[16px] text-[#9e9e9e]">
              {totalVisibleUsers} user{totalVisibleUsers !== 1 ? "s" : ""} ·{" "}
              {accountManagers.length} account manager
              {accountManagers.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setIsCreateUserModalOpen(true)}
              className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
            >
              + Create User
            </button>
          </div>
        </div>

        {/* Filter bar (search + user-type). Grouping by AM is always on. */}
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[12px] flex flex-col lg:flex-row lg:items-end gap-[12px]">
          <div className="flex flex-col gap-[6px] flex-1 min-w-[200px]">
            <label htmlFor="admin-users-search" className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]">
              Search
            </label>
            <input
              id="admin-users-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, or account manager…"
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[12px] py-[9px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
            />
          </div>

          <div className="flex flex-col gap-[6px] min-w-[160px]">
            <label htmlFor="admin-users-type" className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]">
              User Type
            </label>
            <select
              id="admin-users-type"
              value={selectedUserType}
              onChange={(e) => setSelectedUserType(e.target.value)}
              className="bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[9px] text-white text-[14px] focus:outline-none focus:border-[#ff0f5f] appearance-none cursor-pointer pr-[28px]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239e9e9e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              {USER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedUserType("");
                setSearch("");
              }}
              className="text-[#9e9e9e] hover:text-white text-[12px] underline self-start lg:self-end lg:mb-[10px]"
            >
              Clear filters
            </button>
          )}
        </div>

        {error === "SESSION_EXPIRED" ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        {needsAssignmentCount > 0 && (
          <div className="bg-[#3a2a0a] border border-[#b8860b]/50 rounded-[8px] px-[14px] py-[10px] flex items-center gap-[10px]">
            <span className="text-[#ffb84d] text-[14px]">⚠</span>
            <p className="text-[#ffd27a] text-[13px]">
              {needsAssignmentCount} user{needsAssignmentCount !== 1 ? "s" : ""} need
              {needsAssignmentCount === 1 ? "s" : ""} to be assigned. Drag them
              onto an account manager below.
            </p>
          </div>
        )}

        {/* Sections grouped by Account Manager. Drag a user card onto any
            manager section to reassign them. */}
        <div className="flex flex-col gap-[20px]">
          {adminSections.map((section) => {
            const isNeeds = section.variant === "needs";
            const isPayers = section.variant === "payers";
            let headerLabel: string;
            if (isNeeds) headerLabel = "Needs assignment";
            else if (isPayers) headerLabel = "Payers";
            else if (section.manager) headerLabel = formatManagerName(section.manager);
            else headerLabel = "Unassigned";
            let headerSubtitle: string;
            if (isNeeds) headerSubtitle = "Drag each user onto an account manager below";
            else if (isPayers) headerSubtitle = "Billing accounts — no account manager required";
            else headerSubtitle = section.manager?.email ?? "";
            const isCollapsed = !!collapsedSections[section.key];
            const sectionTotal = section.users.reduce(
              (sum, u) => sum + (u.stats?.totalEarnings ?? 0),
              0,
            );
            const isDropTarget = dropTargetKey === section.key;
            // Only actual AM sections can receive drops.
            const canDrop = section.variant === "manager" && !!section.manager;

            const onDragOver: DragEventHandler<HTMLElement> = (e) => {
              if (!canDrop || !draggingUserId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropTargetKey !== section.key) setDropTargetKey(section.key);
            };
            const onDragLeave: DragEventHandler<HTMLElement> = (e) => {
              // Only clear when leaving the section container itself, not
              // when moving between nested children.
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDropTargetKey((k) => (k === section.key ? null : k));
              }
            };
            const onDrop: DragEventHandler<HTMLElement> = (e) => {
              if (!canDrop || !section.manager) return;
              e.preventDefault();
              const userId = e.dataTransfer.getData("text/plain");
              if (userId) void handleDropOnManager(section.manager, userId);
            };

            return (
              <section
                key={section.key}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex flex-col gap-[12px] rounded-[10px] transition-colors ${
                  isDropTarget
                    ? "ring-2 ring-[#ff0f5f] ring-offset-2 ring-offset-[#0f0f0f]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className={`flex items-center justify-between gap-[12px] text-left border rounded-[10px] px-[16px] py-[12px] transition-colors ${
                    isNeeds
                      ? "bg-[#2a1f0a] border-[#b8860b]/40 hover:border-[#b8860b]/70"
                      : "bg-[#1a1a1a] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.16)]"
                  }`}
                >
                  <div className="flex items-center gap-[12px] min-w-0">
                    <span
                      className={`inline-block text-[14px] transition-transform ${
                        isCollapsed ? "" : "rotate-90"
                      } ${isNeeds ? "text-[#ffb84d]" : "text-[#9e9e9e]"}`}
                      aria-hidden
                    >
                      ▸
                    </span>
                    <div className="flex flex-col min-w-0">
                      <p
                        className={`text-[16px] font-bold truncate ${
                          isNeeds ? "text-[#ffd27a]" : "text-white"
                        }`}
                      >
                        {headerLabel}
                      </p>
                      {headerSubtitle && (
                        <p
                          className={`text-[12px] truncate ${
                            isNeeds ? "text-[#d9b26a]" : "text-[#9e9e9e]"
                          }`}
                        >
                          {headerSubtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-[12px] flex-shrink-0">
                    <span
                      className={`text-[12px] ${
                        isNeeds ? "text-[#d9b26a]" : "text-[#9e9e9e]"
                      }`}
                    >
                      {section.users.length} user
                      {section.users.length !== 1 ? "s" : ""}
                    </span>
                    {sectionTotal > 0 && !isNeeds && (
                      <span className="text-white text-[13px] font-semibold">
                        ${sectionTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div
                    className={`flex flex-col gap-[12px] pl-[12px] border-l-2 min-h-[32px] ${
                      isDropTarget
                        ? "border-[#ff0f5f]"
                        : isNeeds
                          ? "border-[#b8860b]/40"
                          : "border-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    {section.users.length === 0 ? (
                      <p className="text-[#666] text-[13px] italic px-[8px] py-[6px]">
                        {canDrop
                          ? "Drop a user here to assign them to this account manager."
                          : "No users in this bucket."}
                      </p>
                    ) : (
                      section.users.map((apiUser) => {
                        // Payers are billing identities, not team members —
                        // they don't belong to any AM so we don't allow
                        // dragging their cards onto AM sections.
                        const isDraggableCard = !isPayers;
                        return (
                        <div
                          key={apiUser.id}
                          draggable={isDraggableCard}
                          onDragStart={(e) => {
                            if (!isDraggableCard) return;
                            e.dataTransfer.setData("text/plain", apiUser.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingUserId(apiUser.id);
                          }}
                          onDragEnd={() => {
                            setDraggingUserId(null);
                            setDropTargetKey(null);
                          }}
                          className={`bg-linear-to-t from-[#212121] to-[#23252a] border rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] transition-opacity ${
                            isDraggableCard ? "cursor-grab active:cursor-grabbing" : ""
                          } ${
                            draggingUserId === apiUser.id
                              ? "opacity-40 border-[#ff0f5f]"
                              : "border-[rgba(255,255,255,0.03)]"
                          } ${reassigningUserId === apiUser.id ? "animate-pulse" : ""}`}
                          title={
                            isDraggableCard
                              ? "Drag onto an account manager to reassign"
                              : undefined
                          }
                        >
                          <div className="flex items-start justify-between gap-[12px] flex-col lg:flex-row">
                            <div className="flex flex-col gap-[8px] w-full">
                              <div className="flex items-center gap-[8px]">
                                {isDraggableCard && (
                                  <span
                                    className="text-[#666] text-[14px] select-none"
                                    aria-hidden
                                  >
                                    ⋮⋮
                                  </span>
                                )}
                                <p className="text-white text-[18px] font-semibold">
                                  {apiUser.firstName} {apiUser.lastName}
                                </p>
                              </div>
                              <p className="text-[#9e9e9e] text-[14px]">
                                {apiUser.email}
                              </p>
                              <div className="flex items-center gap-[8px] w-full">
                                <span
                                  className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                                    apiUser.isActive
                                      ? "bg-tm-success-color12 border-[#00d948] text-[#28ff70]"
                                      : "bg-tm-danger-color12 border-[#cc0000] text-[#ff2a2a]"
                                  }`}
                                >
                                  {apiUser.isActive ? "Active" : "Inactive"}
                                </span>
                                <span className="px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                                  {apiUser.userType?.toLowerCase().replace("_", " ")}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-start lg:items-end gap-[8px] w-full">
                              {apiUser.stats && (
                                <div className="text-left flex flex-col gap-[4px] w-full lg:text-right">
                                  <p className="text-[#9e9e9e] text-[12px] uppercase">
                                    Earnings
                                  </p>
                                  <p className="text-white text-[20px] font-bold">
                                    ${apiUser.stats.totalEarnings.toFixed(2)}
                                  </p>
                                  <p className="text-[#9e9e9e] text-[12px]">
                                    {apiUser.stats.activeReferrals} active referrals
                                  </p>
                                </div>
                              )}

                              {confirmDeleteId === apiUser.id ? (
                                <div className="flex items-center gap-[8px] mt-[4px]">
                                  <span className="text-[#9e9e9e] text-[12px]">Delete?</span>
                                  <button
                                    onClick={() => handleDeleteUser(apiUser.id)}
                                    disabled={deletingUserId === apiUser.id}
                                    className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-tm-danger-color12 border border-[#cc0000] text-[#ff2a2a] hover:bg-[#880000] disabled:opacity-50 transition-colors"
                                  >
                                    {deletingUserId === apiUser.id ? "..." : "Yes"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:text-white transition-colors"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(apiUser.id)}
                                  className="text-tm-danger-color02  opacity-80 text-[12px] font-bold transition-colors mt-[4px] hover:text-tm-danger-color05"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {adminSections.length === 0 && (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">
                {allUsers.length === 0
                  ? "No users found."
                  : "No users match your filters."}
              </p>
            </div>
          )}
        </div>

        <CreateUserModal
          isOpen={isCreateUserModalOpen}
          onClose={() => setIsCreateUserModalOpen(false)}
          onCreated={(newUser) => {
            setAllUsers((prev) => [newUser, ...prev]);
          }}
        />
      </div>
    );
  }

  // ── ACCOUNT MANAGER · USERS VIEW (/models) ────────────────────────────────
  // Same card UI as admin Users, but flat (no AM sections, no drag-drop).
  if (isAccountManager && isUsersRoute) {
    const activeFilterCount = (selectedUserType ? 1 : 0) + (search.trim() ? 1 : 0);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Users
          </h1>
          <div className="flex items-center justify-between lg:justify-end lg:gap-4 w-full">
            <p className="text-[16px] text-[#9e9e9e]">
              {visibleAdminUsers.length} user
              {visibleAdminUsers.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setIsCreateUserModalOpen(true)}
              className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
            >
              + Create User
            </button>
          </div>
        </div>

        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[12px] flex flex-col lg:flex-row lg:items-end gap-[12px]">
          <div className="flex flex-col gap-[6px] flex-1 min-w-[200px]">
            <label
              htmlFor="am-users-search"
              className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]"
            >
              Search
            </label>
            <input
              id="am-users-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email…"
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[12px] py-[9px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
            />
          </div>

          <div className="flex flex-col gap-[6px] min-w-[160px]">
            <label
              htmlFor="am-users-type"
              className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]"
            >
              User Type
            </label>
            <select
              id="am-users-type"
              value={selectedUserType}
              onChange={(e) => setSelectedUserType(e.target.value)}
              className="bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[9px] text-white text-[14px] focus:outline-none focus:border-[#ff0f5f] appearance-none cursor-pointer pr-[28px]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239e9e9e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              {USER_TYPE_OPTIONS.filter((o) => o.value !== "ACCOUNT_MANAGER").map(
                (o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ),
              )}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedUserType("");
                setSearch("");
              }}
              className="text-[#9e9e9e] hover:text-white text-[12px] underline self-start lg:self-end lg:mb-[10px]"
            >
              Clear filters
            </button>
          )}
        </div>

        {error === "SESSION_EXPIRED" ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-[12px]">
          {visibleAdminUsers.length === 0 ? (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">
                {allUsers.length === 0
                  ? "You have no users yet."
                  : "No users match your filters."}
              </p>
            </div>
          ) : (
            visibleAdminUsers.map((apiUser) => (
              <div
                key={apiUser.id}
                className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-start justify-between gap-[12px] flex-col lg:flex-row">
                  <div className="flex flex-col gap-[8px] w-full">
                    <p className="text-white text-[18px] font-semibold">
                      {apiUser.firstName} {apiUser.lastName}
                    </p>
                    <p className="text-[#9e9e9e] text-[14px]">{apiUser.email}</p>
                    <div className="flex items-center gap-[8px] w-full">
                      <span
                        className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                          apiUser.isActive
                            ? "bg-tm-success-color12 border-[#00d948] text-[#28ff70]"
                            : "bg-tm-danger-color12 border-[#cc0000] text-[#ff2a2a]"
                        }`}
                      >
                        {apiUser.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                        {apiUser.userType?.toLowerCase().replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {apiUser.stats && (
                    <div className="flex flex-col items-start lg:items-end gap-[8px] w-full">
                      <div className="text-left flex flex-col gap-[4px] w-full lg:text-right">
                        <p className="text-[#9e9e9e] text-[12px] uppercase">
                          Earnings
                        </p>
                        <p className="text-white text-[20px] font-bold">
                          ${apiUser.stats.totalEarnings.toFixed(2)}
                        </p>
                        <p className="text-[#9e9e9e] text-[12px]">
                          {apiUser.stats.activeReferrals} active referrals
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <CreateUserModal
          isOpen={isCreateUserModalOpen}
          onClose={() => setIsCreateUserModalOpen(false)}
          allowedTypes={["promoter", "chatter"]}
          onCreated={() => {
            // Reload from server so the new user lands in the right spot with
            // full stats + accountManager resolution.
            void loadData();
          }}
        />
      </div>
    );
  }

  // ── ACCOUNT MANAGER · REFERRALS VIEW (/referrals) ─────────────────────────
  if (user?.baseRole === "account_manager") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Promoters
          </h1>
          <button
            onClick={() => handleOpenInviteModal("referral")}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all 
whitespace-nowrap"
          >
            + Create Referral Link
          </button>
        </div>

        {error === "SESSION_EXPIRED" ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <p className="text-[14px] text-[#9e9e9e]">
          {myReferrals.length} total referrals
        </p>

        <ReferralList referrals={myReferrals} />

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type={modalType}
          userRole="account_manager"
        />
      </div>
    );
  }

  // ── TEAM MANAGER → acting as PROMOTER ─────────────────────────────────────
  if (user?.baseRole === "team_manager" && user?.role === "promoter") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            Referral Link
          </h1>
        </div>

        <p className="text-[14px] text-[#9e9e9e]">
          Generate a referral link to invite new promoters to your campaign.
        </p>

        <button
          onClick={() => handleOpenInviteModal("referral")}
          className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[14px] text-white text-[16px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all w-full"
        >
          + Create Referral Link
        </button>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type="referral"
          userRole="promoter"
        />
      </div>
    );
  }

  // ── TEAM MANAGER → acting as TEAM MANAGER ────────────────────────────────
  if (user?.baseRole === "team_manager" && user?.role === "team_manager") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Team
          </h1>
          <button
            onClick={() => handleOpenInviteModal("referral")}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Referral Link
          </button>
        </div>

        {error === "SESSION_EXPIRED" ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <p className="text-[14px] text-[#9e9e9e]">
          {myReferrals.length} total referrals
        </p>

        <ReferralList referrals={myReferrals} />

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type="referral"
          userRole="team_manager"
        />
      </div>
    );
  }

  // ── PURE PROMOTER ─────────────────────────────────────────────────────────
  if (user?.baseRole === "promoter") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Tracking Links
          </h1>
          <button
            onClick={() => handleOpenInviteModal("tracking")}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Link
          </button>
        </div>

        <p className="text-[14px] text-[#9e9e9e]">
          Share these links to earn commissions from customer purchases
        </p>

        <div className="flex flex-col gap-[12px]">
          {trackingLinks.map((link) => (
            <div
              key={link.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-[4px]">
                    <p className="text-white text-[16px] font-semibold">
                      {link.campaign.name}
                    </p>
                    <p className="text-[#9e9e9e] text-[12px]">
                      Code:{" "}
                      <span className="font-mono text-white">
                        {link.shortCode}
                      </span>
                    </p>
                  </div>
                  <div className="text-right flex flex-col gap-[4px] w-full">
                    <p className="text-[#9e9e9e] text-[12px] uppercase">
                      Clicks
                    </p>
                    <p className="text-white text-[20px] font-bold">
                      {link.clicks}
                    </p>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] flex items-center justify-between gap-[8px]">
                  <p className="text-[#9e9e9e] text-[12px] break-all font-mono flex-1">
                    {link.fullUrl}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(link.fullUrl)}
                    className="text-[#ff0f5f] text-[12px] font-bold hover:text-[#ff1f69] transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>

                <p className="text-[#9e9e9e] text-[12px]">
                  Created {new Date(link.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}

          {trackingLinks.length === 0 && (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">
                No tracking links yet. Create your first link to start earning
                commissions.
              </p>
            </div>
          )}
        </div>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type={modalType}
          userRole="promoter"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
        Models
      </h1>
      <p className="text-[#9e9e9e] text-[16px]">Access denied</p>
    </div>
  );
};

// ── Shared Referral List component ────────────────────────────────────────────
const ReferralList = ({ referrals }: { referrals: Referral[] }) => {
  if (referrals.length === 0) {
    return (
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
        <p className="text-[#9e9e9e] text-[16px]">
          No referrals yet. Create a referral link to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      {referrals.map((referral) => (
        <div
          key={referral.id}
          className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-[8px] w-full">
              {referral.referredUser ? (
                <>
                  <p className="text-white text-[18px] font-semibold">
                    {referral.referredUser.firstName}{" "}
                    {referral.referredUser.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">
                    {referral.referredUser.email}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white text-[18px] font-semibold">
                    Invite Code: {referral.inviteCode}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">
                    Pending — not yet accepted
                  </p>
                </>
              )}
              <div className="flex items-center gap-[8px]">
                <span
                  className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                    referral.status === "ACTIVE"
                      ? "bg-tm-success-color12 border-[#00d948] text-[#28ff70]"
                      : referral.status === "PENDING"
                        ? "bg-[#664400] border-[#cc8800] text-[#ffaa00]"
                        : referral.status === "INACTIVE"
                          ? "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]"
                          : "bg-tm-danger-color12 border-[#cc0000] text-[#ff2a2a]"
                  }`}
                >
                  {referral.status}
                </span>
                <span className="text-[#9e9e9e] text-[12px]">
                  {referral.campaign.name}
                </span>
              </div>
            </div>
            <div className="text-right flex flex-col gap-[4px] w-full">
              <p className="text-[#9e9e9e] text-[12px] uppercase">Level</p>
              <p className="text-white text-[20px] font-bold">
                {referral.level}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
