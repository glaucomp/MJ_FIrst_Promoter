import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import calenderIcon from "../assets/calender.svg";
import ledgerIcon from "../assets/ledger.svg";
import networkIcon from "../assets/network.svg";
import usersIcon from "../assets/users.svg";
import topUsersIcon from "../assets/top_users.svg";
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

const isTier3 = (c: Commission) =>
  (c.description ?? "").toLowerCase().includes("t3") ||
  (c.campaign?.recurringRate != null &&
    c.campaign.recurringRate > 0 &&
    c.percentage === c.campaign.recurringRate &&
    c.percentage !== c.campaign.commissionRate &&
    c.percentage !== c.campaign.secondaryRate);

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
  radius = "var(--radius-card)",
  noBorder = false,
}: {
  children: ReactNode;
  className?: string;
  radius?: string;
  noBorder?: boolean;
}) => (
  <div
    className={`overflow-hidden  w-full bg-linear-to-l from-tm-neutral-color06 to-tm-neutral-color05 rounded-lg shadow-[0px_8px_8px_-2px_rgba(0,0,0,0.05),0px_2px_2px_0px_rgba(0,0,0,0.10),0px_-1px_0px_0px_rgba(255,255,255,0.10)] ${className}`}
    style={{
      borderRadius: radius,
      background: noBorder
        ? "transparent"
        : undefined,
      border: noBorder ? "none" : undefined,
    }}
  >
    {children}
  </div>
);

const HDivider = () => (
  <div style={{ height: "1px", background: "var(--border-faint)", margin: "0 16px" }} />
);

