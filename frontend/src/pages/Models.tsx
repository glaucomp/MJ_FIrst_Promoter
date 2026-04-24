import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEventHandler,
} from "react";
import { useLocation } from "react-router-dom";
import { CreateUserModal } from "../components/CreateUserModal";
import { InviteModal } from "../components/InviteModal";
import { useAuth } from "../contexts/AuthContext";
import {
  chatterGroupsApi,
  modelsApi,
  usersApi,
  type AccountManagerSummary,
  type ApiUser,
  type Referral,
} from "../services/api";
import type { ChatterGroup } from "../types";

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
  const [accountManagers, setAccountManagers] = useState<
    AccountManagerSummary[]
  >([]);
  const [selectedUserType, setSelectedUserType] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

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
        (user?.baseRole === "team_manager" && user?.role === "team_manager") ||
        user?.baseRole === "promoter"
      ) {
        // Promoters see the same My Promoters list as account managers —
        // the invite creation flow (email + Step N chip) is shared, just
        // subject to `campaign.maxInvitesPerMonth` on the backend.
        const referrals = await modelsApi.getMyReferrals();
        setMyReferrals(referrals);
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

    // Account managers are their own section headers, and payers live in a
    // dedicated bucket at the bottom (they never belong to an AM), so both
    // are excluded from the rowable set the AM groups pull from.
    const rowableUsers = visibleAdminUsers.filter((u) => {
      const t = u.userType?.toUpperCase();
      return t !== "ACCOUNT_MANAGER" && t !== "PAYER";
    });
    const payers = visibleAdminUsers.filter(
      (u) => u.userType?.toUpperCase() === "PAYER",
    );

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

  const totalVisibleUsers = adminSections.reduce(
    (sum, s) => sum + s.users.length,
    0,
  );
  const needsAssignmentCount =
    adminSections.find((s) => s.key === NEEDS_ASSIGNMENT_KEY)?.users.length ??
    0;

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Drag & drop reassignment ────────────────────────────────────────────
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [reassigningUserId, setReassigningUserId] = useState<string | null>(
    null,
  );

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
    const activeFilterCount =
      (selectedUserType ? 1 : 0) + (search.trim() ? 1 : 0);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            All Users
          </h1>
          <div className="flex items-center  justify-between lg:justify-end lg:gap-4 w-full">
            <p className="text-base text-[#9e9e9e]">
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
            <label
              htmlFor="admin-users-search"
              className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]"
            >
              Search
            </label>
            <input
              id="admin-users-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, or account manager…"
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-4 py-4 text-base text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
            />
          </div>

          <div className="flex flex-col gap-[6px] min-w-[160px]">
            <label
              htmlFor="admin-users-type"
              className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.2px]"
            >
              User Type
            </label>
            <select
              id="admin-users-type"
              value={selectedUserType}
              onChange={(e) => setSelectedUserType(e.target.value)}
              className="bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-4 py-4 text-white text-base focus:outline-none focus:border-[#ff0f5f] appearance-none cursor-pointer pr-[28px]"
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
              className="text-[#9e9e9e] hover:text-white text-[12px] underline self-start lg:self-center "
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
              {needsAssignmentCount} user{needsAssignmentCount !== 1 ? "s" : ""}{" "}
              need
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
            else if (section.manager)
              headerLabel = formatManagerName(section.manager);
            else headerLabel = "Unassigned";
            let headerSubtitle: string;
            if (isNeeds)
              headerSubtitle = "Drag each user onto an account manager below";
            else if (isPayers)
              headerSubtitle =
                "Back-office users — no account manager required";
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
              if (
                !(e.currentTarget as HTMLElement).contains(
                  e.relatedTarget as Node,
                )
              ) {
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
                className={`flex flex-col  rounded-[10px] transition-colors ${
                  isDropTarget
                    ? "ring-2 ring-tm-text-color10 ring-offset-2 ring-offset-[#0f0f0f]"
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
                  <div className="flex items-start gap-[12px] min-w-0">
                    <span
                      className={`inline-block text-2xl transition-transform ${
                        isCollapsed ? "" : "rotate-90"
                      } ${isNeeds ? "text-[#ffb84d]" : "text-tm-primary-color05"}`}
                      aria-hidden
                    >
                      ▸
                    </span>
                    <div className="flex flex-col min-w-0">
                      <p
                        className={`text-xl truncate ${
                          isNeeds ? "text-[#ffd27a]" : "text-white"
                        }`}
                      >
                        {headerLabel}
                      </p>
                      {headerSubtitle && (
                        <p
                          className={`text-sm mt-1 truncate ${
                            isNeeds ? "text-[#d9b26a]" : "text-tm-text-color09"
                          }`}
                        >
                          {headerSubtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-[12px] flex-shrink-0">
                    <span
                      className={`text-base ${
                        isNeeds ? "text-[#d9b26a]" : "text-tm-text-color09"
                      }`}
                    >
                      {section.users.length} user
                      {section.users.length !== 1 ? "s" : ""}
                    </span>
                    {sectionTotal > 0 && !isNeeds && !isPayers && (
                      <span className="text-white text-[13px] font-semibold">
                        ${sectionTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div
                    className={`flex flex-col justify-center align-center gap-[12px]  min-h-[32px] bg-tm-neutral-color08 px-6 py-8 rounded-b-xl overflow-clip  ${
                      isDropTarget
                        ? "border-[#ff0f5f]"
                        : isNeeds
                          ? "border-[#b8860b]/40"
                          : "border-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    {section.users.length === 0 ? (
                      <>
                        {canDrop && (
                        <svg className="text-tm-text-color11 mx-auto h-12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M16 14a5 5 0 0 1 5 5v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a5 5 0 0 1 5-5zm4-6a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1h-1a1 1 0 1 1 0-2h1V9a1 1 0 0 1 1-1m-8-6a5 5 0 1 1 0 10a5 5 0 0 1 0-10"/></g></svg>
                        )}

                        <p className="text-tm-text-color10 text-center text-lg px-4 py-3">
                          {canDrop
                            ? "Drop a user here to assign them to this Account Manager."
                            : "No users in this bucket."}
                        </p>
                      </>
                    ) : (
                      section.users.map((apiUser) => {
                        const isDraggable = !isPayers;

                        return (
                          <div
                            key={apiUser.id}
                            draggable={isDraggable}
                            onDragStart={
                              isDraggable
                                ? (e) => {
                                    e.dataTransfer.setData(
                                      "text/plain",
                                      apiUser.id,
                                    );
                                    e.dataTransfer.effectAllowed = "move";
                                    setDraggingUserId(apiUser.id);
                                  }
                                : undefined
                            }
                            onDragEnd={
                              isDraggable
                                ? () => {
                                    setDraggingUserId(null);
                                    setDropTargetKey(null);
                                  }
                                : undefined
                            }
                            className={`bg-linear-to-t from-[#212121] to-[#23252a] border rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] transition-all ${
                              isDraggable
                                ? "cursor-grab active:cursor-grabbing"
                                : ""
                            } ${
                              draggingUserId === apiUser.id
                                ? "opacity-10 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
                                : "border-[rgba(255,255,255,0.03)]"
                            } ${reassigningUserId === apiUser.id ? "animate-pulse" : ""}`}
                            title={
                              isDraggable
                                ? "Drag onto an account manager to reassign"
                                : undefined
                            }
                          >
                            <div className="flex items-start justify-between gap-[12px] flex-col lg:flex-row">
                              {isDraggable && (
                                <span
                                  className="text-[#666] text-xl font-bold select-none"
                                  aria-hidden
                                >
                                  {" "}
                                  ⋮⋮
                                </span>
                              )}
                              <div className="flex flex-col gap-[8px] w-full">
                                <div className="flex items-center gap-[8px]">
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
                                    {apiUser.userType
                                      ?.toLowerCase()
                                      .replace("_", " ")}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col items-start lg:items-end gap-[8px] w-full">
                                {apiUser.stats && !isPayers && (
                                  <div className="text-left flex flex-col gap-[4px] w-full lg:text-right">
                                    <p className="text-[#9e9e9e] text-xs uppercase">
                                      Earnings
                                    </p>
                                    <p className="text-white text-2xl font-bold">
                                      ${apiUser.stats.totalEarnings.toFixed(2)}
                                    </p>
                                    <p className="text-[#9e9e9e] text-sm">
                                      {apiUser.stats.activeReferrals} active
                                      referrals
                                    </p>
                                  </div>
                                )}

                                {confirmDeleteId === apiUser.id ? (
                                  <div className="flex items-center gap-[8px] mt-[4px]">
                                    <span className="text-[#9e9e9e] text-[12px]">
                                      Delete?
                                    </span>
                                    <button
                                      onClick={() =>
                                        handleDeleteUser(apiUser.id)
                                      }
                                      disabled={deletingUserId === apiUser.id}
                                      className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-tm-danger-color12 border border-[#cc0000] text-[#ff2a2a] hover:bg-[#880000] disabled:opacity-50 transition-colors"
                                    >
                                      {deletingUserId === apiUser.id
                                        ? "..."
                                        : "Yes"}
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
                                    onClick={() =>
                                      setConfirmDeleteId(apiUser.id)
                                    }
                                    className="text-tm-danger-color04 text-sm hover:text-tm-danger-color05 hover:-translate-y-0.5 transition-all"
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
    const activeFilterCount =
      (selectedUserType ? 1 : 0) + (search.trim() ? 1 : 0);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Users
          </h1>
          <div className="flex items-center justify-between lg:justify-end lg:gap-4 w-full">
            <p className="text-base text-[#9e9e9e]">
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
              {USER_TYPE_OPTIONS.filter(
                (o) => o.value !== "ACCOUNT_MANAGER",
              ).map((o) => (
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

        <ReferralList referrals={myReferrals} setReferrals={setMyReferrals} />

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

        <ReferralList referrals={myReferrals} setReferrals={setMyReferrals} />

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
  // Mirrors the ACCOUNT MANAGER REFERRALS VIEW above. The invite flow is the
  // same in both cases; the backend enforces `campaign.maxInvitesPerMonth` for
  // non-admin/non-AM callers so promoters are naturally capped. InviteModal
  // also surfaces the remaining quota client-side via `getInviteQuota`.
  if (user?.baseRole === "promoter") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">
            My Promoters
          </h1>
          <button
            onClick={() => handleOpenInviteModal("referral")}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all whitespace-nowrap"
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

        <ReferralList referrals={myReferrals} setReferrals={setMyReferrals} />

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type="referral"
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

// ── My Promoters card grid ────────────────────────────────────────────────
//
// Six lifecycle states drive this view, in order of precedence:
//   denied   → referral.status === "CANCELLED" (explicit AM rejection)
//   expired  → local (metadata.expiresAt past / isExpired flag)
//   waiting  → preUser.status === "pending" (or missing)
//   order_lp → preUser.status === "order_lp"
//   building → preUser.status === "building"
//   lp_live  → preUser.status === "live" OR referral.status === "ACTIVE"
//
// `preUser.status` is mirrored from TeaseMe's /mjpromoter/pre-influencers/
// step-progress response — never invented locally. The UI only TRIGGERS
// transitions (via the card action buttons) and re-polls to observe them.
//
// `denied` is *explicit* (someone clicked Deny → CANCELLED), while `expired`
// is *passive* (the 24h invite window lapsed). Both share the Expired filter
// pill because from a user POV they're both "dead invites you might want
// to clean up or re-send", but the chip and action row differ.

type ChipState =
  | "denied"
  | "expired"
  | "waiting"
  | "order_lp"
  | "building"
  | "lp_live";

const deriveChipState = (r: Referral): ChipState => {
  // Explicit deny beats everything else — once an AM has said no, we don't
  // want the UI to keep nagging them with "Order LP" etc even if the
  // underlying preUser row still has an in-flight TeaseMe status.
  if (r.status === "CANCELLED") return "denied";
  if (r.isExpired) return "expired";
  if (r.status === "ACTIVE") return "lp_live";
  const upstream = r.preUser?.status;
  switch (upstream) {
    case "live":
      return "lp_live";
    case "building":
      return "building";
    case "order_lp":
      return "order_lp";
    case "pending":
    default:
      return "waiting";
  }
};

const CHIP_LABEL: Record<ChipState, string> = {
  denied: "Denied",
  expired: "Expired",
  waiting: "Waiting",
  order_lp: "Order LP",
  building: "Building",
  lp_live: "LP Live",
};

// Tailwind class sets extracted once so hover states and DOM stay lean.
// Colors follow the Figma reference: warm accent on Waiting, outlined
// mint/pink on Order LP / Building, filled green on LP Live, red on
// Expired, and muted gray-red on Denied (to signal "explicit finality"
// without competing visually with the louder Expired red).
const CHIP_CLASS: Record<ChipState, string> = {
  denied:
    "bg-[rgba(110,110,110,0.15)] border-[#6e6e6e] text-[#b3b3b3]",
  expired:
    "bg-[rgba(255,42,42,0.12)] border-[#cc0000] text-[#ff2a2a]",
  waiting:
    "bg-[rgba(255,170,0,0.15)] border-[#cc8800] text-[#ffaa00]",
  order_lp:
    "bg-[rgba(40,255,112,0.06)] border-[#28ff70] text-[#28ff70]",
  building:
    "bg-[rgba(255,79,143,0.08)] border-[#ff4f8f] text-[#ff4f8f]",
  lp_live:
    "bg-tm-success-color12 border-[#00d948] text-[#28ff70]",
};

const StatusChip = ({ state }: { state: ChipState }) => (
  <span
    className={`inline-flex items-center px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${CHIP_CLASS[state]}`}
  >
    {CHIP_LABEL[state]}
  </span>
);

// The TeaseMe survey is 3 steps. `currentStep` advances monotonically as the
// invitee finishes each one. Completed steps render struck-through to match
// the Figma "done" state.
const ONBOARDING_STEPS: { idx: number; label: string }[] = [
  { idx: 1, label: "Email & Name" },
  { idx: 2, label: "Photo & Voice" },
  { idx: 3, label: "Assets" },
];

const OnboardingChecklist = ({
  step,
  dimmed,
}: {
  step: number;
  dimmed?: boolean;
}) => (
  <ul
    className={`flex flex-col gap-[6px] text-[13px] ${
      dimmed ? "opacity-60" : ""
    }`}
  >
    {ONBOARDING_STEPS.map(({ idx, label }) => {
      const done = step >= idx;
      return (
        <li
          key={idx}
          className={`flex items-center gap-[8px] ${
            done
              ? "text-[#6e6e6e] line-through"
              : "text-white"
          }`}
        >
          <span className="text-[#6e6e6e] font-mono text-[12px] w-[20px]">
            {String(idx).padStart(2, "0")}
          </span>
          <span className="font-semibold">{label}</span>
        </li>
      );
    })}
  </ul>
);

type ReferralListProps = {
  referrals: Referral[];
  setReferrals?: React.Dispatch<React.SetStateAction<Referral[]>>;
};

type ReferralFilter =
  | "all"
  | "pending"
  | "active"
  | "expired"
  | "denied";

const ReferralList = ({ referrals, setReferrals }: ReferralListProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);
  // Default filter hides expired invites. "all" here means "everything that
  // isn't expired" — expired rows are only visible when the user clicks the
  // Expired pill explicitly.
  const [filter, setFilter] = useState<ReferralFilter>("all");
  // Reassign / Assign-Chatters modals share this opaque "in-flight referral".
  // Keeping them as siblings rather than nested avoids re-rendering the whole
  // grid when either opens/closes.
  const [reassignFor, setReassignFor] = useState<Referral | null>(null);
  const [assignChattersFor, setAssignChattersFor] = useState<Referral | null>(
    null,
  );

  // Expired and Denied are separate filter pills: expired is a passive
  // lifecycle event (invite window lapsed), denied is an explicit AM
  // rejection. Both are still hidden from the "All" tab so they don't
  // clutter the default view.
  const isDenied = (r: Referral) => r.status === "CANCELLED";
  const isExpiredOnly = (r: Referral) => r.isExpired && !isDenied(r);

  const counts = useMemo(() => {
    const expired = referrals.filter(isExpiredOnly).length;
    const denied = referrals.filter(isDenied).length;
    const pending = referrals.filter(
      (r) => r.status === "PENDING" && !r.isExpired,
    ).length;
    const active = referrals.filter((r) => r.status === "ACTIVE").length;
    return {
      all: referrals.length - expired - denied,
      pending,
      active,
      expired,
      denied,
    };
  }, [referrals]);

  const visibleReferrals = useMemo(() => {
    switch (filter) {
      case "pending":
        return referrals.filter(
          (r) => r.status === "PENDING" && !r.isExpired,
        );
      case "active":
        return referrals.filter((r) => r.status === "ACTIVE");
      case "expired":
        return referrals.filter(isExpiredOnly);
      case "denied":
        return referrals.filter(isDenied);
      case "all":
      default:
        return referrals.filter((r) => !r.isExpired && !isDenied(r));
    }
  }, [referrals, filter]);

  const showToast = (kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (referral: Referral) => {
    const label =
      referral.metadata?.inviteeEmail ??
      `invite code ${referral.inviteCode}`;
    const noun = referral.status === "CANCELLED" ? "denied" : "expired";
    if (
      !window.confirm(
        `Delete ${noun} invite for ${label}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(referral.id);
    try {
      await modelsApi.deleteReferralInvite(referral.id);
      setReferrals?.((prev) => prev.filter((r) => r.id !== referral.id));
      showToast("success", "Invite deleted");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to delete invite",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (referral: Referral) => {
    const label =
      referral.metadata?.inviteeEmail ??
      `invite code ${referral.inviteCode}`;
    if (!window.confirm(`Deny ${label}? The promoter will be marked as denied.`)) {
      return;
    }
    setBusyId(referral.id);
    try {
      await modelsApi.denyReferralInvite(referral.id);
      // Flip local status to CANCELLED so `deriveChipState` returns "denied"
      // and the row moves to the Expired filter (where denied lives alongside
      // expired invites). We keep it in the list rather than removing it so
      // the user can still see the audit trail and delete it explicitly.
      setReferrals?.((prev) =>
        prev.map((r) =>
          r.id === referral.id ? { ...r, status: "CANCELLED" as const } : r,
        ),
      );
      showToast("success", "Promoter denied");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to deny promoter",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReassignSubmit = async (newReferrerId: string) => {
    const referral = reassignFor;
    if (!referral) return;
    setBusyId(referral.id);
    try {
      const result = await modelsApi.reassignReferralInvite(
        referral.id,
        newReferrerId,
      );
      setReferrals?.((prev) =>
        prev.map((r) =>
          r.id === referral.id
            ? {
                ...r,
                metadata: {
                  ...(r.metadata ?? {}),
                  accountManagerEmail: result.newReferrer.email,
                },
              }
            : r,
        ),
      );
      const name =
        [result.newReferrer.firstName, result.newReferrer.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || result.newReferrer.email;
      showToast("success", `Reassigned to ${name}`);
      setReassignFor(null);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to reassign promoter",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleOrderLandingPage = async (referral: Referral) => {
    setBusyId(referral.id);
    try {
      const result = await modelsApi.orderReferralLandingPage(referral.id);
      setReferrals?.((prev) =>
        prev.map((r) =>
          r.id === referral.id
            ? {
                ...r,
                preUser: {
                  ...(r.preUser ?? {
                    currentStep: 0,
                    status: null,
                    lastCheckedAt: null,
                    teasemeUserId: null,
                  }),
                  currentStep: result.preUser.currentStep,
                  status: result.preUser.status,
                  lastCheckedAt: result.preUser.lastCheckedAt,
                  teasemeUserId: result.preUser.teasemeUserId,
                },
              }
            : r,
        ),
      );
      showToast("success", "Landing page build requested");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to order landing page",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleAssignChattersSubmit = async (chatterGroupId: string) => {
    const referral = assignChattersFor;
    if (!referral) return;
    setBusyId(referral.id);
    try {
      const result = await modelsApi.assignReferralChatters(
        referral.id,
        chatterGroupId,
      );
      showToast("success", `Chatters assigned: ${result.chatterGroup.name}`);
      setAssignChattersFor(null);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to assign chatters",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (referrals.length === 0) {
    return (
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
        <p className="text-[#9e9e9e] text-[16px]">
          No referrals yet. Create a referral link to get started.
        </p>
      </div>
    );
  }

  const filterOptions: Array<{ id: ReferralFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "active", label: "Active", count: counts.active },
    { id: "expired", label: "Expired", count: counts.expired },
    { id: "denied", label: "Denied", count: counts.denied },
  ];

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px] flex-wrap">
        {filterOptions.map((opt) => {
          const isSelected = filter === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-[14px] py-[6px] rounded-[100px] text-[12px] font-bold border transition-colors ${
                isSelected
                  ? "bg-[#ff0f5f] border-[#ff0f5f] text-white"
                  : "bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:text-white hover:border-[rgba(255,255,255,0.3)]"
              }`}
            >
              {opt.label}
              <span className={`ml-[6px] font-normal ${isSelected ? "opacity-80" : ""}`}>
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>

      {toast && (
        <div
          className={`rounded-[8px] px-[16px] py-[12px] border text-[14px] font-medium ${
            toast.kind === "success"
              ? "bg-tm-success-color12 border-[#00d948] text-[#28ff70]"
              : "bg-tm-danger-color12 border-[#cc0000] text-[#ff2a2a]"
          }`}
        >
          {toast.text}
        </div>
      )}

      {visibleReferrals.length === 0 && (
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
          <p className="text-[#9e9e9e] text-[14px]">
            No {filter === "all" ? "active or pending" : filter} referrals
            {filter === "all" && (counts.expired > 0 || counts.denied > 0)
              ? ` — ${[
                  counts.expired > 0 ? `${counts.expired} expired` : null,
                  counts.denied > 0 ? `${counts.denied} denied` : null,
                ]
                  .filter(Boolean)
                  .join(", ")} hidden`
              : ""}
            .
          </p>
        </div>
      )}

      <div className="grid gap-[16px] lg:grid-cols-2 grid-cols-1">
        {visibleReferrals.map((referral) => {
          const chipState = deriveChipState(referral);
          const inviteeEmail =
            referral.referredUser?.email ??
            referral.metadata?.inviteeEmail ??
            null;
          const displayName = referral.referredUser
            ? [referral.referredUser.firstName, referral.referredUser.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || referral.referredUser.email
            : inviteeEmail ?? `Invite · ${referral.inviteCode}`;
          const isBusy = busyId === referral.id;
          const step = referral.preUser?.currentStep ?? 0;
          return (
            <div
              key={referral.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[14px]"
            >
              {/* Header: chip on the left, LEVEL N on the right */}
              <div className="flex items-center justify-between gap-[12px]">
                <StatusChip state={chipState} />
                <div className="flex items-center gap-[6px] text-[#9e9e9e]">
                  <span className="text-[11px] uppercase tracking-[0.08em] font-bold">
                    Level
                  </span>
                  <span className="text-white text-[16px] font-bold">
                    {referral.level}
                  </span>
                </div>
              </div>

              {/* Body: name + campaign */}
              <div className="flex flex-col gap-[4px] min-w-0">
                <p className="text-white text-[18px] font-semibold truncate">
                  {displayName}
                </p>
                <p className="text-[#9e9e9e] text-[13px] truncate">
                  {inviteeEmail && inviteeEmail !== displayName
                    ? `${inviteeEmail} · ${referral.campaign.name}`
                    : referral.campaign.name}
                </p>
              </div>

              {/* Onboarding checklist — always shown so the user sees survey
                  progress even on `building` / `lp_live` (a gentle history
                  cue rather than an interactive checklist). */}
              <div className="rounded-[6px] border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)] px-[14px] py-[12px]">
                <div className="flex items-center justify-between mb-[8px]">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-[#9e9e9e] font-bold">
                    Onboarding
                  </span>
                  <span className="text-[11px] text-[#6e6e6e] font-mono">
                    {Math.min(step, ONBOARDING_STEPS.length)}/
                    {ONBOARDING_STEPS.length}
                  </span>
                </div>
                <OnboardingChecklist
                  step={step}
                  dimmed={chipState === "expired"}
                />
              </div>

              {/* Action row — layout changes by chip state */}
              <CardActions
                state={chipState}
                referral={referral}
                busy={isBusy}
                onDelete={handleDelete}
                onDeny={handleDeny}
                onReassign={(r) => setReassignFor(r)}
                onOrderLandingPage={handleOrderLandingPage}
                onAssignChatters={(r) => setAssignChattersFor(r)}
              />
            </div>
          );
        })}
      </div>

      {reassignFor && (
        <ReassignModal
          referral={reassignFor}
          busy={busyId === reassignFor.id}
          onClose={() => setReassignFor(null)}
          onSubmit={handleReassignSubmit}
        />
      )}
      {assignChattersFor && (
        <AssignChattersModal
          referral={assignChattersFor}
          busy={busyId === assignChattersFor.id}
          onClose={() => setAssignChattersFor(null)}
          onSubmit={handleAssignChattersSubmit}
        />
      )}
    </div>
  );
};

// ── Card action button row ────────────────────────────────────────────────
//
// The action row's layout is a pure function of the chip state:
//   expired  → message + Delete (dead invite, cleanup only)
//   denied   → message + Delete (dead invite, cleanup only)
//   waiting  → [Deny][ReAssign]  +  disabled "Order Landing Page"
//   order_lp → full-width green "Order Landing Page"
//   building → no CTA, grayed "Building landing page…" placeholder
//   lp_live  → full-width pink "Assign Chatters"

type CardActionsProps = {
  state: ChipState;
  referral: Referral;
  busy: boolean;
  onDelete: (r: Referral) => void;
  onDeny: (r: Referral) => void;
  onReassign: (r: Referral) => void;
  onOrderLandingPage: (r: Referral) => void;
  onAssignChatters: (r: Referral) => void;
};

const SecondaryButton = ({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[6px] px-[12px] py-[10px] text-white text-[13px] font-bold hover:bg-[#252525] disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
  >
    {children}
  </button>
);

const GreenCta = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full bg-linear-to-b from-[#28ff70] to-[#00aa3c] rounded-[6px] px-[14px] py-[10px] text-black text-[13px] font-bold hover:from-[#3aff82] hover:to-[#00bc43] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
  >
    {children}
  </button>
);

const PinkCta = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[6px] px-[14px] py-[10px] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
  >
    {children}
  </button>
);

const CardActions = ({
  state,
  referral,
  busy,
  onDelete,
  onDeny,
  onReassign,
  onOrderLandingPage,
  onAssignChatters,
}: CardActionsProps) => {
  // Expired and Denied share the same "dead row" UX: the invite is over,
  // the only useful action is to clean it up. We used to offer Resend for
  // expired rows, but the underlying TeaseMe preUser is effectively stale
  // at that point — creating a fresh invite is clearer than silently
  // re-extending a dead one. One action row covers both states.
  if (state === "expired" || state === "denied") {
    const message =
      state === "expired"
        ? "This invite has expired."
        : "This invite has been denied.";
    return (
      <div className="flex items-center justify-between gap-[8px]">
        <span className="text-[#9e9e9e] text-[13px]">{message}</span>
        <button
          onClick={() => onDelete(referral)}
          disabled={busy}
          className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[6px] px-[14px] py-[8px] text-[#9e9e9e] text-[13px] font-bold hover:text-[#ff2a2a] hover:border-[#cc0000] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Delete
        </button>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-center gap-[8px]">
          <SecondaryButton
            onClick={() => onDeny(referral)}
            disabled={busy}
            className="hover:text-[#ff2a2a] hover:border-[#cc0000]"
          >
            {busy ? "…" : "Deny"}
          </SecondaryButton>
          <SecondaryButton
            onClick={() => onReassign(referral)}
            disabled={busy}
          >
            ReAssign
          </SecondaryButton>
        </div>
        {/* Disabled while we wait for the invitee to finish onboarding.
            Tooltip explains why so it doesn't look like a dead button. */}
        <button
          disabled
          title="Waiting for the promoter to finish onboarding before a landing page can be ordered."
          className="w-full rounded-[6px] px-[14px] py-[10px] text-[13px] font-bold border border-[#28ff70] text-[#28ff70] opacity-40 cursor-not-allowed"
        >
          Order Landing Page
        </button>
      </div>
    );
  }

  if (state === "order_lp") {
    return (
      <GreenCta
        onClick={() => onOrderLandingPage(referral)}
        disabled={busy}
      >
        {busy ? "Requesting…" : "Order Landing Page"}
      </GreenCta>
    );
  }

  if (state === "building") {
    return (
      <div className="flex items-center gap-[8px] w-full rounded-[6px] border border-dashed border-[rgba(255,79,143,0.4)] bg-[rgba(255,79,143,0.04)] px-[14px] py-[10px] text-[#ff4f8f] text-[13px] font-semibold">
        <span
          aria-hidden
          className="h-[10px] w-[10px] rounded-full bg-[#ff4f8f] animate-pulse"
        />
        Building landing page…
      </div>
    );
  }

  // lp_live
  return (
    <PinkCta onClick={() => onAssignChatters(referral)} disabled={busy}>
      {busy ? "Assigning…" : "Assign Chatters"}
    </PinkCta>
  );
};

// ── Reassign modal ────────────────────────────────────────────────────────

const ModalShell = ({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-[16px]"
    onClick={onClose}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[10px] w-full max-w-[440px] p-[20px] flex flex-col gap-[16px]"
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[2px] min-w-0">
          <h3 className="text-white text-[18px] font-bold">{title}</h3>
          {subtitle ? (
            <p className="text-[#9e9e9e] text-[13px] truncate">{subtitle}</p>
          ) : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-[#9e9e9e] hover:text-white text-[20px] leading-none px-[6px]"
        >
          &#x2715;
        </button>
      </div>
      {children}
    </div>
  </div>
);

const ReassignModal = ({
  referral,
  busy,
  onClose,
  onSubmit,
}: {
  referral: Referral;
  busy: boolean;
  onClose: () => void;
  onSubmit: (newReferrerId: string) => void;
}) => {
  const [managers, setManagers] = useState<AccountManagerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    usersApi
      .listAccountManagers()
      .then((list) => {
        if (!alive) return;
        setManagers(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(
          err instanceof Error ? err.message : "Failed to load account managers",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const subject =
    referral.referredUser?.email ??
    referral.metadata?.inviteeEmail ??
    referral.inviteCode;

  return (
    <ModalShell
      title="Reassign promoter"
      subtitle={`Move ${subject} to a different account manager`}
      onClose={onClose}
    >
      {loading ? (
        <p className="text-[#9e9e9e] text-[14px]">Loading account managers…</p>
      ) : error ? (
        <p className="text-[#ff2a2a] text-[14px]">{error}</p>
      ) : managers.length === 0 ? (
        <p className="text-[#9e9e9e] text-[14px]">
          No account managers available to reassign to.
        </p>
      ) : (
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] uppercase tracking-[0.08em] text-[#9e9e9e] font-bold">
            New account manager
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.1)] rounded-[6px] px-[12px] py-[10px] text-white text-[14px] focus:outline-none focus:border-[#ff0f5f]"
          >
            <option value="" disabled>
              Select…
            </option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {formatManagerName(m)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-[8px] pt-[4px]">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-[14px] py-[8px] rounded-[6px] border border-[rgba(255,255,255,0.1)] text-[#9e9e9e] text-[13px] font-bold hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => selectedId && onSubmit(selectedId)}
          disabled={busy || !selectedId}
          className="px-[14px] py-[8px] rounded-[6px] bg-linear-to-b from-[#ff0f5f] to-[#cc0047] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Reassigning…" : "Reassign"}
        </button>
      </div>
    </ModalShell>
  );
};

// ── Assign Chatters modal ─────────────────────────────────────────────────

const AssignChattersModal = ({
  referral,
  busy,
  onClose,
  onSubmit,
}: {
  referral: Referral;
  busy: boolean;
  onClose: () => void;
  onSubmit: (chatterGroupId: string) => void;
}) => {
  const [groups, setGroups] = useState<ChatterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    chatterGroupsApi
      .list()
      .then(({ groups }) => {
        if (!alive) return;
        setGroups(groups);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(
          err instanceof Error ? err.message : "Failed to load chatter groups",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const subject =
    referral.referredUser?.email ??
    referral.metadata?.inviteeEmail ??
    referral.inviteCode;

  return (
    <ModalShell
      title="Assign chatters"
      subtitle={`Link a chatter group to ${subject}`}
      onClose={onClose}
    >
      {loading ? (
        <p className="text-[#9e9e9e] text-[14px]">Loading chatter groups…</p>
      ) : error ? (
        <p className="text-[#ff2a2a] text-[14px]">{error}</p>
      ) : groups.length === 0 ? (
        <p className="text-[#9e9e9e] text-[14px]">
          No chatter groups yet. Create one on the Chatters page first.
        </p>
      ) : (
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] uppercase tracking-[0.08em] text-[#9e9e9e] font-bold">
            Chatter group
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.1)] rounded-[6px] px-[12px] py-[10px] text-white text-[14px] focus:outline-none focus:border-[#ff0f5f]"
          >
            <option value="" disabled>
              Select…
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.tag ? ` · ${g.tag}` : ""} ({g.commissionPercentage}%)
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-[8px] pt-[4px]">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-[14px] py-[8px] rounded-[6px] border border-[rgba(255,255,255,0.1)] text-[#9e9e9e] text-[13px] font-bold hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => selectedId && onSubmit(selectedId)}
          disabled={busy || !selectedId}
          className="px-[14px] py-[8px] rounded-[6px] bg-linear-to-b from-[#ff0f5f] to-[#cc0047] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Assigning…" : "Assign"}
        </button>
      </div>
    </ModalShell>
  );
};
