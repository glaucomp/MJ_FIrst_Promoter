import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chart } from "../components/Chart";
import { useAuth } from "../contexts/AuthContext";
import {
  commissionApi,
  modelsApi,
  transactionApi,
  type ApiUser,
  type Commission,
  type Referral,
  type TransactionFull,
} from "../services/api";

// ─── types & constants ───────────────────────────────────────────────────────

type Period = "week" | "month" | "3month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "Last Week",
  month: "Last Month",
  "3month": "Last 3 Months",
  all: "All Time",
};

const PERIOD_DAYS: Record<Period, number> = {
  week: 7,
  month: 30,
  "3month": 90,
  all: 0,
};

const ITEMS_PER_PAGE = 8;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── helpers ─────────────────────────────────────────────────────────────────

const isTier1 = (c: Commission) =>
  c.campaign?.commissionRate != null &&
  c.percentage === c.campaign.commissionRate;

const cutoffMs = (days: number) =>
  days > 0 ? Date.now() - days * 86_400_000 : 0;

const filterByPeriod = <T extends { createdAt: string }>(
  items: T[],
  period: Period,
): T[] => {
  if (period === "all") return items;
  const ms = cutoffMs(PERIOD_DAYS[period]);
  return items.filter((i) => new Date(i.createdAt).getTime() >= ms);
};