const SectionTitle = ({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) => (
  <div className="flex items-center gap-[6px] py-[6px]">
    <span
      className="flex items-center leading-none"
      style={{ color: "var(--color-text-muted)" }}
    >
      {icon}
    </span>
    <span
      style={{
        color: "var(--color-text-label)",
        fontSize: "var(--font-size-body-s)",
        fontWeight: "var(--font-weight-medium)",
        lineHeight: "140%",
        letterSpacing: "0.2px",
      }}
    >
      {label}
    </span>
  </div>
);

interface BadgeProps {
  value: number;
  positive: boolean;
}
const ChangeBadge = ({ value, positive }: BadgeProps) => (
  <span
    className="inline-flex items-center gap-2 px-2 py-1 rounded-xl border text-[14px] leading-[1.4] font-bold"
    style={{
      background: positive ? "#006622" : "var(--color-tm-danger-color12)",
      color: positive ? "#28ff70" : "#ff2a2a",
    }}
  >
    {positive ? "↑" : "↓"} {Math.abs(value)}%
  </span>
);

// ─── TxRow (non-admin) ────────────────────────────────────────────────────────

const statusColors: Record<string, { bg: string; text: string }> = {
  paid: { bg: "var(--color-success-bg)", text: "var(--color-success)" },
  pending: { bg: "var(--color-warning-bg)", text: "var(--color-warning)" },
  unpaid: { bg: "var(--border-faint)", text: "var(--color-text-muted)" },
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
  const tier3 = !tier1 && isTier3(tx);
  const tierLabel = tier1 ? "T1" : tier3 ? "T3" : "T2";
  const tierBg = tier1
    ? "var(--color-t1-bg)"
    : tier3
      ? "var(--color-t3-bg)"
      : "var(--color-t2-bg)";
  const tierText = tier1
    ? "var(--color-t1)"
    : tier3
      ? "var(--color-t3)"
      : "var(--color-t2)";
  const avatarBg = tier1
    ? "var(--color-t1-avatar)"
    : tier3
      ? "var(--color-t3-avatar)"
      : "var(--color-t2-avatar)";
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
    <div
      style={{
        margin: expanded ? "8px 0" : "0",
        borderRadius: expanded ? "var(--radius-card)" : "0",
        background: expanded ? "var(--color-surface)" : "transparent",
        border: expanded ? "1px solid var(--border-subtle)" : "none",
        overflow: "hidden",
        transition: "margin 0.2s ease",
      }}
    >
      <button
        type="button"
        className="w-full flex items-start gap-[12px] px-[16px] py-[16px] text-left bg-transparent border-none hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Avatar circle */}
        <div
          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-px"
          style={{ background: avatarBg, color: "var(--color-text-primary)" }}
        >
          {initials || "?"}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 lg:items-center">
          {/* Row 1: Sale + tier | amount */}
          <div className="flex items-center justify-between mb-[4px]">
            <div className="flex items-center gap-[6px]">
              <span className="text-[14px] font-semibold text-white">
                {isRefund ? "Refund" : "Sale"}
              </span>
              <span
                className="text-sm font-bold px-[6px] py-px rounded-[4px]"
                style={{ background: tierBg, color: tierText, border: `1px solid ${tierText}44` }}
              >
                {tierLabel}
              </span>
            </div>
            <span
              className="text-[14px] font-bold"
              style={{
                color: positive ? "var(--color-positive)" : "var(--color-danger)",
                textDecoration: isRefund ? "line-through" : "none",
              }}
            >
              {positive ? "+ " : "− "}${money(Math.abs(tx.amount))}
            </span>
          </div>

          {/* Row 2: description | status */}
          <div className="flex items-center justify-between mb-[4px]">
            <span className="text-sm truncate max-w-[60%]" style={{ color: "var(--color-text-dim)" }}>
              {(() => {
                const desc = tx.description || `${tx.user.firstName} ${tx.user.lastName}`;
                const match = /^(.*?from\s+)(\S+)([\s\S]*)$/.exec(desc);
                if (match) return (<>{match[1]}<strong className="text-white">{match[2]}</strong>{match[3]}</>);
                return desc;
              })()}
            </span>
            <span
              className="text-[11px] font-semibold px-[9px] py-[2px] rounded-full capitalize"
              style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.text}33` }}
            >
              {tx.status}
            </span>
          </div>

          {/* Row 3: date | chevron */}
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
              {d}/{m}/{y} {hh}:{mn}:{sc}{ap}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              style={{ color: "var(--color-text-subtle)" }}
            >
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="tx-detail-enter px-[16px] pb-[20px] text-sm">
          <div className="rounded-[10px] overflow-hidden" style={{ background: "var(--color-surface-inset)" }}>
            {saleAmt > 0 && (
              <div className="flex justify-between px-[14px] py-[10px]" style={{ borderBottom: "1px solid var(--border-elevated)" }}>
                <span style={{ color: "var(--color-text-faded)" }}>Sale Amount</span>
                <span className="font-semibold text-white">${money(saleAmt)}</span>
              </div>
            )}
            <div
              className="flex justify-between px-[14px] py-[10px]"
              style={{ borderBottom: tx.customer || tx.campaign ? "1px solid var(--border-elevated)" : "none" }}
            >
              <span style={{ color: "var(--color-text-faded)" }}>Commission</span>
              <div className="flex items-center gap-[6px]">
                <span className="font-bold" style={{ color: positive ? "var(--color-positive)" : "var(--color-danger)" }}>
                  {positive ? "+" : "−"}${money(Math.abs(tx.amount))}
                </span>
                <span style={{ color: "var(--color-text-subtle)" }}>{tx.percentage}%</span>
              </div>
            </div>
            {tx.customer && (
              <div
                className="flex justify-between px-[14px] py-[10px]"
                style={{ borderBottom: tx.campaign ? "1px solid var(--border-elevated)" : "none" }}
              >
                <span style={{ color: "var(--color-text-faded)" }}>Customer</span>
                <span style={{ color: "var(--color-text-dim)" }}>{tx.customer.email || tx.customer.name}</span>
              </div>
            )}
            {tx.campaign && (
              <div className="flex justify-between items-center px-[14px] py-[10px]">
                <span style={{ color: "var(--color-text-faded)" }}>Campaign</span>
                <span
                  className="text-sm font-semibold px-[8px] py-[2px] rounded-full text-white"
                  style={{ background: "var(--color-accent-bg)", border: "1px solid rgba(255,15,95,0.3)" }}
                >
                  {tx.campaign.name}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!expanded && <HDivider />}
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
    <div
      style={{
        margin: expanded ? "8px 0" : "0",
        borderRadius: expanded ? "var(--radius-card)" : "0",
        background: expanded ? "var(--color-surface)" : "transparent",
        border: expanded ? "1px solid var(--border-subtle)" : "none",
        overflow: "hidden",
        transition: "margin 0.2s ease",
      }}
    >
      <button
        type="button"
        className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-[12px] px-[16px] py-[16px] text-left bg-transparent border-none hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
      <div className="flex flex-row gap-3">  {/* Type badge */}
        <div
          className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: isDeposit
              ? "#006622"
              : "var(--color-tm-danger-color12)",
              color: isDeposit ? "#28ff70" : "#ff2a2a",
              border: isDeposit ? "1px solid #28ff70" : "1px solid #ff2a2a",
          }}
        >
          {isDeposit ? "↑" : "↩"}
        </div>

        {/* Label + customer + date */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-[6px] flex-wrap">
            <span className="text-[14px] font-semibold text-white">
              {isDeposit ? "Deposit" : "Refund"}
            </span>
            <span
              className="text-sm truncate"
              style={{ color: "var(--color-text-muted)" }}
            >
              {customerLabel}
            </span>
          </div>
          <div
            className="text-[11px] mt-px"
            style={{ color: "var(--color-text-subtle)" }}
          >
            {d}/{m}/{y} {hh}:{min}:{sec}
            {ampm}
          </div>
        </div></div>

        {/* Amount + chevron */}
        <div className="flex items-center gap-[8px] shrink-0 justify-between">
          <span
            className="text-[14px] font-bold"
            style={{
              color: isDeposit
                ? "var(--color-positive)"
                : "var(--color-danger)",
            }}
          >
            {isDeposit ? "+ " : "− "}${money(tx.saleAmount)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            style={{ color: "var(--color-text-subtle)" }}
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
        <div className="tx-detail-enter px-[16px] pb-[28px]">
          <div className="rounded-[10px] overflow-hidden" style={{ background: "var( --color-tm-neutral-color06)" }}>
          
          
          {/* Customer */}
          {tx.customer && (
            <div
              className="flex flex-col lg:flex-row lg:items-center justify-between px-[14px] py-[10px]"
              style={{ borderBottom: "1px solid var(--border-elevated)" }}
            >
              <span
                className="text-[11px] uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-faded)" }}
              >
                Customer
              </span>
              <div className="lg:text-right">
                <div className="text-sm font-medium text-white">
                  {tx.customer.name || tx.customer.email}
                </div>
                {tx.customer.name && tx.customer.email && (
                  <div
                    className="text-sm"
                    style={{ color: "var(--color-text-faded)" }}
                  >
                    {tx.customer.email}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Campaign */}
          {tx.campaign && (
            <div
              className="flex flex-col lg:flex-row lg:items-center justify-between px-[14px] py-[10px]"
              style={{ borderBottom: "1px solid var(--border-elevated)" }}
            >
              <span
                className="text-[11px] uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-faded)" }}
              >
                Campaign
              </span>
              <span
                className="text-[11px] px-3 py-1 rounded-full text-center"
                style={{
                  color: "var(--color-tm-primary-color02)",
                  background: "var(--color-tm-primary-color12)",
                  border: "1px solid rgba(255,15,95,0.5)",
                }}
              >
                {tx.campaign.name}
              </span>
            </div>
          )}

          {/* Sale amount */}
          <div
            className="flex flex-col lg:flex-row lg:items-center justify-between px-[14px] py-[10px]"
            style={{
              borderBottom:
                tx.commissions.length > 0
                  ? "1px solid var(--border-elevated)"
                  : "none",
            }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.07em]"
              style={{ color: "var(--color-text-faded)" }}
            >
              {isDeposit ? "Sale Amount" : "Refund Amount"}
            </span>
            <span
              className="text-[13px] font-bold"
              style={{
                color: isDeposit
                  ? "var(--color-positive)"
                  : "var(--color-danger)",
              }}
            >
              {isDeposit ? "+ " : "− "}${money(tx.saleAmount)}
            </span>
          </div>

          {/* Commissions breakdown */}
          {tx.commissions.length > 0 && (
            <div className="px-[14px] py-[10px] flex flex-col gap-[8px]">
              <span
                className="text-[11px] uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-faded)" }}
              >
                Commissions
              </span>
              {tx.commissions.map((c) => {
                const desc = (c.description ?? "").toLowerCase();
                const isT3 = desc.includes("t3");
                const isT1 =
                  !isT3 &&
                  (desc.includes("direct") ||
                    c.percentage === tx.campaign?.commissionRate);
                const tierAvatar = isT1
                  ? "var(--color-t1-avatar)"
                  : isT3
                    ? "var(--color-t3-avatar)"
                    : "var(--color-t2-avatar)";
                const commPositive = c.amount >= 0;
                const cStatus = statusColors[c.status] ?? statusColors.unpaid;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col lg:flex-row lg:items-center gap-[10px] py-[8px] px-[10px] rounded-[8px]"
                    style={{
                      background: "var(--color-surface-inset)",
                      border: "1px solid var(--border-elevated)",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: tierAvatar }}
                    >
                      {c.user.firstName?.[0] ?? "?"}
                      {c.user.lastName?.[0] ?? ""}
                    </div>
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-[5px] justify-between">
                   <div className="flex flex-col">

                         <div className="text-sm font-medium text-white truncate min-w-0 flex-1">
                          {c.user.firstName} {c.user.lastName}
                        </div>
                          <div
                        className="text-sm truncate"
                        style={{ color: "var(--color-text-faded)" }}
                      >
                        {c.user.email}
                      </div>
                   </div>
                        <div
                          className="text-xs text-center font-semibold px-[5px] py-px rounded-full shrink-0 capitalize"
                          style={{
                            background: "var(--border-elevated)",
                            color: "var(--color-tm-text-color08)",
                          }}
                        >
                          {c.user.userType?.replaceAll("_", " ").toLowerCase() ?? "promoter"}
                        </div>
                      </div>
                    
                    </div>
                   <div className="flex flex-row justify-between gap-3 items-center"> {/* Rate */}
                    <span
                      className="text-[11px] shrink-0"
                      style={{ color: "var(--color-text-subtle)" }}
                    >
                      {c.percentage}%
                    </span>
                    {/* Amount */}
                    <span
                      className="text-[13px] font-bold shrink-0"
                      style={{
                        color: commPositive
                          ? "var(--color-positive)"
                          : "var(--color-danger)",
                      }}
                    >
                      {commPositive ? "+" : "−"}${money(Math.abs(c.amount))}
                    </span></div>
                    {/* Status badge */}
                    <span
                      className="text-sm font-semibold px-[7px] py-[2px] rounded-full capitalize shrink-0 text-center"
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
        </div>
      )}

      {!expanded && <HDivider />}
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
  calRangeStart: Date | null;
  calRangeEnd: Date | null;
  loading: boolean;
  money: (n: number) => string;
  search: string;
  onSearch: (q: string) => void;
}

const AdminTxListCard = ({
  transactions,
  totalPages,
  page,
  setPage,
  isOpen,
  onToggle,
  period,
  calRangeStart,
  calRangeEnd,
  loading,
  money,
  search,
  onSearch,
}: AdminTxListCardProps) => {
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
        <span style={{ fontSize: 'var(--font-size-body-m)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-muted)' }}>
          Transactions List
        </span>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            style={{ color: "var(--color-text-muted)" }}
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

      {isOpen && (
        <>

          <div className="flex flex-col-reverse lg:grid lg:grid-cols-[1fr_3fr]">
            {/* Active period label */}
          <div className="flex items-center gap-[6px] px-[16px] py-[10px]">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: "var(--color-text-faded)" }}
            >
              <rect
                x="1"
                y="1.5"
                width="10"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path d="M1 4.5h10" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M4 0.5v2M8 0.5v2"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span
              className="text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              {calRangeStart && calRangeEnd
                ? `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${calRangeEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : calRangeStart
                  ? `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} →`
                  : PERIOD_LABELS[period]}
            </span>
          </div>

          {/* Search */}
          <div className="p-1 w-full">
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="absolute left-[10px] top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-faded)" }}
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
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Name, Email, Campaign, Customer"
                className="w-full text-white focus:outline-none"
                style={{
                  paddingLeft: '30px',
                  paddingRight: '12px',
                  height: 'var(--button-m)',
                  borderRadius: 'var(--radius-round)',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--border-faint)',
                  fontSize: 'var(--font-size-body-s)',
                }}
              />
            </div>
          </div>
