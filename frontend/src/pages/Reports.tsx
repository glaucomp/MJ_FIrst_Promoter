import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { commissionApi, modelsApi, type Commission, type ApiUser, type Referral } from '../services/api';
import { Chart } from '../components/Chart';

// ─── types & constants ───────────────────────────────────────────────────────

type Period = 'week' | 'month' | '3month' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Last Week',
  month: 'Last Month',
  '3month': 'Last 3 Months',
  all: 'All Time',
};

const PERIOD_DAYS: Record<Period, number> = {
  week: 7,
  month: 30,
  '3month': 90,
  all: 0,
};

const ITEMS_PER_PAGE = 8;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── helpers ─────────────────────────────────────────────────────────────────

const isTier1 = (c: Commission) =>
  c.campaign?.commissionRate != null && c.percentage === c.campaign.commissionRate;

const txLabel = (c: Commission): string => {
  if (c.amount < 0) return 'Refund';
  if (isTier1(c)) return 'Deposit';
  const ut = c.user.userType?.toLowerCase() ?? '';
  if (ut === 'account_manager' || ut === 'team_manager') return 'Manager';
  return 'Promoter';
};

const cutoffMs = (days: number) =>
  days > 0 ? Date.now() - days * 86_400_000 : 0;

const filterByPeriod = <T extends { createdAt: string }>(items: T[], period: Period): T[] => {
  if (period === 'all') return items;
  const ms = cutoffMs(PERIOD_DAYS[period]);
  return items.filter(i => new Date(i.createdAt).getTime() >= ms);
};

const prevPeriod = <T extends { createdAt: string }>(items: T[], period: Period): T[] => {
  if (period === 'all') return items;
  const days = PERIOD_DAYS[period];
  const now = Date.now();
  const start = now - days * 2 * 86_400_000;
  const end = now - days * 86_400_000;
  return items.filter(i => {
    const t = new Date(i.createdAt).getTime();
    return t >= start && t < end;
  });
};

const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
};

const buildChart = (commissions: Commission[]) => {
  const byDay = new Array<number>(7).fill(0);
  commissions.forEach(c => {
    if (c.amount > 0) byDay[(new Date(c.createdAt).getDay() + 6) % 7] += c.amount;
  });
  return { labels: DAYS, values: byDay.map(v => Math.max(v, 0.01)) };
};

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sumPositive = (items: Commission[]) =>
  items.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);

const sumRefunded = (items: Commission[]) =>
  items.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);

