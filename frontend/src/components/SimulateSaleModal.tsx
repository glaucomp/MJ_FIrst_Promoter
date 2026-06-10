import { useEffect, useMemo, useState } from 'react';
import { UserTypeBadge } from './UserTypeBadge';
import { commissionApi, type CommissionSimulation } from '../services/api';

export type SimulateSaleTarget = {
  sellerUserId: string;
  referralId?: string;
  campaignId?: string;
  promoterName: string;
  userType?: string;
};

const PRESETS = [50, 100, 250, 500, 1000];

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROLE_META: Record<
  string,
  { label: string; color: string; bar: string }
> = {
  seller: {
    label: 'Seller',
    color: 'text-emerald-300',
    bar: 'bg-emerald-500',
  },
  upline: {
    label: 'Upline',
    color: 'text-sky-300',
    bar: 'bg-sky-500',
  },
  am_direct: {
    label: 'AM',
    color: 'text-[var(--color-accent-bright)]',
    bar: 'bg-[var(--color-accent-bright)]',
  },
  am_indirect: {
    label: 'AM',
    color: 'text-[var(--color-accent-bright)]',
    bar: 'bg-pink-400',
  },
  chatter: {
    label: 'Chatter',
    color: 'text-violet-300',
    bar: 'bg-violet-500',
  },
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts.at(-1)![0]).toUpperCase();
};

export const SimulateSaleModal = ({
  target,
  onClose,
}: {
  target: SimulateSaleTarget;
  onClose: () => void;
}) => {
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommissionSimulation | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (overrideAmount?: number) => {
    const saleAmount = overrideAmount ?? parseFloat(amount);
    if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
      setError('Enter a valid sale amount');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const simulation = await commissionApi.simulate({
        sellerUserId: target.sellerUserId,
        referralId: target.referralId,
        campaignId: target.campaignId,
        saleAmount,
      });
      setResult(simulation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const platformKeeps = useMemo(() => {
    if (!result) return null;
    return Math.max(0, result.saleAmount - result.totalPaidOut);
  }, [result]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#141416] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="simulate-sale-title"
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-tm-primary-color06/30 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-tm-primary-color05 to-tm-primary-color07 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {initials(target.promoterName)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="simulate-sale-title" className="text-lg font-semibold text-white truncate">
                Simulate sale
              </h2>
              <p className="text-sm text-tm-text-color08 truncate">{target.promoterName}</p>
              {target.userType && (
                <div className="mt-1.5">
                  <UserTypeBadge userType={target.userType} size="sm" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-tm-text-color08 hover:text-white hover:bg-white/5 shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="relative text-xs text-tm-text-color09 mt-3">
            Preview commission split — no real transaction is created.
          </p>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Amount input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-tm-text-color08">
              Sale amount
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-tm-text-color01/50 border border-white/10 px-4 py-3 focus-within:border-tm-primary-color04 transition-colors">
              <span className="text-tm-text-color08 text-lg font-medium">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-white text-xl font-semibold tabular-nums focus:outline-none min-w-0"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(String(preset));
                    void run(preset);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    amount === String(preset)
                      ? 'bg-tm-primary-color06 border-tm-primary-color04 text-[var(--color-accent-bright)]'
                      : 'bg-tm-neutral-color05 border-white/8 text-tm-text-color08 hover:text-white hover:border-white/20'
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="w-full btn-primary-cta rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {loading ? 'Calculating…' : 'Calculate split'}
          </button>

          {error && (
            <div className="rounded-lg px-3 py-2.5 bg-tm-danger-color12/40 border border-tm-danger-color09/40 text-sm text-tm-danger-color02">
              {error}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-tm-neutral-color05 px-3 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-tm-text-color09 mb-1">Sale</p>
                  <p className="text-base font-bold text-white tabular-nums">${money(result.saleAmount)}</p>
                </div>
                <div className="rounded-xl bg-tm-primary-color06/20 border border-tm-primary-color06/40 px-3 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-tm-text-color09 mb-1">Paid out</p>
                  <p className="text-base font-bold text-[var(--color-accent-bright)] tabular-nums">
                    ${money(result.totalPaidOut)}
                  </p>
                </div>
                <div className="rounded-xl bg-tm-neutral-color05 px-3 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-tm-text-color09 mb-1">Platform</p>
                  <p className="text-base font-bold text-tm-text-color08 tabular-nums">
                    ${money(platformKeeps ?? 0)}
                  </p>
                </div>
              </div>

              {/* Distribution bar */}
              <div>
                <p className="text-xs text-tm-text-color09 mb-2">
                  Campaign: <span className="text-white">{result.campaign.name}</span>
                </p>
                <div className="h-3 rounded-full overflow-hidden flex bg-tm-text-color01/60">
                  {result.slices.map((slice) => {
                    const pct = (slice.amount / result.saleAmount) * 100;
                    if (pct <= 0) return null;
                    const meta = ROLE_META[slice.role] ?? ROLE_META.seller;
                    return (
                      <div
                        key={`${slice.role}-${slice.userId}`}
                        className={`${meta.bar} h-full min-w-[2px]`}
                        style={{ width: `${pct}%` }}
                        title={`${slice.name}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Recipient list */}
              <div className="flex flex-col gap-2">
                {result.slices.map((slice) => {
                  const meta = ROLE_META[slice.role] ?? ROLE_META.seller;
                  const sharePct = (slice.amount / result.saleAmount) * 100;
                  return (
                    <div
                      key={`${slice.role}-${slice.userId}`}
                      className="flex items-center gap-3 rounded-xl bg-tm-text-color01/30 border border-white/6 px-3 py-3"
                    >
                      <div className={`w-1 self-stretch rounded-full ${meta.bar} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-semibold truncate ${meta.color}`}>
                            {slice.name}
                          </p>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-tm-text-color09">
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-xs text-tm-text-color09 truncate mt-0.5">{slice.label}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-white tabular-nums">${money(slice.amount)}</p>
                        <p className="text-[11px] text-tm-text-color09 tabular-nums">
                          {slice.percentage}% · {sharePct.toFixed(1)} of sale
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-tm-text-color08 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const canSimulateSale = (userType?: string | null) => {
  const t = userType?.toUpperCase();
  return t === 'PROMOTER' || t === 'TEAM_MANAGER';
};