</div>
          {/* Rows */}
          {loading && (
            <div className="flex items-center justify-center py-[40px]">
              <span
                className="text-[14px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Loading transactions…
              </span>
            </div>
          )}
          {!loading && transactions.length === 0 && (
            <div className="flex flex-col items-center py-[40px] gap-[8px]">
              <span className="text-[32px]">📊</span>
              <span
                className="text-[14px]"
                style={{ color: "var(--color-text-muted)" }}
              >
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
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                ‹
              </button>
              {pages.map((p, i) => {
                if (p === "…") {
                  return (
                    <span
                      key={`el-${i}`}
                      className="text-sm px-[2px]"
                      style={{ color: "var(--color-text-subtle)" }}
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
                      background:
                        page === p
                          ? "var(--color-accent-bright)"
                          : "transparent",
                      color:
                        page === p
                          ? "var(--color-text-primary)"
                          : "var(--color-text-muted)",
                      border:
                        page === p ? "none" : "1px solid var(--border-subtle)",
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
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
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
  calRangeStart: Date | null;
  calRangeEnd: Date | null;
  money: (n: number) => string;
}

const TxListCard = ({
  allTransactions,
  isOpen,
  onToggle,
  period,
  calRangeStart,
  calRangeEnd,
  money,
}: TxListCardProps) => {
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
    <Card noBorder>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-[16px] py-[14px] hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left bg-transparent border-none"
      >
        <span style={{ fontSize: 'var(--font-size-body-m)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-muted)' }}>
          Transactions List
        </span>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            style={{ color: "var(--color-text-muted)" }}
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

      {isOpen && (
        <>

          {/* Active period label */}
          <div className="flex items-center gap-[6px] px-[16px] py-[10px]">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ color: "var(--color-text-faded)" }}
            >
              <rect
                x="1"
                y="1.5"
                width="10"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path d="M1 4.5h10" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M4 0.5v2M8 0.5v2"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span
              className="text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              {calRangeStart && calRangeEnd
                ? `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${calRangeEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : calRangeStart
                  ? `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} →`
                  : PERIOD_LABELS[period]}
            </span>
          </div>

          {/* Status tabs */}
          <div style={{ display: 'flex', height: '52px', borderRadius: 'var(--radius-m)', background: '#292929', border: '1px solid #333333', overflow: 'hidden', marginTop: 'var(--space-8)' }}>
            {tabDefs.map(({ key, label }, idx) => {
              const active = statusTab === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusTab(key)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '3px',
                    background: 'transparent',
                    border: 'none',
                    borderLeft: idx > 0 ? '1px solid #333333' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: 1, color: active ? 'var(--color-accent-bright)' : 'var(--color-text-primary)' }}>
                    {count}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-medium)', lineHeight: 1, color: active ? 'var(--color-accent-bright)' : 'var(--color-text-muted)' }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div style={{ padding: 'var(--space-12) 0' }}>
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="absolute left-[10px] top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-faded)" }}
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
                className="w-full text-white focus:outline-none"
                style={{
                  paddingLeft: '30px',
                  paddingRight: '12px',
                  height: 'var(--button-m)',
                  borderRadius: 'var(--radius-round)',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--border-faint)',
                  fontSize: 'var(--font-size-body-s)',
                }}
              />
            </div>
          </div>

          {/* Rows */}
          {pageTx.length === 0 ? (
            <div className="flex flex-col items-center py-[40px] gap-[8px]">
              <span className="text-[32px]">📊</span>
              <span
                className="text-[14px]"
                style={{ color: "var(--color-text-muted)" }}
              >
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
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                ‹
              </button>
              {pages.map((p, i) => {
                if (p === "…")
                  return (
                    <span
                      key={`el-${i}`}
                      className="text-sm px-[2px]"
                      style={{ color: "var(--color-text-subtle)" }}
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
                      background:
                        page === p
                          ? "var(--color-accent-bright)"
                          : "transparent",
                      color:
                        page === p
                          ? "var(--color-text-primary)"
                          : "var(--color-text-muted)",
                      border:
                        page === p ? "none" : "1px solid var(--border-subtle)",
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
                className="w-[28px] h-[28px] rounded-[6px] text-[13px] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
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
  // Payers see the same aggregate Reports view as admins.
  const isAdmin = user?.baseRole === "admin" || user?.baseRole === "payer";
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
  const [calOpen, setCalOpen] = useState(false);
  const _today = new Date();
  const [calViewYear, setCalViewYear] = useState(_today.getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(_today.getMonth());
  const [calRangeStart, setCalRangeStart] = useState<Date | null>(null);
  const [calRangeEnd, setCalRangeEnd] = useState<Date | null>(null);
  const [calHover, setCalHover] = useState<Date | null>(null);
  const [txOpen, setTxOpen] = useState(true);
  // Admin-only: real transaction records (1 per sale/refund)
  const [adminTxList, setAdminTxList] = useState<TransactionFull[]>([]);
  const [adminTxTotalPages, setAdminTxTotalPages] = useState(1);
  const [adminTxPage, setAdminTxPage] = useState(1);
  const [adminTxLoading, setAdminTxLoading] = useState(false);
  const [adminTxSearch, setAdminTxSearch] = useState("");

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

  // Reset admin page when search, period, or date range changes
  useEffect(() => {
    setAdminTxPage(1);
  }, [adminTxSearch, period, calRangeStart, calRangeEnd]);

  // Fetch real transactions for admin whenever period, date range, search, or page changes
  useEffect(() => {
    if (!isAdmin) return;
    setAdminTxLoading(true);
    const params: Parameters<typeof transactionApi.getAll>[0] = {
      page: adminTxPage,
      limit: ITEMS_PER_PAGE,
    };
    if (calRangeStart) {
      const s = new Date(calRangeStart);
      s.setHours(0, 0, 0, 0);
      const e = calRangeEnd ? new Date(calRangeEnd) : new Date(calRangeStart);
      e.setHours(23, 59, 59, 999);
      params.startDate = s.toISOString();
      params.endDate = e.toISOString();
    } else {
      params.period = period;
    }
    if (adminTxSearch) params.search = adminTxSearch;
    transactionApi
      .getAll(params)
      .then((d) => {
        setAdminTxList(d.transactions);
        setAdminTxTotalPages(d.totalPages);
      })
      .catch(() => {
        setAdminTxList([]);
        setAdminTxTotalPages(1);
      })
      .finally(() => setAdminTxLoading(false));
  }, [isAdmin, period, adminTxPage, calRangeStart, calRangeEnd, adminTxSearch]);

  // ── filtered slices ──────────────────────────────────────────────────────

  const curr = useMemo(() => {
    if (calRangeStart) {
      const s = new Date(calRangeStart);
      s.setHours(0, 0, 0, 0);
      const e = calRangeEnd ? new Date(calRangeEnd) : new Date(calRangeStart);
      e.setHours(23, 59, 59, 999);
      const [from, to] = s <= e ? [s, e] : [e, s];
      return commissions.filter((c) => {
        const t = new Date(c.createdAt).getTime();
        return t >= from.getTime() && t <= to.getTime();
      });
    }
    return filterByPeriod(commissions, period);
  }, [commissions, period, calRangeStart, calRangeEnd]);

  const prev = useMemo(
    () => (calRangeStart ? [] : prevPeriod(commissions, period)),
    [commissions, period, calRangeStart],
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

    // Use calendar range if set, otherwise fall back to period cutoff
    let fromMs = 0;
    let toMs = Infinity;
    if (calRangeStart) {
      const s = new Date(calRangeStart);
      s.setHours(0, 0, 0, 0);
      const e = calRangeEnd ? new Date(calRangeEnd) : new Date(calRangeStart);
      e.setHours(23, 59, 59, 999);
      [fromMs, toMs] =
        s <= e ? [s.getTime(), e.getTime()] : [e.getTime(), s.getTime()];
    } else {
      fromMs = period === "all" ? 0 : cutoffMs(PERIOD_DAYS[period]);
    }

    // Build a map: userId → { name, totalRevenue, photoUrl }
    // covering both direct referrals and their children (full network)
    const earningsMap = new Map<string, { name: string; revenue: number; photoUrl: string | null }>();

    const accumulateCommissions = (
      person: { id: string; firstName: string; lastName: string; photoUrl?: string | null },
      commissions: Array<{ amount: number; userId: string; createdAt: string }>,
    ) => {
      const entry = earningsMap.get(person.id) ?? {
        name: `${person.firstName} ${person.lastName}`,
        revenue: 0,
        photoUrl: person.photoUrl ?? null,
      };
      // If a later pass has a photo and the earlier one didn't, keep the photo.
      if (!entry.photoUrl && person.photoUrl) entry.photoUrl = person.photoUrl;
      const earned = commissions
        .filter((c) => {
          if (c.amount <= 0 || c.userId !== person.id) return false;
          const t = new Date(c.createdAt).getTime();
          return t >= fromMs && t <= toMs;
        })
        .reduce((sum, c) => sum + c.amount, 0);
      entry.revenue += earned;
      earningsMap.set(person.id, entry);
    };

    myReferrals.forEach((r) => {
      // Direct referral (e.g. Jorlyn → Sofia)
      if (r.referredUser) {
        // Sofia's T1 earnings on the Jorlyn→Sofia referral ($66+$51)
        accumulateCommissions(r.referredUser, r.commissions ?? []);

        // Sofia also earns T2 commissions stored on child referrals (e.g. Sofia→Kelly)
        // e.g. Sofia's $15 T2 from the carol/kelly transaction lives on referralSofiaToKelly
        (r.childReferrals ?? []).forEach((cr) => {
          accumulateCommissions(r.referredUser!, cr.commissions ?? []);
        });
      }
      // Child referrals: accumulate the child person's own earnings (e.g. Kelly's T1 $90)
      (r.childReferrals ?? []).forEach((cr) => {
        if (cr.referredUser) {
          accumulateCommissions(cr.referredUser, cr.commissions ?? []);
        }
      });
    });

    return Array.from(earningsMap.values())
      .filter((p) => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [myReferrals, isManager, period, calRangeStart, calRangeEnd]);

  // Count all users in the network (direct + their children)
  const promoterCount = useMemo(() => {
    const ids = new Set<string>();
    myReferrals.forEach((r) => {
      if (r.referredUser) ids.add(r.referredUser.id);
      (r.childReferrals ?? []).forEach((cr) => {
        if (cr.referredUser) ids.add(cr.referredUser.id);
      });
    });
    return ids.size;
  }, [myReferrals]);
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
    setCalRangeStart(null);
    setCalRangeEnd(null);
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const calPrevMonth = () => {
    if (calViewMonth === 0) {
      setCalViewMonth(11);
      setCalViewYear((y) => y - 1);
    } else setCalViewMonth((m) => m - 1);
  };
  const calNextMonth = () => {
    if (calViewMonth === 11) {
      setCalViewMonth(0);
      setCalViewYear((y) => y + 1);
    } else setCalViewMonth((m) => m + 1);
  };
  const calToMs = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const calEffectiveEnd = calRangeEnd ?? calHover;
  const calRangeStartMs = calRangeStart ? calToMs(calRangeStart) : null;
  const calRangeEndMs = calEffectiveEnd ? calToMs(calEffectiveEnd) : null;
  const calFromMs =
    calRangeStartMs !== null && calRangeEndMs !== null
      ? Math.min(calRangeStartMs, calRangeEndMs)
      : calRangeStartMs;
  const calToMsVal =
    calRangeStartMs !== null && calRangeEndMs !== null
      ? Math.max(calRangeStartMs, calRangeEndMs)
      : calRangeStartMs;

  const buildCalCells = (year: number, month: number): (number | null)[] => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...new Array(firstDay).fill(null),
      ...new Array(daysInMonth).fill(0).map((_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const handleCalDayClick = (day: number) => {
    const clicked = new Date(calViewYear, calViewMonth, day);
    if (!calRangeStart || (calRangeStart && calRangeEnd)) {
      setCalRangeStart(clicked);
      setCalRangeEnd(null);
      setCalHover(null);
      setAdminTxPage(1);
    } else {
      const s = calToMs(calRangeStart);
      const c = calToMs(clicked);
      if (c >= s) {
        setCalRangeEnd(clicked);
      } else {
        setCalRangeEnd(calRangeStart);
        setCalRangeStart(clicked);
      }
      setCalHover(null);
      setAdminTxPage(1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[80px]">
        <span
          className="text-[16px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Loading reports…
        </span>
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
        <div className="relative flex items-center gap-[8px]">
          <div className="relative flex-1">
            <button
              onClick={() => setPeriodOpen((o) => !o)}
              className="w-full flex items-center justify-between text-[14px] hover:opacity-80 transition-opacity"
              style={{
                height: "var(--button-m)",
                paddingLeft: "var(--space-16)",
                paddingRight: "var(--space-16)",
                gap: "var(--space-8)",
                background: "#292929",
                borderRadius: "var(--radius-m)",
                color: "var(--color-text-dim)",
                boxShadow: "var(--shadow-rim-light)",
              }}
            >
              {(() => {
                if (calRangeStart && calRangeEnd)
                  return `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${calRangeEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                if (calRangeStart)
                  return `${calRangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} →`;
                return PERIOD_LABELS[period];
              })()}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 5L7 9L11 5"
                  stroke="var(--color-text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
                  className="absolute left-0 right-0 z-20 overflow-hidden"
                  style={{
                    top: "calc(var(--button-m) + var(--space-4))",
                    borderRadius: "var(--radius-m)",
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--border-faint)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => selectPeriod(p)}
                      className="w-full text-left text-[14px] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      style={{
                        padding: "var(--space-14) var(--space-16)",
                        color:
                          period === p
                            ? "var(--color-accent-bright)"
                            : "var(--color-text-primary)",
                      }}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setCalOpen((o) => !o)}
            className="flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{
              width: "var(--button-m)",
              height: "var(--button-m)",
             
              borderRadius: "var(--radius-s)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <img src={calenderIcon} width="18" height="20" alt="calendar" />
          </button>

          {/* ── Calendar range overlay ── */}
          {calOpen &&
            (() => {
              const MONTH_NAMES = [
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ];
              const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
              const cells = buildCalCells(calViewYear, calViewMonth);
              const dayMs = (day: number) =>
                calToMs(new Date(calViewYear, calViewMonth, day));
              const rangeFromMs = calFromMs;
              const rangeToMs = calToMsVal;

              const headerYear = calRangeStart
                ? calRangeStart.getFullYear()
                : calViewYear;
              const headerDate = calRangeStart
                ? calRangeStart.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "Select date";

              return (
                <>
                  {/* Transparent backdrop to close */}
                  <button
                    type="button"
                    aria-label="Close calendar"
                    className="fixed inset-0 z-40 cursor-default border-none p-0 bg-transparent"
                    onClick={() => setCalOpen(false)}
                  />
                  {/* Calendar dropdown */}
                  <div
                    className="absolute left-0 right-0 z-50 overflow-hidden"
                    style={{
                      top: "calc(var(--button-m) + var(--space-4))",
                      borderRadius: "var(--radius-m)",
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--border-faint)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        padding:
                          "var(--space-16) var(--space-16) var(--space-12)",
                      }}
                    >
                      <div
                        className="text-sm"
                        style={{
                          color: "var(--color-text-muted)",
                          marginBottom: "2px",
                        }}
                      >
                        {headerYear}
                      </div>
                      <div className="text-[22px] font-semibold text-white leading-tight">
                        {headerDate}
                        {calRangeEnd && (
                          <span style={{ color: "var(--color-text-muted)" }}>
                            {" – "}
                            {calRangeEnd.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        height: "1px",
                        background: "var(--border-faint)",
                      }}
                    />
                    {/* Month nav */}
                    <div
                      className="flex items-center justify-between"
                      style={{
                        padding: "var(--space-12) var(--space-16)",
                      }}
                    >
                      <button
                        onClick={calPrevMonth}
                        className="w-[28px] h-[28px] flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <svg
                          width="7"
                          height="12"
                          viewBox="0 0 7 12"
                          fill="none"
                        >
                          <path
                            d="M6 1L1 6L6 11"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <span
                        className="text-[14px] font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {MONTH_NAMES[calViewMonth]} {calViewYear}
                      </span>
                      <button
                        onClick={calNextMonth}
                        className="w-[28px] h-[28px] flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <svg
                          width="7"
                          height="12"
                          viewBox="0 0 7 12"
                          fill="none"
                        >
                          <path
                            d="M1 1L6 6L1 11"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div
                      style={{
                        height: "1px",
                        background: "var(--border-faint)",
                      }}
                    />
                    {/* Day headers */}
                    <div
                      className="grid grid-cols-7"
                      style={{
                        padding:
                          "var(--space-12) var(--space-16) var(--space-4)",
                      }}
                    >
                      {DAY_NAMES.map((d) => (
                        <div
                          key={d}
                          className="text-center text-[11px] font-bold"
                          style={{ color: "rgba(255,255,255,0.3)" }}
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                    {/* Date grid */}
                    <div
                      className="grid grid-cols-7 gap-y-[2px]"
                      style={{
                        padding: "0 var(--space-16) var(--space-16)",
                      }}
                      onMouseLeave={() => setCalHover(null)}
                    >
                      {cells.map((day, i) => {
                        if (day === null)
                          return (
                            <div
                              key={`e-${calViewYear}-${calViewMonth}-${i}`}
                              className="h-[36px]"
                            />
                          );
                        const ms = dayMs(day);
                        const isStart =
                          rangeFromMs !== null && ms === rangeFromMs;
                        const isEnd = rangeToMs !== null && ms === rangeToMs;
                        const inRange =
                          rangeFromMs !== null &&
                          rangeToMs !== null &&
                          ms > rangeFromMs &&
                          ms < rangeToMs;
                        const isEndpoint = isStart || isEnd;
                        const isToday =
                          new Date().getFullYear() === calViewYear &&
                          new Date().getMonth() === calViewMonth &&
                          new Date().getDate() === day;
                        let btnBg = "transparent";
                        if (isEndpoint)
                          btnBg =
                            "linear-gradient(135deg, var(--color-tm-primary-color06), var(--color-tm-primary-color11))";
                        else if (isToday) btnBg = "rgba(255,15,95,0.12)";
                        let btnColor = "rgba(255,255,255,0.8)";
                        if (isEndpoint) btnColor = "var(--color-text-primary)";
                        else if (isToday)
                          btnColor = "white";
                        return (
                          <div
                            key={`cell-${calViewYear}-${calViewMonth}-${i}`}
                            className="relative h-[36px] flex items-center justify-center"
                          >
                            {inRange && (
                              <div
                                className="absolute inset-0"
                                style={{ background: "rgba(255,15,95,0.13)" }}
                              />
                            )}
                            {isStart && rangeToMs !== null && (
                              <div
                                className="absolute top-0 bottom-0 right-0 w-1/2"
                                style={{ background: "rgba(255,15,95,0.13)" }}
                              />
                            )}
                            {isEnd && rangeFromMs !== ms && (
                              <div
                                className="absolute top-0 bottom-0 left-0 w-1/2"
                                style={{ background: "rgba(255,15,95,0.13)" }}
                              />
                            )}
                            <button
                              className="relative z-10 w-[34px] h-[34px] flex items-center justify-center text-[13px] rounded-full transition-all"
                              style={{
                                background: btnBg,
                                color: btnColor,
                                fontWeight: isEndpoint || isToday ? 700 : 400,
                                border:
                                  isToday && !isEndpoint
                                    ? "1px dashed var(--color-tm-primary-color05)"
                                    : "none",
                              }}
                              onClick={() => handleCalDayClick(day)}
                              onMouseEnter={() => {
                                if (!calRangeEnd)
                                  setCalHover(
                                    new Date(calViewYear, calViewMonth, day),
                                  );
                              }}
                            >
                              {day}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {/* Footer */}
                    <div
                      className="flex items-center justify-between"
                      style={{
                        padding: "var(--space-12) var(--space-16)",
                        borderTop: "1px solid var(--border-faint)",
                      }}
                    >
                      <button
                        onClick={() => {
                          setCalRangeStart(null);
                          setCalRangeEnd(null);
                          setCalHover(null);
                          setCalOpen(false);
                        }}
                        className="text-[13px] font-medium transition-colors hover:opacity-70"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setCalOpen(false)}
                        disabled={!calRangeStart}
                        className="text-[13px] font-semibold px-[20px] py-[8px] rounded-[8px] transition-all"
                        style={{
                          background: calRangeStart
                            ? "linear-gradient(135deg, var(--color-tm-primary-color05), var(--color-tm-primary-color12))"
                            : "var(--border-faint)",
                          color: calRangeStart
                            ? "var(--color-text-primary)"
                            : "rgba(255,255,255,0.3)",
                        cursor: calRangeStart ? "pointer" : "default",
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
        </div>
      </div>

      {/* ── Ledger ── */}
      <div className="flex flex-col gap-3">
        <SectionTitle
          icon={<img src={ledgerIcon} width="16" height="16" alt="" />}
          label="Ledger"
        />

        {/* Chart */}
        <Chart data={chartData} className="h-[180px] w-full bg-linear-to-l from-tm-neutral-color06 to-tm-neutral-color05 rounded-lg shadow-[0px_8px_8px_-2px_rgba(0,0,0,0.05),0px_2px_2px_0px_rgba(0,0,0,0.10),0px_-1px_0px_0px_rgba(255,255,255,0.10)] outline outline-1 outline-offset-1 outline-border-subtle/5" />

        {/* Transactions total — admin only */}
        {isAdmin && (
          <Card radius="var(--radius-m)">
            <div className="flex flex-col gap-0" style={{ padding: 'var(--space-20)' }}>
              <span className="stat-label">Transactions</span>
           <div className="grid grid-cols-2 items-center justify-items-end">   <div className="stat-value">${money(currTotal)}</div>    {totalChange !== null && (
                <div className="">
                  <ChangeBadge
                    value={totalChange}
                    positive={totalChange >= 0}
                  />
                </div>
              )}</div>
          
            </div>
          </Card>
        )}

        {/* Paid / Pending */}
        <div className="grid grid-cols-2 gap-4">
          <Card radius="var(--radius-m)">
            <div className="flex flex-col gap-0" style={{ padding: 'var(--space-20)' }}>
              <span className="stat-label">Paid</span>
              <span className="stat-value text-base">${money(currPaid)}</span>
            </div>
          </Card>
          <Card radius="var(--radius-m)">
            <div className="flex flex-col gap-0" style={{ padding: 'var(--space-20)' }}>
              <span className="stat-label">Pending</span>
              <span className="stat-value">${money(currPending)}</span>
            </div>
          </Card>
        </div>

        {/* Refunded */}
        <Card radius="var(--radius-m)">
          <div className="flex flex-col gap-0" style={{ padding: 'var(--space-20)' }}>
            <span className="stat-label">Refunded</span>
            <div className="flex items-center justify-between">
              <span className="stat-value">${money(currRefunded)}</span>
              {refundChange !== null && refundChange !== 0 && (
                <ChangeBadge value={refundChange} positive={refundChange < 0} />
              )}
            </div>
          </div>
        </Card>

        {/* Promoters / Users — manager only */}
        {isManager && (
          <div className="grid grid-cols-2 gap-4">
            <Card radius="var(--radius-m)">
              <div className="flex flex-col gap-4" style={{ padding: 'var(--space-20)' }}>
                <span className="stat-label">Promoters</span>
                <span className="stat-value">{promoterCount}</span>
              </div>
            </Card>
            <Card radius="var(--radius-m)">
              <div className="flex flex-col gap-4" style={{ padding: 'var(--space-20)' }}>
                <span className="stat-label">Users</span>
                <span className="stat-value">{managedCustomerCount}</span>
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
          calRangeStart={calRangeStart}
          calRangeEnd={calRangeEnd}
          loading={adminTxLoading}
          money={money}
          search={adminTxSearch}
          onSearch={setAdminTxSearch}
        />
      ) : (
        <TxListCard
          allTransactions={sortedTx}
          isOpen={txOpen}
          onToggle={() => setTxOpen((o) => !o)}
          period={period}
          calRangeStart={calRangeStart}
          calRangeEnd={calRangeEnd}
          money={money}
        />
      )}

      {/* ── Top Users ── (promoter only) */}
      {isPromoter && (
        <>
          <div className="flex flex-col gap-2">
            <SectionTitle icon={<img src={topUsersIcon} width="12" height="12" alt="" />} label="Top Users" />

            {topCustomers.length === 0 ? (
              <div className="flex flex-col items-center py-[32px] gap-[8px]">
                <span className="text-[28px]">👤</span>
                <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>
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
                  <div
                    key={`${name}-${idx}`}
                    className="flex items-center gap-[12px]"
                    style={{
                      padding: '0 var(--space-16)',
                      height: 'var(--button-m)',
                      borderRadius: 'var(--radius-round)',
                      background: 'var(--color-surface-end)',
                      boxShadow: '0 -1px 0 0 rgba(255,255,255,0.10)',
                    }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ width: '16px', height: '16px', background: avatarBg, fontSize: '7px' }}
                    >
                      {initials}
                    </div>
                    <span className="flex-1 truncate" style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: '#7A7A7A' }}>
                      {name}
                    </span>
                    <span className="shrink-0" style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-primary)' }}>
                      ${money(revenue)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* USERS stat card */}
          <Card radius="var(--radius-m)">
            {/* Total */}
            <div style={{ padding: 'var(--space-20) var(--space-20) var(--space-16)' }}>
              <div className="flex items-center justify-between">
                <span className="stat-label">Users</span>
                {newCustomerCount > 0 && (
                  <span
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-xl border text-[14px] leading-[1.4] font-bold"
                    style={{ background: "var(--color-success)", color:"#28ff70" }}
                  >
                    ↑ {newCustomerCount}
                  </span>
                )}
              </div>
              <div className="text-[26px] font-bold text-white mt-[4px] leading-none">
                {allCustomers.length.toLocaleString()}
              </div>
            </div>
<div className="grid grid-cols-2 gap-12 ">
            <div className="flex items-center justify-between" style={{ padding: 'var(--space-8) var(--space-20)' }}>
              <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>Idle</span>
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                {idleCustomerCount.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between" style={{ padding: 'var(--space-8) var(--space-20)' }}>
              <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>Unpaid</span>
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                {unpaidCustomerCount.toLocaleString()}
              </span>
            </div></div>

            <button
              onClick={() => navigate("/models")}
              className="w-full flex items-center justify-between hover:bg-[rgba(255,255,255,0.03)] transition-colors"
              style={{ padding: 'var(--space-12) var(--space-20)' }}
            >
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>
                View Details
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--color-text-muted)', transform: 'rotate(-90deg)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          </Card>
        </>
      )}

      {/* ── Top Performers ── (manager only) */}
      {isManager && (
        <div className="flex flex-col gap-2">
          <SectionTitle icon={<img src={topUsersIcon} width="12" height="12" alt="" />} label="Top Performers" />

          {topPerformers.length === 0 ? (
            <div className="flex flex-col items-center py-[32px] gap-[8px]">
              <span className="text-[28px]">📈</span>
              <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>
                No performance data for this period
              </span>
            </div>
          ) : (
            topPerformers.map(({ name, revenue, photoUrl }, idx) => {
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
                <div
                  key={`${name}-${idx}`}
                  className="flex items-center gap-[12px]"
                  style={{
                    padding: '0 var(--space-16)',
                    height: 'var(--button-m)',
                    borderRadius: 'var(--radius-round)',
                    background: 'var(--color-surface-end)',
                    boxShadow: '0 -1px 0 0 rgba(255,255,255,0.10)',
                  }}
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={name}
                      className="rounded-full shrink-0 object-cover"
                      style={{ width: '16px', height: '16px' }}
                    />
                  ) : (
                    <div
                      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
                      style={{ width: '16px', height: '16px', background: avatarBg, fontSize: '7px' }}
                    >
                      {initials}
                    </div>
                  )}
                  <span className="flex-1 truncate" style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: '#7A7A7A' }}>
                    {name}
                  </span>
                  <span className="shrink-0" style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-primary)' }}>
                    ${money(revenue)}
                  </span>
                </div>
              );
            })
          )}

          {/* Manage Influencers link */}
          <button
            onClick={() => navigate("/models")}
            className="w-full flex items-center justify-between hover:opacity-70 transition-opacity"
            style={{ padding: 'var(--space-8) 0' }}
          >
            <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-accent-bright)' }}>
              Manage Influencers
            </span>
            <span style={{ color: 'var(--color-accent-bright)', fontSize: '18px' }}>›</span>
          </button>
        </div>
      )}

      {/* ── Network ── (admin only) */}
      {isAdmin && (
        <div className="flex flex-col gap-[6px]">
          <SectionTitle icon={<img src={networkIcon} width="16" height="16" alt="" />} label="Network" />
   <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">       {[
            { label: "Account Managers", count: wf.accountManagers },
            { label: "Promoters", count: wf.promoters },
            { label: "Referral Managers", count: wf.referralManagers },
          ].map(({ label, count }) => (
            <Card key={label} radius="var(--radius-m)">
              <button
                onClick={() => navigate("/models")}
                className="w-full flex items-center justify-between hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                style={{ padding: 'var(--space-20)' }}
              >
                <div className="text-left flex flex-col gap-3">
                  <div style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-muted)' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', lineHeight: '140%', letterSpacing: '0.2px', color: 'var(--color-text-primary)' }}>
                    {count.toLocaleString()}
                  </div>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--color-text-muted)', transform: 'rotate(-90deg)' }}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>
            </Card>
          ))}</div>
        </div>
      )}

      {/* ── Users ── (admin only) */}
      {isAdmin && (
        <div className="flex flex-col gap-[6px]">
          <SectionTitle icon={<img src={usersIcon} width="16" height="16" alt="" />} label="Users" />
          <Card radius="var(--radius-m)">
            {/* USERS total */}
            <div style={{ padding: 'var(--space-20) var(--space-20) var(--space-16)' }}>
              <div className="flex items-center justify-between">
                <span className="stat-label">Users</span>
               
              </div>
              <div className="grid grid-cols-2 gap-4 justify-items-end items-center text-[26px] font-bold mt-[4px] leading-none">
               <div className="w-full"> {nonAdmin.length.toLocaleString()}</div>
               <div className=""> {newUsersCount > 0 && (
                  <span
                    className="inline-flex items-center gap-[3px] text-sm font-bold px-[10px] py-[4px] rounded-full"
                     style={{ background: "#006622", color:"#28ff70", border:"1px solid #28ff70" }}
                  >
                    ↑ {newUsersCount}
                  </span>
                )}</div>
               
              </div>
            </div>
<div className="grid grid-cols-2 gap-12 ">
            <div className="flex items-center justify-between" style={{ padding: 'var(--space-8) var(--space-20)' }}>
              <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>Idle</span>
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                {idleCount.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between" style={{ padding: 'var(--space-8) var(--space-20)' }}>
              <span style={{ fontSize: 'var(--font-size-body-s)', color: 'var(--color-text-muted)' }}>Unpaid</span>
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                {unpaidCount.toLocaleString()}
              </span>
            </div></div>

            <button
              onClick={() => navigate("/models")}
              className="w-full flex items-center justify-between hover:bg-[rgba(255,255,255,0.03)] transition-colors"
              style={{ padding: 'var(--space-12) var(--space-20)' }}
            >
              <span style={{ fontSize: 'var(--font-size-body-s)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>
                View Details
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--color-text-muted)', transform: 'rotate(-90deg)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          </Card>
        </div>
      )}
    </div>
  );
};