// ─── small UI pieces ─────────────────────────────────────────────────────────

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-[12px] overflow-hidden ${className}`}
    style={{
      background: 'linear-gradient(180deg,#252628 0%,#202022 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    {children}
  </div>
);

const HDivider = () => <div className="h-px bg-[rgba(255,255,255,0.06)]" />;

const SectionTitle = ({
  icon, label,
}: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-[6px] py-[6px]">
    <span className="text-[#9e9e9e] text-[14px] leading-none">{icon}</span>
    <span className="text-[13px] font-semibold text-[#9e9e9e]">{label}</span>
  </div>
);

interface BadgeProps { value: number; positive: boolean }
const ChangeBadge = ({ value, positive }: BadgeProps) => (
  <span
    className="inline-flex items-center gap-[3px] text-[12px] font-bold px-[10px] py-[4px] rounded-full"
    style={{
      background: positive ? '#10b981' : '#ef4444',
      color: 'white',
    }}
  >
    {positive ? '↑' : '↓'} {Math.abs(value)}%
  </span>
);

// ─── main component ───────────────────────────────────────────────────────────

export const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.baseRole === 'admin';
  const isManager =
    user?.baseRole === 'account_manager' ||
    (user?.baseRole === 'team_manager' && user?.role === 'team_manager');
  const isPromoter =
    user?.baseRole === 'promoter' ||
    (user?.baseRole === 'team_manager' && user?.role === 'promoter');

  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [allUsers, setAllUsers] = useState<ApiUser[]>([]);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const tasks: Promise<unknown>[] = [
      commissionApi.getAll().then(setCommissions).catch(() => setCommissions([])),
    ];
    if (isAdmin) {
      tasks.push(modelsApi.getAllUsers().then(setAllUsers).catch(() => setAllUsers([])));
    }
    if (isManager) {
      tasks.push(modelsApi.getMyReferrals().then(setMyReferrals).catch(() => setMyReferrals([])));
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [isAdmin, isManager]);

  // ── filtered slices ──────────────────────────────────────────────────────

  const curr = useMemo(() => filterByPeriod(commissions, period), [commissions, period]);
  const prev = useMemo(() => prevPeriod(commissions, period), [commissions, period]);

  const chartData = useMemo(() => buildChart(curr), [curr]);

  const currTotal = useMemo(() => sumPositive(curr), [curr]);
  const prevTotal = useMemo(() => sumPositive(prev), [prev]);
  const totalChange = useMemo(() => pctChange(currTotal, prevTotal), [currTotal, prevTotal]);

  const currPaid = useMemo(
    () => curr.filter(c => c.status === 'paid' && c.amount > 0).reduce((s, c) => s + c.amount, 0),
    [curr],
  );
  const currPending = useMemo(
    () => curr.filter(c => c.status !== 'paid' && c.amount > 0).reduce((s, c) => s + c.amount, 0),
    [curr],
  );

  const currRefunded = useMemo(() => sumRefunded(curr), [curr]);
  const prevRefunded = useMemo(() => sumRefunded(prev), [prev]);
  const refundChange = useMemo(() => pctChange(currRefunded, prevRefunded), [currRefunded, prevRefunded]);

  const sortedTx = useMemo(
    () => [...curr].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [curr],
  );
  const totalPages = Math.max(1, Math.ceil(sortedTx.length / ITEMS_PER_PAGE));
  const pageTx = sortedTx.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── workforce / user stats ───────────────────────────────────────────────

  const nonAdmin = useMemo(() => allUsers.filter(u => u.userType?.toLowerCase() !== 'admin'), [allUsers]);

  const wf = useMemo(() => ({
    accountManagers: nonAdmin.filter(u => u.userType?.toLowerCase() === 'account_manager').length,
    promoters: nonAdmin.filter(u => u.userType?.toLowerCase() === 'promoter').length,
    referralManagers: nonAdmin.filter(u => u.userType?.toLowerCase() === 'team_manager').length,
  }), [nonAdmin]);

  const newUsersCount = useMemo(
    () => filterByPeriod(nonAdmin, period).length,
    [nonAdmin, period],
  );
  const idleCount = useMemo(
    () => nonAdmin.filter(u => (u.stats?.totalEarnings ?? 0) === 0).length,
    [nonAdmin],
  );
  const unpaidCount = useMemo(
    () => nonAdmin.filter(u => (u.stats?.pendingEarnings ?? 0) > 0).length,
    [nonAdmin],
  );

  // ── manager: top performers & stats ─────────────────────────────────────

  const topPerformers = useMemo(() => {
    if (!isManager) return [];
    const tier2 = curr.filter(c => !isTier1(c) && c.amount > 0 && c.referral?.referrer);
    const byInfluencer = new Map<string, { name: string; revenue: number }>();
    tier2.forEach(c => {
      const ref = c.referral!.referrer;
      const key = `${ref.firstName} ${ref.lastName}`;
      const entry = byInfluencer.get(key);
      const rev = c.customer?.revenue ?? 0;
      if (entry) {
        entry.revenue += rev;
      } else {
        byInfluencer.set(key, { name: key, revenue: rev });
      }
    });
    return Array.from(byInfluencer.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [curr, isManager]);

  const promoterCount = myReferrals.filter(r => r.referredUser != null).length;
  const managedCustomerCount = useMemo(
    () => new Set(curr.filter(c => !isTier1(c) && c.customer?.id).map(c => c.customer!.id)).size,
    [curr],
  );

  // ── promoter: top customers & user stats ─────────────────────────────────

  // All unique customers ever (all-time)
  const allCustomers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; revenue: number }>();
    commissions.forEach(c => {
      if (c.customer?.id && !map.has(c.customer.id)) {
        map.set(c.customer.id, {
          id: c.customer.id,
          name: c.customer.name || c.customer.email,
          revenue: c.customer.revenue,
        });
      }
    });
    return Array.from(map.values());
  }, [commissions]);

  // Customer IDs that appear in the current period
  const currCustomerIds = useMemo(
    () => new Set(curr.filter(c => c.customer?.id).map(c => c.customer!.id)),
    [curr],
  );

  // Top customers by revenue in current period
  const topCustomers = useMemo(() => {
    if (!isPromoter) return [];
    const map = new Map<string, { name: string; revenue: number }>();
    curr.forEach(c => {
      if (!c.customer?.id) return;
      if (!map.has(c.customer.id)) {
        map.set(c.customer.id, {
          name: c.customer.name || c.customer.email,
          revenue: c.customer.revenue,
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [curr, isPromoter]);

  const newCustomerCount = currCustomerIds.size;
  // Idle = customers seen all-time but NOT in the current period
  const idleCustomerCount = useMemo(
    () => allCustomers.filter(c => !currCustomerIds.has(c.id)).length,
    [allCustomers, currCustomerIds],
  );
  // Unpaid = unique customers with at least one pending commission
  const unpaidCustomerCount = useMemo(
    () =>
      new Set(
        commissions.filter(c => c.status !== 'paid' && c.customer?.id).map(c => c.customer!.id),
      ).size,
    [commissions],
  );

  const selectPeriod = (p: Period) => { setPeriod(p); setPeriodOpen(false); setPage(1); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[80px]">
        <span className="text-[#9e9e9e] text-[16px]">Loading reports…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-white font-['DM_Sans',sans-serif]">Reports</h1>
        <div className="flex items-center gap-[8px]">
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(o => !o)}
              className="flex items-center gap-[6px] bg-[#2a2a2a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[12px] py-[7px] text-[13px] text-white hover:bg-[#333] transition-colors"
            >
              {PERIOD_LABELS[period]}
              <span className="text-[10px] text-[#9e9e9e]">▾</span>
            </button>
            {periodOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close dropdown"
                  className="fixed inset-0 z-10 cursor-default bg-transparent border-none p-0"
                  onClick={() => setPeriodOpen(false)}
                />
                <div
                  className="absolute right-0 top-[38px] z-20 rounded-[8px] py-[4px] min-w-[150px]"
                  style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                >
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => selectPeriod(p)}
                      className="w-full text-left px-[14px] py-[8px] text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                      style={{ color: period === p ? '#ff0f5f' : 'white' }}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="flex items-center justify-center w-[34px] h-[34px] bg-[#2a2a2a] border border-[rgba(255,255,255,0.08)] rounded-[8px] text-[15px] hover:bg-[#333] transition-colors">
            📅
          </button>
        </div>
      </div>

      {/* ── Ledger card ── */}
      <Card>
        {/* Header */}
        <div className="flex items-center gap-[6px] px-[16px] pt-[14px] pb-[10px]">
          <span className="text-[#9e9e9e] text-[14px]">▐</span>
          <span className="text-[13px] font-semibold text-[#9e9e9e]">Ledger</span>
        </div>

        {/* Chart */}
        <div className="px-[12px] pb-[12px]">
          <Chart data={chartData} className="h-[130px]" />
        </div>

        {isAdmin && (
          <>
            <HDivider />
            {/* TRANSACTIONS */}
            <div className="px-[16px] py-[14px] flex flex-col gap-[6px]">
              <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">Transactions</span>
              <span className="text-[26px] font-bold text-white leading-none">${money(currTotal)}</span>
              {totalChange !== null && (
                <div>
                  <ChangeBadge value={totalChange} positive={totalChange >= 0} />
                </div>
              )}
            </div>
          </>
        )}

        <HDivider />

        {/* Paid / Pending — each in its own box */}
        <div className="grid grid-cols-2 gap-[8px] p-[12px]">
          <div
            className="flex flex-col gap-[3px] px-[12px] py-[10px] rounded-[8px]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Paid</span>
            <span className="text-[17px] font-bold text-white">${money(currPaid)}</span>
          </div>
          <div
            className="flex flex-col gap-[3px] px-[12px] py-[10px] rounded-[8px]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Pending</span>
            <span className="text-[17px] font-bold text-white">${money(currPending)}</span>
          </div>
        </div>

        <HDivider />

        {/* Refunded */}
        <div className="flex items-center justify-between px-[16px] py-[14px]">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Refunded</span>
            <span className="text-[17px] font-bold text-white">${money(currRefunded)}</span>
          </div>
          {refundChange !== null && refundChange !== 0 && (
            <ChangeBadge value={refundChange} positive={refundChange < 0} />
          )}
        </div>

        {/* PROMOTERS / USERS — manager only */}
        {isManager && (
          <>
            <HDivider />
            <div className="grid grid-cols-2 gap-[8px] p-[12px]">
              <div
                className="flex flex-col gap-[3px] px-[12px] py-[10px] rounded-[8px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Promoters</span>
                <span className="text-[17px] font-bold text-white">{promoterCount}</span>
              </div>
              <div
                className="flex flex-col gap-[3px] px-[12px] py-[10px] rounded-[8px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Users</span>
                <span className="text-[17px] font-bold text-white">{managedCustomerCount}</span>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── Transactions List ── */}
      <Card>
        <button
          onClick={() => setTxOpen(o => !o)}
          className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        >
          <span className="text-[14px] font-semibold text-white">Transactions List</span>
          <span className="text-[11px] text-[#9e9e9e]">{txOpen ? '▴' : '▾'}</span>
        </button>

        {txOpen && (
          <>
            <HDivider />
            {pageTx.length === 0 ? (
              <div className="flex flex-col items-center py-[40px] gap-[8px]">
                <span className="text-[32px]">📊</span>
                <span className="text-[14px] text-[#9e9e9e]">No transactions for this period</span>
              </div>
            ) : (
              pageTx.map((tx, i) => {
                const label = txLabel(tx);
                const positive = tx.amount >= 0;
                const tier1 = isTier1(tx);
                let tierNum: number | null = null;
                if (tx.amount >= 0) tierNum = tier1 ? 1 : 2;
                const tierColor = tier1 ? '#3b82f6' : '#f59e0b';
                const dt = new Date(tx.createdAt);
                const d = String(dt.getDate()).padStart(2, '0');
                const m = String(dt.getMonth() + 1).padStart(2, '0');
                const y = String(dt.getFullYear()).slice(-2);
                const h = String(dt.getHours()).padStart(2, '0');
                const min = String(dt.getMinutes()).padStart(2, '0');
                return (
                  <div key={tx.id}>
                    {i > 0 && <HDivider />}
                    <div className="flex items-start gap-[12px] px-[16px] py-[12px] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      {/* Tier badge */}
                      {tierNum !== null && (
                        <div
                          className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-px"
                          style={{ background: tierColor }}
                        >
                          {tierNum}
                        </div>
                      )}

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-[6px]">
                          <span className="text-[14px] font-medium text-white">{label}</span>
                          {isAdmin && (
                            <span className="text-[12px] text-[#9e9e9e] truncate">
                              {tx.user.firstName} {tx.user.lastName}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#555] mt-px">{d}/{m}/{y} {h}:{min}</div>
                        {isAdmin && tx.customer && (
                          <div className="text-[11px] text-[#666] mt-px truncate">
                            {tx.customer.name || tx.customer.email}
                            {tx.customer.revenue > 0 && (
                              <span className="text-[#555]"> · sale ${money(tx.customer.revenue)}</span>
                            )}
                          </div>
                        )}
                        {isAdmin && tx.campaign && (
                          <span
                            className="inline-flex items-center gap-[3px] mt-[4px] px-[6px] py-px rounded-full text-[10px] font-semibold text-white"
                            style={{ background: 'rgba(255,15,95,0.2)', border: '1px solid rgba(255,15,95,0.3)' }}
                          >
                            {tx.campaign.name}
                          </span>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <div
                          className="text-[14px] font-bold"
                          style={{ color: positive ? '#10b981' : '#ef4444' }}
                        >
                          {positive ? '+' : '-'}${money(Math.abs(tx.amount))}
                        </div>
                        <div className="text-[11px] text-[#555] mt-px">{tx.percentage}%</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-[4px] px-[16px] py-[12px] border-t border-[rgba(255,255,255,0.05)]">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="w-[28px] h-[28px] rounded-[6px] text-[13px] font-medium transition-colors"
                      style={{
                        background: page === p ? '#ff0f5f' : 'transparent',
                        color: page === p ? 'white' : '#9e9e9e',
                        border: page === p ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
                {page < totalPages && (
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    className="w-[28px] h-[28px] rounded-[6px] text-[13px] text-[#9e9e9e] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors"
                  >
                    ›
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Top Users ── (promoter only) */}
      {isPromoter && (
        <>
          <Card>
            <div className="flex items-center gap-[6px] px-[16px] pt-[14px] pb-[10px]">
              <span className="text-[#9e9e9e] text-[14px]">≡</span>
              <span className="text-[13px] font-semibold text-[#9e9e9e]">Top Users</span>
            </div>
            <HDivider />

            {topCustomers.length === 0 ? (
              <div className="flex flex-col items-center py-[32px] gap-[8px]">
                <span className="text-[28px]">👤</span>
                <span className="text-[13px] text-[#9e9e9e]">No customer data for this period</span>
              </div>
            ) : (
              topCustomers.map(({ name, revenue }, idx) => {
                const initials = name
                  .split(/[\s@.]+/)
                  .filter(Boolean)
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                const avatarColors = [
                  '#ff0f5f', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
                  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
                ];
                const avatarBg = avatarColors[idx % avatarColors.length];
                return (
                  <div key={name}>
                    {idx > 0 && <HDivider />}
                    <div className="flex items-center gap-[12px] px-[16px] py-[12px] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <div
                        className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ background: avatarBg }}
                      >
                        {initials}
                      </div>
                      <span className="flex-1 text-[14px] text-white truncate">{name}</span>
                      <span className="text-[14px] font-semibold text-white shrink-0">
                        ${money(revenue)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {/* USERS stat card */}
          <Card>
            {/* Total */}
            <div className="px-[16px] py-[14px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">Users</span>
                {newCustomerCount > 0 && (
                  <span className="inline-flex items-center gap-[3px] text-[12px] font-bold px-[10px] py-[4px] rounded-full bg-[#10b981] text-white">
                    ↑ {newCustomerCount}
                  </span>
                )}
              </div>
              <div className="text-[26px] font-bold text-white mt-[4px] leading-none">
                {allCustomers.length.toLocaleString()}
              </div>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Idle</span>
              <span className="text-[14px] font-semibold text-white">{idleCustomerCount.toLocaleString()}</span>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Unpaid</span>
              <span className="text-[14px] font-semibold text-white">{unpaidCustomerCount.toLocaleString()}</span>
            </div>

            <HDivider />

            <button
              onClick={() => navigate('/models')}
              className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
            >
              <span className="text-[14px] font-medium text-white">View Details</span>
              <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">›</span>
            </button>
          </Card>
        </>
      )}

      {/* ── Top Performers ── (manager only) */}
      {isManager && (
        <Card>
          {/* Section header */}
          <div className="flex items-center gap-[6px] px-[16px] pt-[14px] pb-[10px]">
            <span className="text-[#9e9e9e] text-[14px]">≡</span>
            <span className="text-[13px] font-semibold text-[#9e9e9e]">Top Performers</span>
          </div>
          <HDivider />

          {topPerformers.length === 0 ? (
            <div className="flex flex-col items-center py-[32px] gap-[8px]">
              <span className="text-[28px]">📈</span>
              <span className="text-[13px] text-[#9e9e9e]">No performance data for this period</span>
            </div>
          ) : (
            topPerformers.map(({ name, revenue }, idx) => {
              const initials = name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const avatarColors = [
                '#ff0f5f', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
                '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
              ];
              const avatarBg = avatarColors[idx % avatarColors.length];

              return (
                <div key={name}>
                  {idx > 0 && <HDivider />}
                  <div className="flex items-center gap-[12px] px-[16px] py-[12px] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    {/* Avatar */}
                    <div
                      className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                      style={{ background: avatarBg }}
                    >
                      {initials}
                    </div>
                    {/* Name */}
                    <span className="flex-1 text-[14px] text-white">{name}</span>
                    {/* Revenue */}
                    <span className="text-[14px] font-semibold text-white">
                      ${money(revenue)}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          <HDivider />

          {/* Manage Influencers link */}
          <button
            onClick={() => navigate('/models')}
            className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
          >
            <span className="text-[14px] font-medium" style={{ color: '#ff0f5f' }}>
              Manage Influencers
            </span>
            <span className="text-[18px] group-hover:translate-x-[2px] transition-transform" style={{ color: '#ff0f5f' }}>›</span>
          </button>
        </Card>
      )}

      {/* ── Workforce ── (admin only) */}
      {isAdmin && (
        <div className="flex flex-col gap-[6px]">
          <SectionTitle icon="△" label="Workforce" />
          {[
            { label: 'Account Managers', count: wf.accountManagers },
            { label: 'Promoters', count: wf.promoters },
            { label: 'Referral Managers', count: wf.referralManagers },
          ].map(({ label, count }) => (
            <Card key={label}>
              <button
                onClick={() => navigate('/models')}
                className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
              >
                <div className="text-left">
                  <div className="text-[13px] text-[#9e9e9e]">{label}</div>
                  <div className="text-[20px] font-bold text-white mt-px">{count.toLocaleString()}</div>
                </div>
                <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">›</span>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* ── Users ── (admin only) */}
      {isAdmin && (
        <div className="flex flex-col gap-[6px]">
          <SectionTitle icon="👥" label="Users" />
          <Card>
            {/* USERS total */}
            <div className="px-[16px] py-[14px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">Users</span>
                {newUsersCount > 0 && (
                  <span className="inline-flex items-center gap-[3px] text-[12px] font-bold px-[10px] py-[4px] rounded-full bg-[#10b981] text-white">
                    ↑ {newUsersCount}
                  </span>
                )}
              </div>
              <div className="text-[26px] font-bold text-white mt-[4px] leading-none">
                {nonAdmin.length.toLocaleString()}
              </div>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Idle</span>
              <span className="text-[14px] font-semibold text-white">{idleCount.toLocaleString()}</span>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Unpaid</span>
              <span className="text-[14px] font-semibold text-white">{unpaidCount.toLocaleString()}</span>
            </div>

            <HDivider />

            <button
              onClick={() => navigate('/models')}
              className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
            >
              <span className="text-[14px] font-medium text-white">View Details</span>
              <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">›</span>
            </button>
          </Card>
        </div>
      )}

    </div>
  );
};
