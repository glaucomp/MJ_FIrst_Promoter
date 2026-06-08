import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SimulateSaleModal,
  type SimulateSaleTarget,
} from '../components/SimulateSaleModal';
import { UserTypeBadge } from '../components/UserTypeBadge';
import {
  modelsApi,
  type AdminStructureChatterGroup,
  type AdminStructureManager,
  type AdminStructureNode,
  type AdminStructurePerson,
  type AdminStructurePromoterUser,
} from '../services/api';

/** Muted status dots — no bright greens/yellows on this page. */
const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'bg-white/50',
  PENDING: 'bg-white/30',
  COMPLETED: 'bg-white/25',
  CANCELLED: 'bg-white/20',
};

/** Shared pill style for tier, role, and commission tags. */
const MUTED_PILL =
  'text-[10px] px-1.5 py-0.5 rounded-md font-medium border border-white/10 bg-white/[0.04] text-tm-text-color08';

const resolveName = (
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
    username?: string | null;
  } | null,
  fallbackEmail?: string | null,
): string => {
  if (user) {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || user.username || user.email || '—';
  }
  return fallbackEmail ?? 'Pending invite';
};

const avatarInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + (parts.at(-1) ?? '')[0]).toUpperCase();
};

const personName = (
  person?: AdminStructurePerson | null,
  fallback = 'Account manager',
): string => {
  if (!person) return fallback;
  return resolveName(person);
};

type NetworkTreeNode = {
  user: AdminStructurePromoterUser;
  referral?: AdminStructureNode;
  children: NetworkTreeNode[];
};

const buildNetworkTree = (manager: AdminStructureManager): NetworkTreeNode[] => {
  const users = manager.promoterUsers ?? [];
  if (users.length === 0) return [];

  const referralByUserId = new Map<string, AdminStructureNode>();
  for (const t1 of manager.referrals) {
    if (t1.referredUser?.id) referralByUserId.set(t1.referredUser.id, t1);
    for (const child of t1.children ?? []) {
      if (child.referredUser?.id) {
        referralByUserId.set(child.referredUser.id, {
          ...t1,
          id: child.id,
          level: child.level,
          status: child.status,
          referredUser: child.referredUser,
          referrer: child.referrer ?? t1.referredUser ?? t1.referrer,
        });
      }
    }
  }

  const userIds = new Set(users.map((u) => u.id));
  const childrenByInviterId = new Map<string, AdminStructurePromoterUser[]>();
  const roots: AdminStructurePromoterUser[] = [];

  for (const user of users) {
    const tier = user.tier ?? 1;
    const inviterId = user.invitedBy?.id;
    const inviterInTeam = inviterId ? userIds.has(inviterId) : false;
    const inviterIsAm =
      !inviterId ||
      inviterId === manager.id ||
      user.invitedBy?.userType === 'ACCOUNT_MANAGER';
    // T2+ promoters belong under their inviter when that inviter is in this team.
    const isDirectUnderAm =
      tier <= 1 &&
      (inviterIsAm || !inviterInTeam);

    if (isDirectUnderAm) {
      roots.push(user);
      continue;
    }

    const siblings = childrenByInviterId.get(inviterId!) ?? [];
    siblings.push(user);
    childrenByInviterId.set(inviterId!, siblings);
  }

  const toNode = (user: AdminStructurePromoterUser): NetworkTreeNode => ({
    user,
    referral: referralByUserId.get(user.id),
    children: (childrenByInviterId.get(user.id) ?? []).map(toNode),
  });

  return roots.map(toNode);
};

const TierBadge = ({ tier }: { tier: number }) => (
  <span
    className={`${MUTED_PILL} ${
      tier <= 1 ? 'text-tm-text-color08' : 'text-tm-text-color09'
    }`}
  >
    {tier <= 1 ? 'T1' : 'T2'}
  </span>
);

