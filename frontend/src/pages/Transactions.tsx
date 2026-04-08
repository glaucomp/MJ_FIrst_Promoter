import { useState, useEffect, useCallback } from 'react';
import { transactionApi, type TransactionFull } from '../services/api';

type Period = 'week' | 'month' | '3month' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  '3month': '3 Months',
  all: 'All Time',
};

const PAGE_SIZE = 8;

const buildCountLabel = (count: number) => `${count} transaction${count === 1 ? '' : 's'}`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = d.getHours() % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'am' : 'pm';
  return { date: `${mm}/${dd}/${yy}`, time: `${hh}:${min}:${sec}${ampm}` };
};

const ChevronDown = ({ className = '' }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    className={className}
  >
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 7h14" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 2v2M12 2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <rect x="5" y="10" width="2" height="2" rx="0.5" fill="currentColor" />
    <rect x="8" y="10" width="2" height="2" rx="0.5" fill="currentColor" />
    <rect x="11" y="10" width="2" height="2" rx="0.5" fill="currentColor" />
  </svg>
);

const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 4h14M5 9h8M8 14h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

interface TransactionRowProps {
  tx: TransactionFull;
}

const TransactionRow = ({ tx }: TransactionRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const isDeposit = tx.type === 'sale';
  const { date, time } = formatDate(tx.createdAt);
  const label = isDeposit ? 'Deposit' : 'Refund';
  const amountSign = isDeposit ? '+' : '−';
  const amountColor = isDeposit ? '#00e676' : '#ff3b3b';

  return (
    <>
      <button
        type="button"
        className="flex items-center justify-between w-full py-[14px] px-[4px] text-left bg-transparent border-none"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: isDeposit ? 'pointer' : 'default' }}
        onClick={() => { if (isDeposit) setExpanded(p => !p); }}
      >
        <div className="flex flex-col gap-[3px]">
          <span className="text-[14px] font-medium text-white leading-none">{label}</span>
          <span className="text-[11px] text-[#888]">{date} {time}</span>
        </div>

        <div className="flex items-center gap-[10px]">
          <span
            className="text-[14px] font-semibold"
            style={{ color: amountColor }}
          >
            {amountSign} ${Math.abs(tx.saleAmount).toFixed(2)}
          </span>
          {isDeposit && (
            <ChevronDown
              className={`text-[#888] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      {expanded && isDeposit && (
        <div
          className="px-[4px] py-[12px] flex flex-col gap-[8px]"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
        >
          {tx.customer && (
            <div className="flex justify-between text-[12px]">
              <span className="text-[#888]">Customer</span>
              <span className="text-white">{tx.customer.name || tx.customer.email || '—'}</span>
            </div>
          )}
          {tx.campaign && (
            <div className="flex justify-between text-[12px]">
              <span className="text-[#888]">Campaign</span>
              <span
                className="text-[11px] font-semibold px-[8px] py-[2px] rounded-full"
                style={{ background: '#ff0f5f33', border: '1px solid rgba(255,15,95,0.3)', color: 'white' }}
              >
                {tx.campaign.name}
              </span>
            </div>
          )}
          {tx.referral?.referrer && (
            <div className="flex justify-between text-[12px]">
              <span className="text-[#888]">Promoter</span>
              <span className="text-white">
                {tx.referral.referrer.firstName} {tx.referral.referrer.lastName}
              </span>
            </div>
          )}
          {tx.plan && (
            <div className="flex justify-between text-[12px]">
              <span className="text-[#888]">Plan</span>
              <span className="text-white capitalize">{tx.plan}</span>
            </div>
          )}
          {tx.commissions.length > 0 && (
            <div className="flex flex-col gap-[4px]">
              <span className="text-[11px] text-[#888] uppercase tracking-[0.06em]">Commissions</span>
              {tx.commissions.map((c) => (
                <div key={c.id} className="flex justify-between text-[12px]">
                  <span className="text-[#aaa]">
                    {c.user.firstName} {c.user.lastName} ({c.percentage}%)
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: c.amount >= 0 ? '#00e676' : '#ff3b3b' }}
                  >
                    {c.amount >= 0 ? '+' : ''}${c.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-[12px]">
            <span className="text-[#888]">Event ID</span>
            <span className="text-[#666] font-mono text-[10px]">{tx.eventId.slice(0, 20)}…</span>
          </div>
        </div>
      )}
    </>
  );
};

const PaginationButton = ({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] text-[13px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
    style={{
      background: active ? 'rgba(255,15,95,0.2)' : 'transparent',
      border: active ? '1px solid rgba(255,15,95,0.5)' : '1px solid transparent',
      color: active ? '#ff2a71' : '#888',
    }}
    onMouseEnter={(e) => {
      if (!active && !disabled) (e.currentTarget as HTMLElement).style.color = 'white';
    }}
    onMouseLeave={(e) => {
      if (!active) (e.currentTarget as HTMLElement).style.color = '#888';
    }}
  >
    {children}
  </button>
);

export const Transactions = () => {
  const [period, setPeriod] = useState<Period>('week');
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<TransactionFull[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await transactionApi.getAll({ period, page, limit: PAGE_SIZE });
      setTransactions(data.transactions);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [period, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setPage(1);
    setShowPeriodMenu(false);
  };

  const getPaginationPages = () => {
    const pages: (number | '…')[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('…');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] leading-[36px] font-semibold text-white font-['DM_Sans',sans-serif]">
          Transactions
        </h1>
        <p className="text-[14px] text-[#9e9e9e] mt-[4px]">
          {total > 0 ? buildCountLabel(total) : 'Sale and refund history'}
        </p>
      </div>

      {error && (
        <div className="bg-[#3a0000] border border-[#cc0000] rounded-[8px] p-[12px] text-[#ff8080] text-[13px]">
          {error}
        </div>
      )}

      {/* Transactions List Card */}
      <div
        className="rounded-[16px] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1e1527 0%, #18101f 100%)',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0px 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Card Header */}
        <button
          type="button"
          className="flex items-center justify-between w-full px-[20px] py-[16px] bg-transparent border-none text-left cursor-pointer"
          style={{ borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          onClick={() => setIsCollapsed(p => !p)}
        >
          <span className="text-[15px] font-semibold text-white">Transactions List</span>
          <ChevronDown
            className={`text-[#888] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
          />
        </button>

        {!isCollapsed && (
          <>
            {/* Filters Row */}
            <div className="flex items-center gap-[10px] px-[20px] py-[14px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Period dropdown */}
              <div className="relative flex-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPeriodMenu(p => !p); }}
                  className="flex items-center justify-between w-full px-[14px] py-[9px] rounded-[10px] text-[13px] font-medium text-white transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    minWidth: '120px',
                  }}
                >
                  <span>{PERIOD_LABELS[period]}</span>
                  <ChevronDown className={`text-[#888] ml-[8px] transition-transform ${showPeriodMenu ? 'rotate-180' : ''}`} />
                </button>

                {showPeriodMenu && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default bg-transparent border-none p-0"
                      onClick={() => setShowPeriodMenu(false)}
                    />
                    <div
                      className="absolute left-0 top-[44px] z-20 rounded-[10px] py-[4px] min-w-full"
                      style={{
                        background: '#2a2a2a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => handlePeriodChange(p)}
                          className="w-full text-left px-[14px] py-[9px] text-[13px] transition-colors"
                          style={{ color: period === p ? '#ff2a71' : 'white' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {PERIOD_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Calendar icon */}
              <button
                className="flex items-center justify-center w-[38px] h-[38px] rounded-[10px] text-[#888] hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <CalendarIcon />
              </button>

              {/* Filter icon */}
              <button
                className="flex items-center justify-center w-[38px] h-[38px] rounded-[10px] text-[#888] hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <FilterIcon />
              </button>
            </div>

            {/* Transaction rows */}
            <div className="px-[20px]">
              {loading && (
                <div className="flex items-center justify-center py-[48px]">
                  <span className="text-[#888] text-[14px]">Loading transactions…</span>
                </div>
              )}
              {!loading && transactions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-[48px] gap-[10px]">
                  <span className="text-[36px]">💳</span>
                  <p className="text-[15px] font-medium text-white">No transactions found</p>
                  <p className="text-[13px] text-[#888]">
                    Transactions will appear here once sales are tracked.
                  </p>
                </div>
              )}
              {!loading && transactions.length > 0 && (
                transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div
                className="flex items-center justify-center gap-[6px] px-[20px] py-[16px]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <PaginationButton
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ‹
                </PaginationButton>

                {getPaginationPages().map((p) => {
                  if (p === '…') {
                    return (
                      <span key={`ellipsis-before-${page}`} className="text-[#888] text-[13px] px-[4px]">…</span>
                    );
                  }
                  return (
                    <PaginationButton
                      key={p}
                      active={page === p}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </PaginationButton>
                  );
                })}

                <PaginationButton
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  ›
                </PaginationButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
