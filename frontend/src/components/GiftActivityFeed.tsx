import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chattersApi, type GiftActivityItem } from "../services/api";

interface Props {
  influencerId: string;
}

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EnvelopeIcon = ({ color }: { color: string }) => (
  <svg
    className="w-[14px] h-[14px] shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 7 10-7" />
  </svg>
);

const BOUNCE_STYLE = `
  @keyframes giftDropIn {
    0%   { opacity: 0; transform: translateY(-18px); }
    60%  { opacity: 1; transform: translateY(5px); }
    80%  { transform: translateY(-3px); }
    100% { transform: translateY(0); }
  }
  .gift-panel-enter {
    animation: giftDropIn 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
`;

const ActivityRow = ({
  item,
  expanded,
  onToggleExpand,
  onSend,
  sending,
}: {
  item: GiftActivityItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onSend: () => void;
  sending: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const handleCopy = async () => {
    if (!item.gift_code) return;
    await navigator.clipboard.writeText(item.gift_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGiftClick = () => {
    if (item.gift_status === "sent") {
      if (!expanded) setAnimKey((k) => k + 1);
      onToggleExpand();
    } else {
      onSend();
    }
  };

  const hasEmail = Boolean(item.email?.trim());
  const showPanel = expanded && item.gift_status === "sent" && Boolean(item.gift_code);

  return (
    <>
      <style>{BOUNCE_STYLE}</style>
      <div className="py-4 border-b border-[rgba(255,255,255,0.07)]">

        {/* Name + ID */}
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-white font-bold text-[15px]">{item.name || "User"}</span>
          <span className="text-[rgba(255,255,255,0.3)] text-[12px] font-mono shrink-0">{item.user_id}</span>
        </div>

        {/* Email */}
        <p className="text-[rgba(255,255,255,0.75)] text-[12px] mt-[4px]">
          {item.email || "No email on file"}
        </p>

        {/* Date */}
        <p className="text-[rgba(255,255,255,0.45)] text-[11px] mt-[2px]">{formatDate(item.date)}</p>

        {/* Ref */}
        {item.ref && (
          <p className="text-[rgba(255,255,255,0.45)] text-[11px] mt-[2px]">Ref: {item.ref}</p>
        )}

        {/* Divider + Lifetime — only when there is revenue */}
        {item.lifetime_cents > 0 && (
          <>
            <div className="my-3 border-t border-[rgba(255,255,255,0.07)]" />
            <div className="flex justify-between items-center">
              <span className="text-[rgba(255,255,255,0.7)] text-[13px]">
                Lifetime <span className="text-[#4ade80] font-bold">{formatMoney(item.lifetime_cents)}</span>
              </span>
              <span className="text-[#4ade80] font-bold text-[15px]">{formatMoney(item.last_deposit_cents)}</span>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mt-3">

          {/* Orange Gift — unsent (first deposit only) */}
          {item.is_first_deposit && hasEmail && (item.gift_status === "none" || item.gift_status === "pending") && (
            <button
              type="button"
              onClick={handleGiftClick}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[14px] font-bold text-[#111] disabled:opacity-40"
              style={{ background: "linear-gradient(180deg, #ffb347 0%, #ff8c00 100%)" }}
            >
              🎁 Gift
            </button>
          )}

          {/* Sent state: orange Gift always — dimmed when panel open */}
          {item.gift_status === "sent" && (
            <button
              type="button"
              onClick={handleGiftClick}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[14px] font-bold text-[#111] transition-opacity"
              style={{
                background: "linear-gradient(180deg, #ffb347 0%, #ff8c00 100%)",
                opacity: expanded ? 0.45 : 1,
              }}
            >
              🎁 Gift
            </button>
          )}

          {/* Status labels */}
          {item.gift_status === "accepted" && (
            <span className="inline-flex items-center gap-1.5 text-[#4ade80] text-[13px] font-semibold">
              <EnvelopeIcon color="#4ade80" /> Accepted
            </span>
          )}
          {item.gift_status === "expired" && (
            <span className="inline-flex items-center gap-1.5 text-[#f87171] text-[13px] font-semibold">
              <EnvelopeIcon color="#f87171" /> Expired
            </span>
          )}
          {item.gift_status === "deposit" && (
            <span className="inline-flex items-center gap-1.5 text-[#4ade80] text-[13px] font-semibold">
              ✅ Deposit
            </span>
          )}
          {(item.gift_status as string) === "invited" && (
            <span className="inline-flex items-center gap-1.5 text-[rgba(255,255,255,0.5)] text-[13px] font-semibold">
              <EnvelopeIcon color="rgba(255,255,255,0.5)" /> Invited
            </span>
          )}

          {item.is_first_deposit && (
            <span className="inline-flex items-center gap-1 text-[#fbbf24] text-[13px] font-semibold">
              ⭐ 1st Deposit
            </span>
          )}
        </div>

        {/* Promo code panel — drops in from top */}
        {showPanel && (
          <div key={animKey} className="gift-panel-enter mt-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.05)] flex flex-col gap-3">
            <p className="text-white text-[13px] font-extrabold tracking-wider uppercase">
              Promo Code
            </p>
            <p className="text-[rgba(255,255,255,0.6)] text-[12px]">
              {item.diamonds ?? 120} diamonds. Redeem in Teaseme with this email only
            </p>
            <div className="px-4 py-3 rounded-xl bg-[rgba(0,0,0,0.35)] font-mono text-white text-[18px] tracking-widest text-center">
              {item.gift_code}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full py-3 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.4)] text-white font-bold text-[13px] hover:bg-[rgba(255,255,255,0.06)] transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? "✅ Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const activityRowKey = (item: GiftActivityItem) => `${item.user_id}:${item.influencer_id}`;

export const GiftActivityFeed = ({ influencerId }: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<GiftActivityItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [sendingRowKey, setSendingRowKey] = useState<string | null>(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [showMissingOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await chattersApi.getGiftActivity(
        influencerId,
        debouncedSearch || undefined,
        page,
        showMissingOnly,
      );
      setItems(res.items);
      setPendingCount(res.pending_count);
      setTotalPages(res.total_pages ?? 1);
      if (res.page != null) setPage(res.page);
    } catch {
      setError("Unable to load gift activity");
    } finally {
      setLoading(false);
    }
  }, [influencerId, debouncedSearch, page, showMissingOnly]);

  useEffect(() => { void load(); }, [load]);

  const handleSend = async (userId: string, itemInfluencerId: string) => {
    const rowKey = `${userId}:${itemInfluencerId}`;
    const targetItem = items.find(
      (item) => item.user_id === userId && item.influencer_id === itemInfluencerId,
    );
    const wasPending =
      targetItem?.is_first_deposit &&
      (targetItem.gift_status === "none" || targetItem.gift_status === "pending");
    setSendingRowKey(rowKey);
    try {
      const res = await chattersApi.sendGiftCode(userId, itemInfluencerId);
      if (wasPending) {
        setPendingCount((count) => Math.max(0, count - 1));
      }
      setItems((prev) =>
        prev.map((item) =>
          item.user_id === userId && item.influencer_id === itemInfluencerId
            ? { ...item, gift_status: res.status as GiftActivityItem["gift_status"], gift_code: res.code, diamonds: res.diamonds }
            : item,
        ),
      );
      setExpandedRowKey(rowKey);
    } catch {
      setError("Unable to send gift");
    } finally {
      setSendingRowKey(null);
    }
  };

  const rows = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-tm-primary-color04 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (error) {
      return <p className="text-[rgba(255,255,255,0.5)] text-sm py-6 text-center">{error}</p>;
    }
    if (!items.length) {
      return <p className="text-[rgba(255,255,255,0.4)] text-sm py-6 text-center">No activity yet.</p>;
    }
    return items.map((item) => {
      const rowKey = activityRowKey(item);
      return (
        <ActivityRow
          key={rowKey}
          item={item}
          expanded={expandedRowKey === rowKey}
          onToggleExpand={() => setExpandedRowKey((cur) => (cur === rowKey ? null : rowKey))}
          onSend={() => void handleSend(item.user_id, item.influencer_id)}
          sending={sendingRowKey === rowKey}
        />
      );
    });
  }, [error, expandedRowKey, items, loading, sendingRowKey]);

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const maxVisible = 6;
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    const pageNums: number[] = [];
    for (let i = startPage; i <= endPage; i++) pageNums.push(i);

    const btnBase =
      "w-9 h-9 flex items-center justify-center rounded-xl text-[14px] font-bold transition-colors select-none";

    return (
      <div className="flex items-center justify-center gap-1 pt-2 pb-1">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className={`${btnBase} text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-25 disabled:cursor-not-allowed`}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageNums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPage(n)}
            className={`${btnBase} ${
              n === page
                ? "bg-[rgba(255,140,0,0.25)] text-[#ffb347] border border-[rgba(255,140,0,0.45)]"
                : "text-[rgba(255,255,255,0.55)] hover:text-white hover:bg-[rgba(255,255,255,0.08)]"
            }`}
          >
            {n}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className={`${btnBase} text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-25 disabled:cursor-not-allowed`}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <span className="text-[rgba(255,255,255,0.45)] text-[13px]">Filter by</span>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or Email"
            className="flex-1 min-w-0 buttonXl inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
          />
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowMissingOnly((v) => !v)}
              title={showMissingOnly ? "Show all" : "Show missing only"}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: showMissingOnly
                  ? "rgba(255,140,0,0.2)"
                  : "rgba(255,255,255,0.06)",
                outline: showMissingOnly ? "1.5px solid #ff8c00" : "none",
              }}
            >
              <span className="text-[18px]">🎁</span>
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-[#ff8c00] text-white text-[11px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Activity list */}
      <div className={loading ? "opacity-60 pointer-events-none" : ""}>{rows}</div>

      {/* Pagination */}
      {renderPagination()}
    </div>
  );
};