const PercentBadge = ({
  label,
  value,
  emphasis = false,
  title,
}: {
  label: string;
  value: number | null | undefined;
  emphasis?: boolean;
  title?: string;
}) => {
  if (value == null) return null;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${
        emphasis
          ? 'border-white/15 bg-white/[0.08] text-white'
          : 'border-white/8 bg-white/[0.03] text-tm-text-color09'
      }`}
      title={title ?? label}
    >
      {label}: {value}%
    </span>
  );
};

const ChatterBadges = ({
  group,
}: {
  group: AdminStructureChatterGroup | null | undefined;
}) => {
  if (!group) return null;
  const perMember =
    group.memberCount > 0
      ? Math.round((group.commissionPercentage / group.memberCount) * 100) / 100
      : null;

  return (
    <>
      <PercentBadge
        label="Chatter"
        value={group.commissionPercentage}
        title={`${group.name} — ${group.commissionPercentage}% of sale split among chatters`}
      />
      {group.memberCount > 0 && perMember != null && (
        <span
          className="text-xs px-2 py-0.5 rounded-full border border-white/8 bg-white/[0.03] text-tm-text-color10"
          title={`${group.memberCount} chatter${group.memberCount !== 1 ? 's' : ''} in ${group.name}`}
        >
          {group.memberCount} chatter{group.memberCount !== 1 ? 's' : ''} · ~{perMember}% each
        </span>
      )}
      {group.memberCount === 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full border border-white/8 bg-white/[0.03] text-tm-text-color10">
          {group.name} · no chatters yet
        </span>
      )}
    </>
  );
};

const SimulateButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-[11px] px-2.5 py-1 rounded-lg border border-white/12 bg-white/[0.04] text-tm-text-color08 hover:text-white hover:bg-white/[0.08] hover:border-white/20 font-medium whitespace-nowrap transition-colors"
  >
    Simulate
  </button>
);

const TreeRow = ({
  name,
  subLabel,
  invitedByLabel,
  statusDotClass,
  badges,
  headerBadges,
  isChild = false,
  isLastChild = false,
  expandButton,
  onSimulate,
}: {
  name: string;
  subLabel: string;
  invitedByLabel?: string;
  statusDotClass?: string;
  badges: ReactNode;
  headerBadges?: ReactNode;
  isChild?: boolean;
  isLastChild?: boolean;
  expandButton?: ReactNode;
  onSimulate?: () => void;
}) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
    {isChild && (
      <>
        <div
          className="bg-white/10"
          style={{
            position: 'absolute',
            left: 16,
            top: isLastChild ? 0 : undefined,
            bottom: isLastChild ? '50%' : 0,
            height: isLastChild ? '50%' : undefined,
            width: 1,
          }}
        />
        <div
          className="bg-white/10"
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            width: 14,
            height: 1,
          }}
        />
      </>
    )}

    <div
      className={`flex flex-1 items-start gap-2.5 ${
        isChild
          ? 'py-2 pl-3 pr-4 ml-9 my-px rounded-md bg-white/[0.02]'
          : 'py-2.5 px-4'
      }`}
    >
      <div
        className={`rounded-full shrink-0 flex items-center justify-center font-semibold border border-white/10 bg-white/[0.06] text-tm-text-color08 ${
          isChild ? 'w-[22px] h-[22px] text-[8px]' : 'w-7 h-7 text-[10px]'
        }`}
      >
        {avatarInitials(name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className="text-white"
            style={{
              fontSize: isChild ? 14 : 16,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </p>
          {headerBadges}
        </div>
        {invitedByLabel && (
          <p className="text-[11px] text-tm-text-color10 mt-0.5 truncate">
            Invited by {invitedByLabel}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          {statusDotClass && (
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`}
            />
          )}
          <span className="text-sm text-tm-text-color08 truncate">{subLabel}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onSimulate && <SimulateButton onClick={onSimulate} />}
        {expandButton}
      </div>
    </div>
  </div>
);

