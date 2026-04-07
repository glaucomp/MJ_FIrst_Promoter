import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { commissionApi, type Commission } from '../services/api';

const isTier1 = (c: Commission): boolean =>
  c.campaign?.commissionRate != null &&
  c.percentage === c.campaign.commissionRate;

const StatusBadge = ({ status }: { status: Commission['status'] }) => {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[11px] font-semibold text-[#10b981] bg-[#10b98122] border border-[#10b98133]">
        ✓ Paid
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[11px] font-semibold text-[#fbbf24] bg-[#fbbf2422] border border-[#fbbf2433]">
        ⏳ Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[11px] font-semibold text-[#9e9e9e] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]">
      ○ Unpaid
    </span>
  );
};

type StatusFilter = 'all' | 'unpaid' | 'pending' | 'paid';

export const Commissions = () => {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetchCommissions();
  }, []);

  const fetchCommissions = async () => {
    try {
      const data = await commissionApi.getAll();
      setCommissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'unpaid' | 'pending' | 'paid') => {
    setUpdatingId(id);
    setOpenMenuId(null);
    try {
      const updated = await commissionApi.updateStatus(id, status);
      setCommissions(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return commissions.filter(c => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${c.user.firstName} ${c.user.lastName}`.toLowerCase();
        const email = c.user.email.toLowerCase();
        const campaign = c.campaign?.name?.toLowerCase() ?? '';
        const customer = c.customer?.email?.toLowerCase() ?? '';
        if (!name.includes(q) && !email.includes(q) && !campaign.includes(q) && !customer.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [commissions, filter, search]);

  // Summary card calculations
  const pending = useMemo(() => commissions.filter(c => c.status === 'unpaid' || c.status === 'pending'), [commissions]);
  const completed = useMemo(() => commissions.filter(c => c.status === 'paid'), [commissions]);

  const pendingEarnings = useMemo(() => {
    const seen = new Map<string, number>();
    pending.forEach(c => {
      if (isTier1(c) && c.customer?.id) seen.set(c.customer.id, c.customer.revenue ?? 0);
    });
    return Array.from(seen.values()).reduce((s, v) => s + v, 0);
  }, [pending]);

  const pendingCommissions = useMemo(() => pending.reduce((s, c) => s + c.amount, 0), [pending]);

  const completedEarnings = useMemo(() => {
    const seen = new Map<string, number>();
    completed.forEach(c => {
      if (isTier1(c) && c.customer?.id) seen.set(c.customer.id, c.customer.revenue ?? 0);
    });
    return Array.from(seen.values()).reduce((s, v) => s + v, 0);
  }, [completed]);

  const completedCommissions = useMemo(() => completed.reduce((s, c) => s + c.amount, 0), [completed]);

  const tabCounts = useMemo(() => ({
    all: commissions.length,
    unpaid: commissions.filter(c => c.status === 'unpaid').length,
    pending: commissions.filter(c => c.status === 'pending').length,
    paid: commissions.filter(c => c.status === 'paid').length,
  }), [commissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[60px]">
        <div className="text-[#9e9e9e] text-[16px]">Loading commissions…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {/* Header */}
      <div>
        <h1 className="text-[28px] leading-[36px] font-semibold text-white font-['DM_Sans',sans-serif]">
          Commissions
        </h1>
        <p className="text-[14px] text-[#9e9e9e] mt-[4px]">
          {user?.baseRole === 'admin' ? 'All promoters' : 'Your earnings'} — tier 1 &amp; tier 2
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-[12px]">
        {/* Pending Earnings */}
        <div
          className="rounded-[12px] p-[20px] flex flex-col gap-[8px]"
          style={{
            background: 'linear-gradient(135deg, #3a1a00 0%, #2a1200 100%)',
            border: '1px solid rgba(251,191,36,0.2)',
          }}
        >
          <span className="text-[12px] text-[#fbbf24] font-medium uppercase tracking-[0.08em]">Pending Earnings</span>
          <span className="text-[26px] font-bold text-white leading-none">${pendingEarnings.toFixed(2)}</span>
          <span className="text-[11px] text-[#9e9e9e]">Tier 1 sales revenue</span>
        </div>

        {/* Pending Commissions */}
        <div
          className="rounded-[12px] p-[20px] flex flex-col gap-[8px]"
          style={{
            background: 'linear-gradient(135deg, #1a0a2e 0%, #120820 100%)',
            border: '1px solid rgba(139,92,246,0.25)',
          }}
        >
          <span className="text-[12px] text-[#a78bfa] font-medium uppercase tracking-[0.08em]">Pending Commissions</span>
          <span className="text-[26px] font-bold text-white leading-none">${pendingCommissions.toFixed(2)}</span>
          <span className="text-[11px] text-[#9e9e9e]">Tier 1 + tier 2 total</span>
        </div>

        {/* Completed Earnings */}
        <div
          className="rounded-[12px] p-[20px] flex flex-col gap-[8px]"
          style={{
            background: 'linear-gradient(135deg, #001a0e 0%, #001208 100%)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <span className="text-[12px] text-[#10b981] font-medium uppercase tracking-[0.08em]">Completed Earnings</span>
          <span className="text-[26px] font-bold text-white leading-none">${completedEarnings.toFixed(2)}</span>
          <span className="text-[11px] text-[#9e9e9e]">Tier 1 sales paid</span>
        </div>

        {/* Completed Commissions */}
        <div
          className="rounded-[12px] p-[20px] flex flex-col gap-[8px]"
          style={{
            background: 'linear-gradient(135deg, #001a10 0%, #000f09 100%)',
            border: '1px solid rgba(5,150,105,0.2)',
          }}
        >
          <span className="text-[12px] text-[#059669] font-medium uppercase tracking-[0.08em]">Completed Commissions</span>
          <span className="text-[26px] font-bold text-white leading-none">${completedCommissions.toFixed(2)}</span>
          <span className="text-[11px] text-[#9e9e9e]">Tier 1 + tier 2 paid</span>
        </div>
      </div>

      {error && (
        <div className="bg-[#3a0000] border border-[#cc0000] rounded-[8px] p-[12px] text-[#ff8080] text-[13px]">
          {error}
        </div>
      )}

      {/* Table Card */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #23252a 0%, #212121 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0px 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Tabs */}
        <div className="flex border-b border-[rgba(255,255,255,0.05)] px-[16px]">
          {(['all', 'unpaid', 'pending', 'paid'] as StatusFilter[]).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-[16px] py-[14px] text-[13px] font-medium border-b-2 transition-colors capitalize -mb-px ${
                filter === tab
                  ? 'border-[#ff0f5f] text-[#ff0f5f]'
                  : 'border-transparent text-[#9e9e9e] hover:text-white'
              }`}
            >
              {tab} <span className="opacity-50 ml-[4px]">({tabCounts[tab]})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-[16px] py-[12px] border-b border-[rgba(255,255,255,0.05)]">
          <div className="relative">
            <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#9e9e9e] text-[14px]">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, campaign…"
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] pl-[34px] pr-[12px] py-[8px] text-[13px] text-white placeholder-[#9e9e9e] focus:outline-none focus:border-[rgba(255,15,95,0.4)]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)]">
                {(
                  [
                    { label: 'Promoter', align: 'left' },
                    { label: 'Sale', align: 'left' },
                    { label: 'Commission', align: 'right' },
                    { label: 'Date', align: 'left' },
                    { label: 'Customer', align: 'left' },
                    { label: 'Campaign', align: 'left' },
                    { label: 'Status', align: 'left' },
                    { label: '', align: 'right' },
                  ] as { label: string; align: string }[]
                ).map(({ label, align }) => (
                  <th
                    key={label || 'actions'}
                    className="px-[16px] py-[10px] text-[11px] font-semibold text-[#666] uppercase tracking-[0.06em] whitespace-nowrap"
                    style={{ textAlign: align as 'left' | 'right' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(commission => {
                const tier1 = isTier1(commission);
                const isUpdating = updatingId === commission.id;

                return (
                  <tr
                    key={commission.id}
                    className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    {/* Promoter */}
                    <td className="px-[16px] py-[14px]">
                      <div className="flex items-center gap-[10px]">
                        <div
                          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                          style={{ background: tier1 ? '#3b82f6' : '#f59e0b' }}
                        >
                          {commission.user.firstName[0]}{commission.user.lastName[0]}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium text-white">
                            {commission.user.firstName} {commission.user.lastName}
                          </div>
                          <div className="text-[11px] text-[#9e9e9e]">{commission.user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Sale */}
                    <td className="px-[16px] py-[14px]">
                      <div className="flex items-center gap-[6px]">
                        <span className="text-[13px] text-white font-medium">
                          ${commission.customer?.revenue?.toFixed(2) ?? '—'}
                        </span>
                        <span
                          className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white"
                          style={{ background: tier1 ? '#3b82f6' : '#f59e0b' }}
                        >
                          {tier1 ? '1' : '2'}
                        </span>
                      </div>
                      {!tier1 && commission.description && (() => {
                        const match = /From (.+?)'s sale/.exec(commission.description ?? '');
                        return (
                          <div className="text-[11px] text-[#9e9e9e] mt-[2px]">
                            {match?.[1] ? `from ${match[1]}` : commission.description}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Commission Amount */}
                    <td className="px-[16px] py-[14px] text-right">
                      <div className="flex items-center justify-end gap-[6px]">
                        <span className="text-[13px] text-white font-medium">
                          ${commission.amount.toFixed(2)}
                        </span>
                        <span
                          className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white"
                          style={{ background: tier1 ? '#3b82f6' : '#f59e0b' }}
                        >
                          {tier1 ? '1' : '2'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9e9e9e] text-right">{commission.percentage}%</div>
                    </td>

                    {/* Date */}
                    <td className="px-[16px] py-[14px]">
                      <div className="text-[13px] text-white">
                        {new Date(commission.createdAt).toLocaleDateString('en-US', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </div>
                      <div className="text-[11px] text-[#9e9e9e]">
                        {new Date(commission.createdAt).toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        })}
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="px-[16px] py-[14px]">
                      <div className="text-[13px] text-white">{commission.customer?.name || '—'}</div>
                      <div className="text-[11px] text-[#9e9e9e]">{commission.customer?.email || ''}</div>
                    </td>

                    {/* Campaign */}
                    <td className="px-[16px] py-[14px]">
                      <span
                        className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[11px] font-semibold text-white"
                        style={{ background: '#ff0f5f33', border: '1px solid rgba(255,15,95,0.3)' }}
                      >
                        <span className="text-[8px]">●</span>
                        {commission.campaign?.name ?? 'N/A'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-[16px] py-[14px]">
                      <StatusBadge status={commission.status} />
                    </td>

                    {/* Admin actions */}
                    <td className="px-[16px] py-[14px] text-right">
                      {user?.baseRole === 'admin' && (
                        <div className="relative inline-block">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === commission.id ? null : commission.id)}
                            disabled={isUpdating}
                            className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] text-[#9e9e9e] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-all text-[16px] disabled:opacity-40"
                          >
                            {isUpdating ? '…' : '⋮'}
                          </button>
                          {openMenuId === commission.id && (
                            <>
                              <button
                                type="button"
                                aria-label="Close menu"
                                className="fixed inset-0 z-10 cursor-default bg-transparent border-none p-0"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div
                                className="absolute right-0 top-[32px] z-20 rounded-[8px] py-[4px] min-w-[130px]"
                                style={{
                                  background: '#2a2a2a',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                }}
                              >
                                {(['unpaid', 'pending', 'paid'] as const).map(s => (
                                  <button
                                    key={s}
                                    onClick={() => handleStatusUpdate(commission.id, s)}
                                    disabled={commission.status === s}
                                    className="w-full text-left px-[14px] py-[8px] text-[13px] capitalize transition-colors disabled:opacity-30 disabled:cursor-default"
                                    style={{
                                      color: commission.status === s ? '#9e9e9e' : 'white',
                                    }}
                                    onMouseEnter={e => {
                                      if (commission.status !== s) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                                    }}
                                    onMouseLeave={e => {
                                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }}
                                  >
                                    Mark as {s}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-[60px] gap-[12px]">
              <span className="text-[40px]">💰</span>
              <p className="text-[16px] font-medium text-white">No commissions found</p>
              <p className="text-[13px] text-[#9e9e9e]">
                {filter === 'all'
                  ? 'Commissions will appear here once sales are made.'
                  : `No ${filter} commissions right now.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
