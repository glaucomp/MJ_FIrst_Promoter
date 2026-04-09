import { useEffect, useMemo, useState } from "react";
import { commissionApi, wiseApi, type Commission } from "../services/api";

// ─── Fortnight cycle helpers ──────────────────────────────────────────────────

/**
 * Payouts run on the 1st and 15th of every month.
 * Returns { cycleStart, cycleEnd, nextPayout, daysLeft }.
 */
function getFortnightCycle(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  let cycleStart: Date;
  let nextPayout: Date;

  if (d < 15) {
    cycleStart = new Date(y, m, 1);
    nextPayout = new Date(y, m, 15);
  } else {
    cycleStart = new Date(y, m, 15);
    nextPayout = new Date(y, m + 1, 1); // 1st of next month
  }

  const cycleEnd = new Date(nextPayout.getTime() - 1);
  const daysLeft = Math.ceil(
    (nextPayout.getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000,
  );

  return { cycleStart, cycleEnd, nextPayout, daysLeft: Math.max(0, daysLeft) };
}

const fmt = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const money = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromoterGroup {
  userId: string;
  name: string;
  email: string;
  wiseRecipientId: string | null;
  commissions: Commission[];
  totalOwed: number;
  totalOnHold: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const REFUND_HOLD_DAYS = 7;

const holdDaysRemaining = (createdAt: string): number => {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(REFUND_HOLD_DAYS - ageDays));
};

const isOnHold = (createdAt: string) => holdDaysRemaining(createdAt) > 0;

function getStatusStyle(status: Commission["status"]) {
  if (status === "paid")
    return {
      background: "rgba(0,217,72,0.12)",
      color: "#00d948",
      border: "1px solid rgba(0,217,72,0.25)",
    };
  if (status === "pending")
    return {
      background: "rgba(255,185,0,0.12)",
      color: "#ffb900",
      border: "1px solid rgba(255,185,0,0.25)",
    };
  return {
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusDot = ({ ok }: { ok: boolean }) => (
  <span
    className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
    style={{ background: ok ? "#00d948" : "#ff4444" }}
  />
);

const WiseBadge = ({ recipientId }: { recipientId: string | null }) =>
  recipientId ? (
    <span
      className="inline-flex items-center gap-[5px] text-sm font-semibold px-[8px] py-[2px] rounded-full"
      style={{
        background: "oklch(0.857 0.17 134.6 / 0.2)",
        color: "oklch(0.857 0.17 134.6 )",
        border: "1px solid oklch(0.857 0.17 134.6 / 0.2)",
      }}
    >
      <StatusDot ok /> Wise ID {recipientId}
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-[5px] text-sm font-semibold px-[8px] py-[2px] rounded-full"
      style={{
        background: "rgba(255,68,68,0.10)",
        color: "#ff6b6b",
        border: "1px solid rgba(255,68,68,0.25)",
      }}
    >
      <StatusDot ok={false} /> No Wise set up
    </span>
  );

// ─── PromoterRow ─────────────────────────────────────────────────────────────

const PromoterRow = ({
  group,
  onPaid,
}: {
  group: PromoterGroup;
  onPaid: (ids: string[]) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unpaidCommissions = group.commissions.filter(
    (c) => c.status !== "paid",
  );
  const payableCommissions = unpaidCommissions.filter(
    (c) => !isOnHold(c.createdAt),
  );
  const canPay =
    group.wiseRecipientId !== null && payableCommissions.length > 0;

  const handlePayAll = async () => {
    if (!canPay) return;
    setLoading(true);
    setError(null);
    try {
      const result = await wiseApi.initiateBulkPayout(
        payableCommissions.map((c) => c.id),
      );
      if (result.failed > 0) {
        const firstErr = result.results.find((r) => !r.success)?.error;
        setError(`${result.failed} payment(s) failed: ${firstErr}`);
      }
      const paid = result.results
        .filter((r) => r.success)
        .map((r) => r.commissionId);
      if (paid.length > 0) onPaid(paid);
    } catch (err: any) {
      setError(err.message || "Payout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{
        border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      }}
    >
      {/* Row header */}
      <div className="flex lg:items-center flex-col lg:flex-row gap-[12px] px-[16px] py-[14px] bg-[#1e1e1e] lg:grid lg:grid-cols-2">
      <div className="flex lg:items-center flex-row gap-4">  {/* Avatar */}
        <div
          className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg,#ff0f5f,#cc0047)" }}
        >
          {(group.name[0] ?? "?").toUpperCase()}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="text-[14px] font-semibold text-white truncate">
              {group.name}
            </span>
            <WiseBadge recipientId={group.wiseRecipientId} />
          </div>
          <div
            className="text-sm mt-px"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {group.email}
          </div>
        </div></div>

        {/* Amount + pay button */}
        <div className="grid grid-cols-2 lg:flex items-center gap-[10px] shrink-0 lg:justify-end ">
          <div className="lg:text-right  flex flex-row-reverse justify-between items-center lg:items-end lg:gap-0 w-full lg:flex-col">
            <div className="text-[15px] font-bold text-white">
              ${money(group.totalOwed)}
            </div>
            {group.totalOnHold > 0 && (
              <div className="text-[10px]" style={{ color: "#ffb900" }}>
                +${money(group.totalOnHold)} on hold
              </div>
            )}
            <div
              className="text-[10px]"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              {plural(unpaidCommissions.length, "commission")}
            </div>
          </div>
<div className="flex flex-col-reverse gap-2 lg:flex-row lg:gap-4">
       {/* Expand toggle */}
          <button
            onClick={() => setExpanded((p) => !p)}
            className="h-8 flex items-center justify-center rounded-[6px] transition-colors w-full lg:w-12 lg:h-auto"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>




          {unpaidCommissions.length > 0 && (
            <button
              onClick={handlePayAll}
              disabled={!canPay || loading}
              title={
                group.wiseRecipientId
                  ? undefined
                  : "No Wise recipient configured"
              }
              className="text-[12px] font-bold px-[14px] py-[8px] rounded-[8px] transition-all  whitespace-nowrap"
              style={{
                background:
                  canPay && !loading
                    ? "linear-gradient(0deg, rgb(44, 81, 31), rgb(159, 232, 112))"
                    : "none",
                color: canPay && !loading ? "#163400" : "#8D8D8D",
                         cursor: canPay && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Sending…" : "Pay via Wise"}
            </button>
          )}
</div>

          {unpaidCommissions.length === 0 && (
            <span
              className="text-sm font-semibold px-[10px] py-[5px] rounded-full"
              style={{
                background: "rgba(0,217,72,0.12)",
                color: "#00d948",
                border: "1px solid rgba(0,217,72,0.25)",
              }}
            >
              Paid ✓
            </span>
          )}

     
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-[16px] py-[8px] text-[12px]"
          style={{
            background: "rgba(255,68,68,0.08)",
            color: "#ff6b6b",
            borderTop: "1px solid rgba(255,68,68,0.15)",
          }}
        >
          {error}
        </div>
      )}

      {/* Commission details */}
      {expanded && (
        <div
          className="flex flex-col"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            background: "var(--color-tm-neutral-color05)",
          }}
        >
          {group.commissions.map((c, i) => {
            const isPaid = c.status === "paid";
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-[12px] px-[16px] py-[10px] "
                style={{
                  borderBottom:
                    i < group.commissions.length - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                }}
              >
                <div className="lg:flex-1 lg:min-w-0 w-full">
                  <div className="text-base lg:text-sm text-white">
                    {c.campaign?.name ?? "—"}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    {new Date(c.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
             <div className="flex flex-row justify-between w-full lg:w-fit lg:gap-3">
   <div
                  className="text-sm shrink-0"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  {c.percentage}%
                </div>
                <div
                  className="text-[13px] font-bold shrink-0"
                  style={{ color: c.amount >= 0 ? "#00d948" : "#ff4444" }}
                >
                  ${money(Math.abs(c.amount))}
                </div>

             </div>
                <span
                  className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full capitalize shrink-0 w-full text-center lg:w-fit"
                  style={getStatusStyle(c.status)}
                >
                  {c.status}
                </span>
                {!isPaid && isOnHold(c.createdAt) && (
                  <span
                    className="inline-flex items-center gap-[3px] text-[10px] font-semibold px-[7px] py-[2px] rounded-full shrink-0"
                    style={{
                      background: "rgba(255,185,0,0.12)",
                      color: "#ffb900",
                      border: "1px solid rgba(255,185,0,0.3)",
                    }}
                    title={`Refund hold: releases in ${holdDaysRemaining(c.createdAt)} day(s)`}
                  >
                    🔒 {holdDaysRemaining(c.createdAt)}d hold
                  </span>
                )}
                {isPaid && c.wiseTransferId && (
                  <span className="text-[9px]" style={{ color: "#00b9ff" }}>
                    #{c.wiseTransferId}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const Payouts = () => {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const cycle = useMemo(() => getFortnightCycle(), []);

  useEffect(() => {
    commissionApi
      .getAll()
      .then(setCommissions)
      .catch(() => setCommissions([]))
      .finally(() => setLoading(false));
  }, []);

  // Group commissions by promoter
  const groups = useMemo<PromoterGroup[]>(() => {
    const map = new Map<string, PromoterGroup>();
    for (const c of commissions) {
      const uid = c.user.id;
      if (!map.has(uid)) {
        map.set(uid, {
          userId: uid,
          name:
            [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") ||
            c.user.email,
          email: c.user.email,
          wiseRecipientId: c.user.wiseRecipientId ?? null,
          commissions: [],
          totalOwed: 0,
          totalOnHold: 0,
        });
      }
      const g = map.get(uid);
      if (g) {
        g.commissions.push(c);
        if (c.status !== "paid") {
          if (isOnHold(c.createdAt)) {
            g.totalOnHold += c.amount;
          } else {
            g.totalOwed += c.amount;
          }
        }
      }
    }
    return Array.from(map.values());
  }, [commissions]);

  const pendingGroups = useMemo(
    () => groups.filter((g) => g.commissions.some((c) => c.status !== "paid")),
    [groups],
  );
  const historyGroups = useMemo(
    () =>
      groups.filter((g) =>
        g.commissions.some((c) => c.status === "paid" && c.wiseTransferId),
      ),
    [groups],
  );

  const totalPending = useMemo(
    () => pendingGroups.reduce((s, g) => s + g.totalOwed + g.totalOnHold, 0),
    [pendingGroups],
  );
  const totalOnHold = useMemo(
    () => pendingGroups.reduce((s, g) => s + g.totalOnHold, 0),
    [pendingGroups],
  );
  const readyGroups = useMemo(
    () => pendingGroups.filter((g) => g.wiseRecipientId && g.totalOwed > 0),
    [pendingGroups],
  );
  const readyCount = readyGroups.length;
  const readyTotal = useMemo(
    () => readyGroups.reduce((s, g) => s + g.totalOwed, 0),
    [readyGroups],
  );

  const handlePaid = (ids: string[]) => {
    setCommissions((prev) =>
      prev.map((c) =>
        ids.includes(c.id) ? { ...c, status: "paid" as const } : c,
      ),
    );
  };

  const handlePayAllReady = async () => {
    const ids = pendingGroups
      .filter((g) => g.wiseRecipientId)
      .flatMap((g) =>
        g.commissions
          .filter((c) => c.status !== "paid" && !isOnHold(c.createdAt))
          .map((c) => c.id),
      );
    if (ids.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    try {
      const result = await wiseApi.initiateBulkPayout(ids);
      if (result.failed > 0) {
        const firstErr = result.results.find((r) => !r.success)?.error;
        setBulkError(`${result.failed} payment(s) failed: ${firstErr}`);
      }
      const paid = result.results
        .filter((r) => r.success)
        .map((r) => r.commissionId);
      if (paid.length > 0) handlePaid(paid);
    } catch (err: any) {
      setBulkError(err.message || "Bulk payout failed");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page title ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white">
          Payouts
        </h1>
        <span
          className="text-[12px] font-medium px-[10px] py-[4px] rounded-full"
          style={{
            background: "rgba(0,185,255,0.1)",
            color: "#00b9ff",
            border: "1px solid rgba(0,185,255,0.2)",
          }}
        >
          Fortnight cycle
        </span>
      </div>

      {/* ── Fortnight cycle card ── */}
      <div className=" p-5
       lg:p-10 flex flex-col bg-linear-to-b from-tm-neutral-color06 to-tm-neutral-color05 rounded-xl shadow-[0px_8px_8px_-2px_rgba(0,0,0,0.05),0px_2px_2px_0px_rgba(0,0,0,0.10),0px_-1px_0px_0px_rgba(255,255,255,0.10)] outline-1 outline-offset-1 outline-border-subtle/5 items-start gap-2">
        <div className="flex items-start flex-col lg:flex-row lg:justify-between w-full gap-4">
          <div className="flex items-start gap-3 flex-col lg:flex-row">
            <div
              className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[#173300] font-black text-[14px]"
              style={{ background: "linear-gradient(135deg,#9fe870,#9fe870)" }}
            >
             <svg className="w-4" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
  <path fill="currentColor" d="M5.5,6.2L0,12.6h9.9l1.1-3h-4.2l2.6-3h0c0,0-1.7-3-1.7-3h7.6l-5.9,16.1h4L20.4.3H2.2l3.4,5.9Z"/>
</svg>
            </div>
            <div>
              <div className="text-lg font-semibold text-white">
                Current Payment Cycle
              </div>
              <div
                className="text-sm"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {fmt(cycle.cycleStart)} → {fmt(cycle.cycleEnd)}
              </div>
            </div>
          </div>
          <div className="lg:text-right">
            <div
              className="text-sm uppercase tracking-[0.06em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Next payout
            </div>
            <div className="text-[14px] font-bold text-white">
              {fmtFull(cycle.nextPayout)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="flex items-start justify-between mb-[6px] gap-4 flex-col lg:flex-row">
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {cycle.daysLeft === 0
                ? "Payout day!"
                : `${plural(cycle.daysLeft, "day")} until next payout`}
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: "#9fe870" }}
            >
              {fmt(cycle.cycleStart)} – {fmtFull(cycle.nextPayout)}
            </span>
          </div>
          <div
            className="h-[4px] rounded-full overflow-hidden"
            style={{ background: "rgba(0,185,255,0.15)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg,#2C511F,#9fe870)",
                width: `${Math.min(100, Math.max(5, ((14 - cycle.daysLeft) / 14) * 100))}%`,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid lg:grid-cols-4 gap-[8px] w-full">
          {[
            {
              label: "Total Pending",
              value: `$${money(totalPending)}`,
              color: "rgba(255,255,255,0.9)",
            },
            {
              label: "On Hold (7d)",
              value: `$${money(totalOnHold)}`,
              color: "var(--color-tm-warning-color03)",
            },
            {
              label: "Ready to Pay",
              value: plural(readyCount, "promoter"),
              color: "#9fe870",
            },
            {
              label: "Ready Amount",
              value: `$${money(readyTotal)}`,
              color: "var(--color-tm-success-color05)",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded px-3 py-4 flex flex-col gap-[2px] "
              style={{ background: "rgba(0,0,0,0.2)" }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.06em]"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {label}
              </span>
              <span className="text-[15px] font-bold" style={{ color }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Pay all ready button */}
        {readyCount > 0 && (
          <div className="flex flex-col gap-[8px] w-full items-end">
            <button
              onClick={handlePayAllReady}
              disabled={bulkLoading}
              className={( !bulkLoading ? "animate-bounce-custom " : "" ) + "w-full py-[13px] px-6 rounded-[10px] text-sm tracking-tight font-bold transition-all disabled:opacity-50 max-w-fit"}
              style={{
                background: bulkLoading
                  ? "none"
                  : "linear-gradient(0deg, rgb(44, 81, 31), rgb(159, 232, 112))",
                    color: bulkLoading
                  ? "var(--color-tm-text-color02)"
                  : "#163400",
            
              }}
            >
              {bulkLoading
                ? "◐ Processing payments…"
                : `Pay All Ready — $${money(readyTotal)} to ${plural(readyCount, "promoter")}`}
            </button>
            {bulkError && (
              <div
                className="text-[12px] px-[12px] py-[8px] rounded-[8px]"
                style={{
                  background: "rgba(255,68,68,0.1)",
                  color: "#ff6b6b",
                  border: "1px solid rgba(255,68,68,0.2)",
                }}
              >
                {bulkError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex gap-[4px] p-[4px] rounded-[10px]"
        style={{ background: "#1a1a1a" }}
      >
        {(["pending", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-[8px] rounded-[7px] text-[13px] font-semibold capitalize transition-all"
            style={{
              background: tab === t ? "#2a2a2a" : "transparent",
              color: tab === t ? "white" : "rgba(255,255,255,0.4)",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {t === "pending"
              ? `Pending (${pendingGroups.length})`
              : `History (${historyGroups.length})`}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading && (
        <div className="flex items-center justify-center py-[60px]">
          <span
            className="text-[14px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Loading commissions…
          </span>
        </div>
      )}
      {!loading &&
        tab === "pending" &&
        (pendingGroups.length === 0 ? (
          <div className="flex flex-col items-center py-[60px] gap-[10px]">
            <span className="text-[36px]">✓</span>
            <span className="text-[15px] font-semibold text-white">
              All caught up!
            </span>
            <span
              className="text-[13px]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              No pending commissions this cycle.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {pendingGroups.map((g) => (
              <PromoterRow key={g.userId} group={g} onPaid={handlePaid} />
            ))}
          </div>
        ))}
      {!loading &&
        tab === "history" &&
        (historyGroups.length === 0 ? (
          <div className="flex flex-col items-center py-[60px] gap-[10px]">
            <span className="text-[36px]">📋</span>
            <span
              className="text-[13px]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              No Wise payouts recorded yet.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {historyGroups.map((g) => (
              <PromoterRow key={g.userId} group={g} onPaid={handlePaid} />
            ))}
          </div>
        ))}
    </div>
  );
};