const NetworkNodeEntry = ({
  node,
  manager,
  campaignId,
  onSimulate,
  isChild = false,
  isLastChild = false,
  parentCampaign,
}: {
  node: NetworkTreeNode;
  manager: AdminStructureManager;
  campaignId?: string;
  onSimulate: (target: SimulateSaleTarget) => void;
  isChild?: boolean;
  isLastChild?: boolean;
  parentCampaign?: AdminStructureNode['campaign'];
}) => {
  const [open, setOpen] = useState(true);
  const { user, referral, children } = node;
  const name = resolveName(user);
  const campaign = referral?.campaign ?? user.referralCampaign ?? parentCampaign;
  const status = referral?.status ?? user.referralStatus ?? 'ACTIVE';
  const statusDotClass = STATUS_DOT[status] ?? STATUS_DOT.ACTIVE;
  const tier = user.tier ?? (isChild ? 2 : 1);
  const inviterName = user.invitedBy
    ? personName(user.invitedBy)
    : resolveName(manager);
  const subLabel = [
    user.email,
    children.length > 0 ? `${children.length} referred` : null,
    referral?.campaign?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <TreeRow
        name={name}
        subLabel={subLabel}
        invitedByLabel={inviterName}
        statusDotClass={statusDotClass}
        headerBadges={
          <>
            <TierBadge tier={tier} />
            <UserTypeBadge
              userType={user.userType}
              size="sm"
              className="!bg-transparent !border-white/10 !text-tm-text-color09 !font-medium"
            />
          </>
        }
        badges={
          <>
            <PercentBadge
              label="Primary"
              value={campaign?.commissionRate}
              emphasis
            />
            {campaign?.secondaryRate != null && campaign.secondaryRate > 0 && (
              <PercentBadge
                label={isChild ? 'Upline earns' : 'Referral'}
                value={campaign.secondaryRate}
              />
            )}
            <ChatterBadges group={user.chatterGroup} />
          </>
        }
        isChild={isChild}
        isLastChild={isLastChild}
        onSimulate={() =>
          onSimulate({
            sellerUserId: user.id,
            referralId: referral?.id ?? user.referralId ?? undefined,
            campaignId: campaign?.id ?? campaignId,
            promoterName: name,
            userType: user.userType,
          })
        }
        expandButton={
          children.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Collapse' : 'Expand'}
              className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ml-1 border border-white/10 bg-white/[0.04] transition-colors ${
                open ? 'text-tm-text-color08' : 'text-tm-text-color10'
              }`}
            >
              <span
                className="text-[10px] block transition-transform duration-150"
                style={{ transform: open ? 'rotate(90deg)' : undefined }}
              >
                ▶
              </span>
            </button>
          ) : (
            <div style={{ width: 24, flexShrink: 0 }} />
          )
        }
      />

      {open && children.length > 0 && (
        <div style={{ position: 'relative' }}>
          <div
            className="bg-white/10 absolute left-4 top-0 bottom-0 w-px pointer-events-none"
          />
          {children.map((child, idx) => (
            <NetworkNodeEntry
              key={child.user.id}
              node={child}
              manager={manager}
              campaignId={campaignId}
              onSimulate={onSimulate}
              isChild
              isLastChild={idx === children.length - 1}
              parentCampaign={campaign}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const NetworkTree = ({
  manager,
  onSimulate,
}: {
  manager: AdminStructureManager;
  onSimulate: (target: SimulateSaleTarget) => void;
}) => {
  const roots = buildNetworkTree(manager);
  if (roots.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-tm-text-color09">
        Who invited whom
      </p>
      <p className="text-[11px] text-tm-text-color10 -mt-1">
        T1 — invited by the account manager · T2 — invited by a promoter below
      </p>
      <div className="rounded-xl border border-white/8 bg-tm-text-color01/20 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-white/6 bg-white/[0.02]">
          <p className="text-sm font-medium text-white">
            {resolveName(manager)}
          </p>
          <p className="text-[11px] text-tm-text-color09">Account manager · invites T1 promoters</p>
        </div>
        <div className="py-1">
          {roots.map((node) => (
            <NetworkNodeEntry
              key={node.user.id}
              node={node}
              manager={manager}
              campaignId={manager.publicCampaign?.id}
              onSimulate={onSimulate}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const ManagerSection = ({
  manager,
  defaultOpen,
  onSimulate,
}: {
  manager: AdminStructureManager;
  defaultOpen: boolean;
  onSimulate: (target: SimulateSaleTarget) => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const name = resolveName(manager);

  return (
    <div className="rounded-lg bg-tm-neutral-color05 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span
          className={`text-[10px] text-tm-text-color09 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-lg font-medium truncate">{name}</p>
          <p className="text-sm text-tm-text-color08 truncate">{manager.email}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
          {manager.amPercent != null && (
            <PercentBadge label="AM" value={manager.amPercent} />
          )}
          {manager.publicCampaign && (
            <>
              <PercentBadge
                label="Primary"
                value={manager.publicCampaign.commissionRate}
              />
              {manager.publicCampaign.secondaryRate != null &&
                manager.publicCampaign.secondaryRate > 0 && (
                  <PercentBadge
                    label="Referral"
                    value={manager.publicCampaign.secondaryRate}
                  />
                )}
            </>
          )}
        </div>
        <div className="text-right shrink-0 pl-2">
          <p className="text-white text-sm font-medium">{manager.stats.t1Count} T1</p>
          <p className="text-tm-text-color09 text-xs">{manager.stats.t2Count} T2</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 flex flex-col gap-3">
          {manager.publicCampaign ? (
            <div className="rounded-md bg-tm-text-color01/40 px-3 py-2 text-sm text-tm-text-color08">
              Campaign:{' '}
              <span className="text-white">{manager.publicCampaign.name}</span>
              {!manager.publicCampaign.isActive && (
                <span className="ml-2 text-tm-danger-color05">(inactive)</span>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-tm-danger-color12/40 border border-tm-danger-color09/30 px-3 py-2 text-sm text-tm-danger-color02">
              No linked public campaign — assign this account manager to a campaign.
            </div>
          )}

          <NetworkTree manager={manager} onSimulate={onSimulate} />

          {(manager.promoterUsers?.length ?? 0) === 0 && (
              <p className="text-sm text-tm-text-color09 py-4 text-center">
                No promoters under this account manager yet.
              </p>
            )}
        </div>
      )}
    </div>
  );
};

export const AdminStructure = () => {
  const [managers, setManagers] = useState<AdminStructureManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [simulateTarget, setSimulateTarget] = useState<SimulateSaleTarget | null>(null);

  useEffect(() => {
    modelsApi
      .getAdminStructure()
      .then(setManagers)
      .catch(() => setError('Could not load structure. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return managers;
    return managers.filter((m) => {
      const name = resolveName(m).toLowerCase();
      return (
        name.includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.publicCampaign?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [managers, search]);

  const totals = useMemo(
    () => ({
      managers: managers.length,
      t1: managers.reduce((s, m) => s + m.stats.t1Count, 0),
      t2: managers.reduce((s, m) => s + m.stats.t2Count, 0),
    }),
    [managers],
  );

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="text-3xl leading-[36px] font-semibold text-white">
          Commission Structure
        </h1>
        <p className="text-base text-tm-text-color08 mt-1">
          See who invited whom under each account manager, with commission percentages. Use Simulate to preview a sale split.
        </p>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Account Managers', value: totals.managers },
            { label: 'T1 Promoters', value: totals.t1 },
            { label: 'T2 Referrals', value: totals.t2 },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg px-4 py-4 bg-tm-neutral-color05">
              <p className="text-sm text-tm-text-color10 mb-1">{label}</p>
              <p className="text-white text-xl font-medium">{value}</p>
            </div>
          ))}
        </div>
      )}

      <input
        type="search"
        placeholder="Search by name, email, or campaign…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md bg-tm-text-color01/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-tm-text-color09 focus:outline-none focus:border-tm-primary-color04"
      />

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-tm-text-color01/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg py-4 px-5 text-sm bg-[rgba(239,68,68,0.1)] text-tm-danger-color01 border border-tm-danger-color12">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-tm-text-color09 py-8 text-center">
          {search ? 'No account managers match your search.' : 'No account managers found.'}
        </p>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-3">
          {filtered.map((manager, idx) => (
            <ManagerSection
              key={manager.id}
              manager={manager}
              defaultOpen={idx === 0 || filtered.length === 1}
              onSimulate={setSimulateTarget}
            />
          ))}
        </div>
      )}

      {simulateTarget && (
        <SimulateSaleModal
          target={simulateTarget}
          onClose={() => setSimulateTarget(null)}
        />
      )}
    </div>
  );
};