const prevPeriod = <T extends { createdAt: string }>(
  items: T[],
  period: Period,
): T[] => {
  if (period === "all") return items;
  const days = PERIOD_DAYS[period];
  const now = Date.now();
  const start = now - days * 2 * 86_400_000;
  const end = now - days * 86_400_000;
  return items.filter((i) => {
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
  commissions.forEach((c) => {
    if (c.amount > 0)
      byDay[(new Date(c.createdAt).getDay() + 6) % 7] += c.amount;
  });
  return { labels: DAYS, values: byDay.map((v) => Math.max(v, 0.01)) };
};

const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sumPositive = (items: Commission[]) =>
  items.filter((c) => c.amount > 0).reduce((s, c) => s + c.amount, 0);

const sumRefunded = (items: Commission[]) =>
  items.filter((c) => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);

// ─── small UI pieces ─────────────────────────────────────────────────────────

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-[12px] overflow-hidden ${className}`}
    style={{
      background: "linear-gradient(180deg,#252628 0%,#202022 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}
  >
    {children}
  </div>
);

const HDivider = () => <div className="h-px bg-[rgba(255,255,255,0.06)]" />;

const SectionTitle = ({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) => (
  <div className="flex items-center gap-[6px] py-[6px]">
    <span className="text-[#9e9e9e] text-[14px] leading-none">{icon}</span>
    <span className="text-[13px] font-semibold text-[#9e9e9e]">{label}</span>
  </div>
);

interface BadgeProps {
  value: number;
  positive: boolean;
}
const ChangeBadge = ({ value, positive }: BadgeProps) => (
  <span
    className="inline-flex items-center gap-[3px] text-[12px] font-bold px-[10px] py-[4px] rounded-full"
    style={{
      background: positive ? "#10b981" : "#ef4444",
      color: "white",
    }}
  >
    {positive ? "↑" : "↓"} {Math.abs(value)}%
  </span>
);

// ─── TxRow (non-admin) ────────────────────────────────────────────────────────

const statusColors: Record<string, { bg: string; text: string }> = {
  paid: { bg: "rgba(16,185,129,0.15)", text: "#10b981" },
  pending: { bg: "rgba(251,191,36,0.15)", text: "#fbbf24" },
  unpaid: { bg: "rgba(255,255,255,0.06)", text: "#9e9e9e" },
};

const TxRow = ({
  tx,
  money,
}: {
  tx: Commission;
  money: (n: number) => string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const positive = tx.amount >= 0;
  const isRefund = tx.amount < 0;
  const tier1 = isTier1(tx);
  const tierLabel = tier1 ? "T1" : "T2";
  const tierBg = tier1 ? "rgba(59,130,246,0.2)" : "rgba(245,158,11,0.2)";
  const tierText = tier1 ? "#60a5fa" : "#fbbf24";
  const avatarBg = tier1 ? "#3b82f6" : "#f59e0b";
  const dt = new Date(tx.createdAt);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = String(dt.getFullYear()).slice(-2);
  const hh = dt.getHours() % 12 || 12;
  const mn = String(dt.getMinutes()).padStart(2, "0");
  const sc = String(dt.getSeconds()).padStart(2, "0");
  const ap = dt.getHours() < 12 ? "am" : "pm";
  const saleAmt =
    tx.saleAmount ?? tx.transaction?.saleAmount ?? tx.customer?.revenue ?? 0;
  const statusStyle = statusColors[tx.status] ?? statusColors.unpaid;
  const initials =
    `${tx.user.firstName?.[0] ?? ""}${tx.user.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div>
      <button
        type="button"
        className="w-full px-[16px] pt-[12px] pb-[10px] text-left bg-transparent border-none hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Line 1: type + tier | amount */}
        <div className="flex items-center justify-between mb-[6px]">
          <div className="flex items-center gap-[6px]">
            {isRefund && <span className="text-[13px] text-[#ef4444]">↩</span>}
            <span className="text-[14px] font-semibold text-white">Sale</span>
            <span
              className="text-[10px] font-bold px-[6px] py-px rounded-[4px]"
              style={{
                background: tierBg,
                color: tierText,
                border: `1px solid ${tierText}44`,
              }}
            >
              {tierLabel}
            </span>
          </div>
          <span
            className="text-[14px] font-bold"
            style={{
              color: positive ? "#00e676" : "#ef4444",
              textDecoration: isRefund ? "line-through" : "none",
            }}
          >
            {positive ? "+ " : "− "}${money(Math.abs(tx.amount))}
          </span>
        </div>

        {/* Line 2: avatar + name | status badge */}
        <div className="flex items-center justify-between mb-[6px]">
          <div className="flex items-center gap-[6px]">
            <div
              className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ background: avatarBg }}
            >
              {initials}
            </div>
            <span className="text-[12px] text-[#ccc]">
              {tx.user.firstName} {tx.user.lastName}
            </span>
          </div>
          <span
            className="text-[11px] font-semibold px-[9px] py-[2px] rounded-full capitalize"
            style={{
              background: statusStyle.bg,
              color: statusStyle.text,
              border: `1px solid ${statusStyle.text}33`,
            }}
          >
            {tx.status}
          </span>
        </div>

        {/* Line 3: date | chevron */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#555]">
            {d}/{m}/{y} {hh}:{mn}:{sc}
            {ap}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            style={{ color: "#555" }}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div
          className="mx-[16px] mb-[10px] rounded-[10px] overflow-hidden text-[12px]"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {saleAmt > 0 && (
            <div
              className="flex justify-between px-[14px] py-[9px]"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-[#666]">Sale Amount</span>
              <span className="font-semibold text-white">
                ${money(saleAmt)}
              </span>
            </div>
          )}
          <div
            className="flex justify-between px-[14px] py-[9px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <span className="text-[#666]">Commission</span>
            <div className="flex items-center gap-[6px]">
              <span
                className="font-bold"
                style={{ color: positive ? "#00e676" : "#ef4444" }}
              >
                {positive ? "+" : "−"}${money(Math.abs(tx.amount))}
              </span>
              <span className="text-[#555]">{tx.percentage}%</span>
            </div>
          </div>
          {tx.customer && (
            <div
              className="flex justify-between px-[14px] py-[9px]"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-[#666]">Customer</span>
              <span className="text-[#ccc]">
                {tx.customer.email || tx.customer.name}
              </span>
            </div>
          )}
          {tx.campaign && (
            <div className="flex justify-between items-center px-[14px] py-[9px]">
              <span className="text-[#666]">Campaign</span>
              <span
                className="text-[10px] font-semibold px-[8px] py-[2px] rounded-full text-white"
                style={{
                  background: "rgba(255,15,95,0.2)",
                  border: "1px solid rgba(255,15,95,0.3)",
                }}
              >
                {tx.campaign.name}
              </span>
            </div>
          )}
          {tx.description && (
            <div
              className="px-[14px] py-[9px]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-[#555] italic">{tx.description}</span>
            </div>
          )}
        </div>
      )}

      <HDivider />
    </div>
  );
};

// ─── AdminTxRow ──────────────────────────────────────────────────────────────

const AdminTxRow = ({
  tx,
  money,
}: {
  tx: TransactionFull;
  money: (n: number) => string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isDeposit = tx.type === "sale";
  const dt = new Date(tx.createdAt);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = String(dt.getFullYear()).slice(-2);
  const hh = dt.getHours() % 12 || 12;
  const min = String(dt.getMinutes()).padStart(2, "0");
  const sec = String(dt.getSeconds()).padStart(2, "0");
  const ampm = dt.getHours() < 12 ? "am" : "pm";
  const customerLabel = tx.customer?.name || tx.customer?.email || "—";

  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center gap-[12px] px-[16px] py-[13px] text-left bg-transparent border-none hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Type badge */}
        <div
          className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ background: isDeposit ? "#10b981" : "#ef4444" }}
        >
          {isDeposit ? "↑" : "↩"}
        </div>

        {/* Label + customer + date */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-[6px] flex-wrap">
            <span className="text-[14px] font-semibold text-white">
              {isDeposit ? "Deposit" : "Refund"}
            </span>
            <span className="text-[12px] text-[#9e9e9e] truncate">
              {customerLabel}
            </span>
          </div>
          <div className="text-[11px] text-[#555] mt-px">
            {d}/{m}/{y} {hh}:{min}:{sec}
            {ampm}
          </div>
        </div>

        {/* Amount + chevron */}
        <div className="flex items-center gap-[8px] shrink-0">
          <span
            className="text-[14px] font-bold"
            style={{ color: isDeposit ? "#00e676" : "#ef4444" }}
          >
            {isDeposit ? "+ " : "− "}${money(tx.saleAmount)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            style={{ color: "#555" }}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div
          className="mx-[16px] mb-[12px] rounded-[10px] overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Customer */}
          {tx.customer && (
            <div
              className="flex items-center justify-between px-[14px] py-[10px]"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-[11px] text-[#666] uppercase tracking-[0.07em]">
                Customer
              </span>
              <div className="text-right">
                <div className="text-[12px] font-medium text-white">
                  {tx.customer.name || tx.customer.email}
                </div>
                {tx.customer.name && tx.customer.email && (
                  <div className="text-[10px] text-[#666]">
                    {tx.customer.email}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Campaign */}
          {tx.campaign && (
            <div
              className="flex items-center justify-between px-[14px] py-[10px]"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-[11px] text-[#666] uppercase tracking-[0.07em]">
                Campaign
              </span>
              <span
                className="text-[10px] font-semibold px-[8px] py-[3px] rounded-full text-white"
                style={{
                  background: "rgba(255,15,95,0.2)",
                  border: "1px solid rgba(255,15,95,0.3)",
                }}
              >
                {tx.campaign.name}
              </span>
            </div>
          )}

          {/* Sale amount */}
          <div
            className="flex items-center justify-between px-[14px] py-[10px]"
            style={{
              borderBottom:
                tx.commissions.length > 0
                  ? "1px solid rgba(255,255,255,0.05)"
                  : "none",
            }}
          >
            <span className="text-[11px] text-[#666] uppercase tracking-[0.07em]">
              {isDeposit ? "Sale Amount" : "Refund Amount"}
            </span>
            <span
              className="text-[13px] font-bold"
              style={{ color: isDeposit ? "#00e676" : "#ef4444" }}
            >
              {isDeposit ? "+ " : "− "}${money(tx.saleAmount)}
            </span>
          </div>

          {/* Commissions breakdown */}
          {tx.commissions.length > 0 && (
            <div className="px-[14px] py-[10px] flex flex-col gap-[8px]">
              <span className="text-[11px] text-[#666] uppercase tracking-[0.07em]">
                Commissions
              </span>
              {tx.commissions.map((c, idx) => {
                const isT1 =
                  idx === 0 ||
                  tx.commissions.findIndex((x) => x.id === c.id) === 0;
                const tierBg = isT1 ? "#3b82f6" : "#f59e0b";
                const commPositive = c.amount >= 0;
                const cStatus = statusColors[c.status] ?? statusColors.unpaid;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-[10px] py-[8px] px-[10px] rounded-[8px]"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: tierBg }}
                    >
                      {c.user.firstName?.[0] ?? "?"}
                      {c.user.lastName?.[0] ?? ""}
                    </div>
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-white truncate">
                        {c.user.firstName} {c.user.lastName}
                      </div>
                      <div className="text-[10px] text-[#666] truncate">
                        {c.user.email}
                      </div>
                    </div>
                    {/* Rate */}
                    <span className="text-[11px] text-[#555] shrink-0">
                      {c.percentage}%
                    </span>
                    {/* Amount */}
                    <span
                      className="text-[13px] font-bold shrink-0"
                      style={{ color: commPositive ? "#00e676" : "#ef4444" }}
                    >
                      {commPositive ? "+" : "−"}${money(Math.abs(c.amount))}
                    </span>
                    {/* Status badge */}
                    <span
                      className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full capitalize shrink-0"
                      style={{
                        background: cStatus.bg,
                        color: cStatus.text,
                        border: `1px solid ${cStatus.text}33`,
                      }}
                    >
                      {c.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <HDivider />
    </div>
  );
};

// ─── AdminTxListCard ──────────────────────────────────────────────────────────

interface AdminTxListCardProps {
  transactions: TransactionFull[];
  totalPages: number;
  page: number;
  setPage: (p: number) => void;
  isOpen: boolean;
  onToggle: () => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  loading: boolean;
  money: (n: number) => string;
}

const AdminTxListCard = ({
  transactions,
  totalPages,
  page,
  setPage,
  isOpen,
  onToggle,
  period,
  onPeriodChange,
  loading,
  money,
}: AdminTxListCardProps) => {
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const closePeriodMenu = useCallback(() => setPeriodMenuOpen(false), []);

  const pages = useMemo(() => {
    const arr: (number | "…")[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) arr.push(i);
    } else {
      arr.push(1);
      if (page > 3) arr.push("…");
      for (
        let i = Math.max(2, page - 1);
        i <= Math.min(totalPages - 1, page + 1);
        i++
      )
        arr.push(i);
      if (page < totalPages - 2) arr.push("…");
      arr.push(totalPages);
    }
    return arr;
  }, [totalPages, page]);

  return (
    <Card>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left bg-transparent border-none"
      >
        <span className="text-[14px] font-semibold text-white">
          Transactions List
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`text-[#9e9e9e] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            d="M3 5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <HDivider />

          {/* Filter bar */}
          <div className="flex items-center gap-[8px] px-[16px] py-[10px]">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPeriodMenuOpen((o) => !o);
                }}
                className="flex items-center justify-between w-full px-[12px] py-[7px] rounded-[8px] text-[13px] text-white transition-colors hover:bg-[#333]"
                style={{
                  background: "#2a2a2a",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span>{PERIOD_LABELS[period]}</span>
                <span className="text-[10px] text-[#9e9e9e] ml-[6px]">▾</span>
              </button>

              {periodMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close dropdown"
                    className="fixed inset-0 z-10 cursor-default bg-transparent border-none p-0"
                    onClick={closePeriodMenu}
                  />
                  <div
                    className="absolute left-0 top-[38px] z-20 rounded-[8px] py-[4px] min-w-full"
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          onPeriodChange(p);
                          setPeriodMenuOpen(false);
                        }}
                        className="w-full text-left px-[14px] py-[8px] text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                        style={{ color: period === p ? "#ff0f5f" : "white" }}
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
              type="button"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[8px] text-[#9e9e9e] hover:text-white transition-colors"
              style={{
                background: "#2a2a2a",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="2"
                  y="2.5"
                  width="12"
                  height="11"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M5.5 1.5v2M10.5 1.5v2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Filter icon */}
            <button
              type="button"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[8px] text-[#9e9e9e] hover:text-white transition-colors"
              style={{
                background: "#2a2a2a",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4h12M5 8h6M7.5 12h1"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <HDivider />

          {/* Rows */}
          {loading && (
            <div className="flex items-center justify-center py-[40px]">
              <span className="text-[#9e9e9e] text-[14px]">
                Loading transactions…
              </span>
            </div>
          )}
          {!loading && transactions.length === 0 && (
            <div className="flex flex-col items-center py-[40px] gap-[8px]">
              <span className="text-[32px]">📊</span>
              <span className="text-[14px] text-[#9e9e9e]">
                No transactions for this period
              </span>
            </div>
          )}
          {!loading &&
            transactions.length > 0 &&
            transactions.map((tx) => (
              <AdminTxRow key={tx.id} tx={tx} money={money} />
            ))}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-[5px] px-[16px] py-[12px]">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(Math.max(1, page - 1))}
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] text-[#9e9e9e] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              {pages.map((p) => {
                if (p === "…") {
                  return (
                    <span
                      key={`el-${page}`}
                      className="text-[#555] text-[12px] px-[2px]"
                    >
                      …
                    </span>
                  );
                }
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className="w-[28px] h-[28px] rounded-[6px] text-[13px] font-medium transition-colors"
                    style={{
                      background: page === p ? "#ff0f5f" : "transparent",
                      color: page === p ? "white" : "#9e9e9e",
                      border:
                        page === p
                          ? "none"
                          : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] text-[#9e9e9e] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ─── TxListCard (non-admin) ───────────────────────────────────────────────────

type StatusTab = "all" | "unpaid" | "pending" | "paid";

interface TxListCardProps {
  allTransactions: Commission[];
  isOpen: boolean;
  onToggle: () => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  money: (n: number) => string;
}

const TxListCard = ({
  allTransactions,
  isOpen,
  onToggle,
  period,
  onPeriodChange,
  money,
}: TxListCardProps) => {
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const closePeriodMenu = useCallback(() => setPeriodMenuOpen(false), []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusTab, search, period]);

  const counts = useMemo(
    () => ({
      all: allTransactions.length,
      unpaid: allTransactions.filter((t) => t.status === "unpaid").length,
      pending: allTransactions.filter((t) => t.status === "pending").length,
      paid: allTransactions.filter((t) => t.status === "paid").length,
    }),
    [allTransactions],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allTransactions.filter((tx) => {
      if (statusTab !== "all" && tx.status !== statusTab) return false;
      if (q) {
        const name =
          `${tx.user.firstName ?? ""} ${tx.user.lastName ?? ""}`.toLowerCase();
        const email = tx.user.email.toLowerCase();
        const campaign = tx.campaign?.name?.toLowerCase() ?? "";
        const customer = (
          tx.customer?.email ??
          tx.customer?.name ??
          ""
        ).toLowerCase();
        if (
          !name.includes(q) &&
          !email.includes(q) &&
          !campaign.includes(q) &&
          !customer.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allTransactions, statusTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const pageTx = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const pages = useMemo(() => {
    const arr: (number | "…")[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) arr.push(i);
    } else {
      arr.push(1);
      if (page > 3) arr.push("…");
      for (
        let i = Math.max(2, page - 1);
        i <= Math.min(totalPages - 1, page + 1);
        i++
      )
        arr.push(i);
      if (page < totalPages - 2) arr.push("…");
      arr.push(totalPages);
    }
    return arr;
  }, [totalPages, page]);

  const tabDefs: { key: StatusTab; label: string }[] = [
    { key: "all", label: `All` },
    { key: "unpaid", label: "Unpaid" },
    { key: "pending", label: "Pending" },
    { key: "paid", label: "Paid" },
  ];

  return (
    <Card>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left bg-transparent border-none"
      >
        <span className="text-[14px] font-semibold text-white">
          Transactions List
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`text-[#9e9e9e] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            d="M3 5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <HDivider />

          {/* Period + icons row */}
          <div className="flex items-center gap-[8px] px-[16px] py-[10px]">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPeriodMenuOpen((o) => !o);
                }}
                className="flex items-center justify-between w-full px-[12px] py-[7px] rounded-[8px] text-[13px] text-white transition-colors hover:bg-[#333]"
                style={{
                  background: "#2a2a2a",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span>{PERIOD_LABELS[period]}</span>
                <span className="text-[10px] text-[#9e9e9e] ml-[6px]">▾</span>
              </button>
              {periodMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close dropdown"
                    className="fixed inset-0 z-10 cursor-default bg-transparent border-none p-0"
                    onClick={closePeriodMenu}
                  />
                  <div
                    className="absolute left-0 top-[38px] z-20 rounded-[8px] py-[4px] min-w-full"
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          onPeriodChange(p);
                          setPeriodMenuOpen(false);
                        }}
                        className="w-full text-left px-[14px] py-[8px] text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                        style={{ color: period === p ? "#ff0f5f" : "white" }}
                      >
                        {PERIOD_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[8px] text-[#9e9e9e] hover:text-white transition-colors"
              style={{
                background: "#2a2a2a",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="2"
                  y="2.5"
                  width="12"
                  height="11"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M5.5 1.5v2M10.5 1.5v2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[8px] text-[#9e9e9e] hover:text-white transition-colors"
              style={{
                background: "#2a2a2a",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4h12M5 8h6M7.5 12h1"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-[6px] px-[16px] pb-[10px] overflow-x-auto">
            {tabDefs.map(({ key, label }) => {
              const active = statusTab === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusTab(key)}
                  className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-full text-[12px] font-medium whitespace-nowrap transition-all shrink-0"
                  style={{
                    background: active
                      ? "rgba(255,15,95,0.15)"
                      : "rgba(255,255,255,0.05)",
                    border: active
                      ? "1px solid rgba(255,15,95,0.5)"
                      : "1px solid rgba(255,255,255,0.08)",
                    color: active ? "#ff2a71" : "#9e9e9e",
                  }}
                >
                  {key === "all" && count > 0 && (
                    <span
                      className="text-[10px] font-bold px-[5px] py-px rounded-full"
                      style={{
                        background: active
                          ? "#ff0f5f"
                          : "rgba(255,255,255,0.1)",
                        color: "white",
                      }}
                    >
                      {count}
                    </span>
                  )}
                  {label}
                  {key !== "all" && (
                    <span className="text-[10px] opacity-60">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="px-[16px] pb-[10px]">
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#666]"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M9.5 9.5l2.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, Email, Campaign"
                className="w-full pl-[30px] pr-[12px] py-[8px] rounded-[8px] text-[13px] text-white placeholder-[#555] focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            </div>
          </div>

          <HDivider />

          {/* Rows */}
          {pageTx.length === 0 ? (
            <div className="flex flex-col items-center py-[40px] gap-[8px]">
              <span className="text-[32px]">📊</span>
              <span className="text-[14px] text-[#9e9e9e]">
                No transactions found
              </span>
            </div>
          ) : (
            pageTx.map((tx) => <TxRow key={tx.id} tx={tx} money={money} />)
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-[5px] px-[16px] py-[12px]">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] text-[#9e9e9e] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              {pages.map((p) => {
                if (p === "…")
                  return (
                    <span
                      key={`el-${page}`}
                      className="text-[#555] text-[12px] px-[2px]"
                    >
                      …
                    </span>
                  );
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className="w-[28px] h-[28px] rounded-[6px] text-[13px] font-medium transition-colors"
                    style={{
                      background: page === p ? "#ff0f5f" : "transparent",
                      color: page === p ? "white" : "#9e9e9e",
                      border:
                        page === p
                          ? "none"
                          : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] text-[#9e9e9e] border border-[rgba(255,255,255,0.08)] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ─── main component ───────────────────────────────────────────────────────────

export const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.baseRole === "admin";
  const isManager =
    user?.baseRole === "account_manager" ||
    (user?.baseRole === "team_manager" && user?.role === "team_manager");
  const isPromoter =
    user?.baseRole === "promoter" ||
    (user?.baseRole === "team_manager" && user?.role === "promoter");

  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [allUsers, setAllUsers] = useState<ApiUser[]>([]);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(true);
  // Admin-only: real transaction records (1 per sale/refund)
  const [adminTxList, setAdminTxList] = useState<TransactionFull[]>([]);
  const [adminTxTotalPages, setAdminTxTotalPages] = useState(1);
  const [adminTxPage, setAdminTxPage] = useState(1);
  const [adminTxLoading, setAdminTxLoading] = useState(false);

  useEffect(() => {
    const tasks: Promise<unknown>[] = [
      commissionApi
        .getAll()
        .then(setCommissions)
        .catch(() => setCommissions([])),
    ];
    if (isAdmin) {
      tasks.push(
        modelsApi
          .getAllUsers()
          .then(setAllUsers)
          .catch(() => setAllUsers([])),
      );
    }
    if (isManager) {
      tasks.push(
        modelsApi
          .getMyReferrals()
          .then(setMyReferrals)
          .catch(() => setMyReferrals([])),
      );
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [isAdmin, isManager]);

  // Fetch real transactions for admin whenever period or page changes
  useEffect(() => {
    if (!isAdmin) return;
    setAdminTxLoading(true);
    transactionApi
      .getAll({ period, page: adminTxPage, limit: ITEMS_PER_PAGE })
      .then((d) => {
        setAdminTxList(d.transactions);
        setAdminTxTotalPages(d.totalPages);
      })
      .catch(() => {
        setAdminTxList([]);
        setAdminTxTotalPages(1);
      })
      .finally(() => setAdminTxLoading(false));
  }, [isAdmin, period, adminTxPage]);

  // ── filtered slices ──────────────────────────────────────────────────────

  const curr = useMemo(
    () => filterByPeriod(commissions, period),
    [commissions, period],
  );
  const prev = useMemo(
    () => prevPeriod(commissions, period),
    [commissions, period],
  );

  const chartData = useMemo(() => buildChart(curr), [curr]);

  const currTotal = useMemo(() => sumPositive(curr), [curr]);
  const prevTotal = useMemo(() => sumPositive(prev), [prev]);
  const totalChange = useMemo(
    () => pctChange(currTotal, prevTotal),
    [currTotal, prevTotal],
  );

  const currPaid = useMemo(
    () =>
      curr
        .filter((c) => c.status === "paid" && c.amount > 0)
        .reduce((s, c) => s + c.amount, 0),
    [curr],
  );
  const currPending = useMemo(
    () =>
      curr
        .filter((c) => c.status !== "paid" && c.amount > 0)
        .reduce((s, c) => s + c.amount, 0),
    [curr],
  );

  const currRefunded = useMemo(() => sumRefunded(curr), [curr]);
  const prevRefunded = useMemo(() => sumRefunded(prev), [prev]);
  const refundChange = useMemo(
    () => pctChange(currRefunded, prevRefunded),
    [currRefunded, prevRefunded],
  );

  const sortedTx = useMemo(
    () =>
      [...curr].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [curr],
  );
  // ── Network / user stats ───────────────────────────────────────────────

  const nonAdmin = useMemo(
    () => allUsers.filter((u) => u.userType?.toLowerCase() !== "admin"),
    [allUsers],
  );

  const wf = useMemo(
    () => ({
      accountManagers: nonAdmin.filter(
        (u) => u.userType?.toLowerCase() === "account_manager",
      ).length,
      promoters: nonAdmin.filter(
        (u) => u.userType?.toLowerCase() === "promoter",
      ).length,
      referralManagers: nonAdmin.filter(
        (u) => u.userType?.toLowerCase() === "team_manager",
      ).length,
    }),
    [nonAdmin],
  );

  const newUsersCount = useMemo(
    () => filterByPeriod(nonAdmin, period).length,
    [nonAdmin, period],
  );
  const idleCount = useMemo(
    () => nonAdmin.filter((u) => (u.stats?.totalEarnings ?? 0) === 0).length,
    [nonAdmin],
  );
  const unpaidCount = useMemo(
    () => nonAdmin.filter((u) => (u.stats?.pendingEarnings ?? 0) > 0).length,
    [nonAdmin],
  );

  // ── manager: top performers & stats ─────────────────────────────────────

  const topPerformers = useMemo(() => {
    if (!isManager) return [];

    // Period cutoff (0 = all-time, no filter)
    const cutoff = period === "all" ? 0 : cutoffMs(PERIOD_DAYS[period]);

    return myReferrals
      .filter((r) => r.referredUser != null)
      .map((r) => {
        const name = `${r.referredUser!.firstName} ${r.referredUser!.lastName}`;
        const revenue = (r.commissions ?? [])
          .filter(
            (c) =>
              c.amount > 0 &&
              c.userId === r.referredUser!.id &&
              (cutoff === 0 || new Date(c.createdAt).getTime() >= cutoff),
          )
          .reduce((sum, c) => sum + c.amount, 0);
        return { name, revenue };
      })
      .filter((p) => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [myReferrals, isManager, period]);

  const promoterCount = myReferrals.filter(
    (r) => r.referredUser != null,
  ).length;
  const managedCustomerCount = useMemo(
    () =>
      new Set(
        curr
          .filter((c) => !isTier1(c) && c.customer?.id)
          .map((c) => c.customer!.id),
      ).size,
    [curr],
  );

  // ── promoter: top customers & user stats ─────────────────────────────────

  // All unique customers ever (all-time)
  const allCustomers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; revenue: number }
    >();
    commissions.forEach((c) => {
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
    () =>
      new Set(curr.filter((c) => c.customer?.id).map((c) => c.customer!.id)),
    [curr],
  );

  // Top customers by revenue in current period
  const topCustomers = useMemo(() => {
    if (!isPromoter) return [];
    const map = new Map<string, { name: string; revenue: number }>();
    curr.forEach((c) => {
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
    () => allCustomers.filter((c) => !currCustomerIds.has(c.id)).length,
    [allCustomers, currCustomerIds],
  );
  // Unpaid = unique customers with at least one pending commission
  const unpaidCustomerCount = useMemo(
    () =>
      new Set(
        commissions
          .filter((c) => c.status !== "paid" && c.customer?.id)
          .map((c) => c.customer!.id),
      ).size,
    [commissions],
  );

  const selectPeriod = (p: Period) => {
    setPeriod(p);
    setPeriodOpen(false);
    setAdminTxPage(1);
  };

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
      <div className="flex flex-col gap-[12px]">
        <h1 className="text-[28px] font-bold text-white font-['DM_Sans',sans-serif]">
          Reports
        </h1>
        <div className="flex items-center gap-[8px]">
          <div className="relative">
            <button
              onClick={() => setPeriodOpen((o) => !o)}
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
                  style={{
                    background: "#2a2a2a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => selectPeriod(p)}
                      className="w-full text-left px-[14px] py-[8px] text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                      style={{ color: period === p ? "#ff0f5f" : "white" }}
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

      {/* ── Ledger ── */}
      <div className="flex flex-col gap-[6px]">
        <SectionTitle icon="▐" label="Ledger" />

        {/* Chart */}
        <Card>
          <div className="p-[12px]">
            <Chart data={chartData} className="h-[130px]" />
          </div>
        </Card>

        {/* Transactions total — admin only */}
        {isAdmin && (
          <Card>
            <div className="px-[16px] py-[14px] flex flex-col gap-[6px]">
              <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">
                Transactions
              </span>
              <span className="text-[26px] font-bold text-white leading-none">
                ${money(currTotal)}
              </span>
              {totalChange !== null && (
                <div>
                  <ChangeBadge value={totalChange} positive={totalChange >= 0} />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Paid / Pending */}
        <div className="grid grid-cols-2 gap-[6px]">
          <Card>
            <div className="px-[14px] py-[12px] flex flex-col gap-[5px]">
              <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Paid</span>
              <span className="text-[18px] font-bold text-white">${money(currPaid)}</span>
            </div>
          </Card>
          <Card>
            <div className="px-[14px] py-[12px] flex flex-col gap-[5px]">
              <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Pending</span>
              <span className="text-[18px] font-bold text-white">${money(currPending)}</span>
            </div>
          </Card>
        </div>

        {/* Refunded */}
        <Card>
          <div className="px-[14px] py-[12px] flex flex-col gap-[5px]">
            <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Refunded</span>
            <div className="flex items-center justify-between">
              <span className="text-[18px] font-bold text-white">${money(currRefunded)}</span>
              {refundChange !== null && refundChange !== 0 && (
                <ChangeBadge value={refundChange} positive={refundChange < 0} />
              )}
            </div>
          </div>
        </Card>

        {/* Promoters / Users — manager only */}
        {isManager && (
          <div className="grid grid-cols-2 gap-[6px]">
            <Card>
              <div className="px-[14px] py-[12px] flex flex-col gap-[5px]">
                <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Promoters</span>
                <span className="text-[18px] font-bold text-white">{promoterCount}</span>
              </div>
            </Card>
            <Card>
              <div className="px-[14px] py-[12px] flex flex-col gap-[5px]">
                <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-[0.06em]">Users</span>
                <span className="text-[18px] font-bold text-white">{managedCustomerCount}</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── Transactions List ── */}
      {isAdmin ? (
        <AdminTxListCard
          transactions={adminTxList}
          totalPages={adminTxTotalPages}
          page={adminTxPage}
          setPage={setAdminTxPage}
          isOpen={txOpen}
          onToggle={() => setTxOpen((o) => !o)}
          period={period}
          onPeriodChange={selectPeriod}
          loading={adminTxLoading}
          money={money}
        />
      ) : (
        <TxListCard
          allTransactions={sortedTx}
          isOpen={txOpen}
          onToggle={() => setTxOpen((o) => !o)}
          period={period}
          onPeriodChange={selectPeriod}
          money={money}
        />
      )}

      {/* ── Top Users ── (promoter only) */}
      {isPromoter && (
        <>
          <Card>
            <div className="flex items-center gap-[6px] px-[16px] pt-[14px] pb-[10px]">
              <span className="text-[#9e9e9e] text-[14px]">≡</span>
              <span className="text-[13px] font-semibold text-[#9e9e9e]">
                Top Users
              </span>
            </div>
            <HDivider />

            {topCustomers.length === 0 ? (
              <div className="flex flex-col items-center py-[32px] gap-[8px]">
                <span className="text-[28px]">👤</span>
                <span className="text-[13px] text-[#9e9e9e]">
                  No customer data for this period
                </span>
              </div>
            ) : (
              topCustomers.map(({ name, revenue }, idx) => {
                const initials = name
                  .split(/[\s@.]+/)
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                const avatarColors = [
                  "#ff0f5f",
                  "#f59e0b",
                  "#10b981",
                  "#3b82f6",
                  "#8b5cf6",
                  "#ec4899",
                  "#06b6d4",
                  "#84cc16",
                  "#f97316",
                  "#6366f1",
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
                      <span className="flex-1 text-[14px] text-white truncate">
                        {name}
                      </span>
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
                <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">
                  Users
                </span>
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
              <span className="text-[14px] font-semibold text-white">
                {idleCustomerCount.toLocaleString()}
              </span>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Unpaid</span>
              <span className="text-[14px] font-semibold text-white">
                {unpaidCustomerCount.toLocaleString()}
              </span>
            </div>

            <HDivider />

            <button
              onClick={() => navigate("/models")}
              className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
            >
              <span className="text-[14px] font-medium text-white">
                View Details
              </span>
              <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">
                ›
              </span>
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
            <span className="text-[13px] font-semibold text-[#9e9e9e]">
              Top Performers
            </span>
          </div>
          <HDivider />

          {topPerformers.length === 0 ? (
            <div className="flex flex-col items-center py-[32px] gap-[8px]">
              <span className="text-[28px]">📈</span>
              <span className="text-[13px] text-[#9e9e9e]">
                No performance data for this period
              </span>
            </div>
          ) : (
            topPerformers.map(({ name, revenue }, idx) => {
              const initials = name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              const avatarColors = [
                "#ff0f5f",
                "#f59e0b",
                "#10b981",
                "#3b82f6",
                "#8b5cf6",
                "#ec4899",
                "#06b6d4",
                "#84cc16",
                "#f97316",
                "#6366f1",
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
                    <span className="flex-1 text-[14px] text-white">
                      {name}
                    </span>
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
            onClick={() => navigate("/models")}
            className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
          >
            <span
              className="text-[14px] font-medium"
              style={{ color: "#ff0f5f" }}
            >
              Manage Influencers
            </span>
            <span
              className="text-[18px] group-hover:translate-x-[2px] transition-transform"
              style={{ color: "#ff0f5f" }}
            >
              ›
            </span>
          </button>
        </Card>
      )}

      {/* ── Network ── (admin only) */}
      {isAdmin && (
        <div className="flex flex-col gap-[6px]">
          <SectionTitle icon="△" label="Network" />
          {[
            { label: "Account Managers", count: wf.accountManagers },
            { label: "Promoters", count: wf.promoters },
            { label: "Referral Managers", count: wf.referralManagers },
          ].map(({ label, count }) => (
            <Card key={label}>
              <button
                onClick={() => navigate("/models")}
                className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
              >
                <div className="text-left">
                  <div className="text-[13px] text-[#9e9e9e]">{label}</div>
                  <div className="text-[20px] font-bold text-white mt-px">
                    {count.toLocaleString()}
                  </div>
                </div>
                <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">
                  ›
                </span>
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
                <span className="text-[11px] font-bold text-[#9e9e9e] uppercase tracking-[0.08em]">
                  Users
                </span>
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
              <span className="text-[14px] font-semibold text-white">
                {idleCount.toLocaleString()}
              </span>
            </div>

            <HDivider />

            <div className="flex items-center justify-between px-[16px] py-[12px]">
              <span className="text-[14px] text-[#9e9e9e]">Unpaid</span>
              <span className="text-[14px] font-semibold text-white">
                {unpaidCount.toLocaleString()}
              </span>
            </div>

            <HDivider />

            <button
              onClick={() => navigate("/models")}
              className="w-full flex items-center justify-between px-[16px] py-[13px] hover:bg-[rgba(255,255,255,0.03)] transition-colors group"
            >
              <span className="text-[14px] font-medium text-white">
                View Details
              </span>
              <span className="text-[20px] text-[#555] group-hover:text-[#9e9e9e] transition-colors">
                ›
              </span>
            </button>
          </Card>
        </div>
      )}
    </div>
  );
};
