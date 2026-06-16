import { useCallback, useEffect, useRef, useState } from "react";
import {
  chattersApi,
  type GiftActivityEvent,
  type GiftActivityItem,
} from "../services/api";

const effectiveGiftStatus = (item: GiftActivityItem): GiftActivityItem["gift_status"] => {
  if (item.gift_status === "sent" && item.expires_at) {
    const expiresAt = new Date(item.expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
      return "expired";
    }
  }
  return item.gift_status;
};

interface Props {
  influencerId: string;
  groupId: string;
}

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ChevronDown = ({ className = "" }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    className={className}
  >
    <path
      d="M4 6l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

const EVENTS_INITIAL = 5;
const EVENTS_MORE = 5;
const FEED_PAGE_SIZE = 5;
const GIFT_POLL_INTERVAL_MS = 10_000;

const EventStatus = ({ event }: { event: GiftActivityEvent }) => {
  switch (event.type) {
    case "deposit":
      return (
        <span className="inline-flex items-center gap-1.5 text-[#4ade80] text-[13px] font-semibold">
          ✅ Deposit
        </span>
      );
    case "first_deposit":
      return (
        <span className="inline-flex items-center gap-1 text-[#fbbf24] text-[13px] font-semibold">
          ⭐ 1st Deposit
        </span>
      );
    case "gift":
      return (
        <span className="inline-flex items-center gap-1.5 text-[#ff8c00] text-[13px] font-semibold">
          🎁 Gifted!
        </span>
      );
    case "accepted":
      return (
        <span className="inline-flex items-center gap-1.5 text-[#4ade80] text-[13px] font-semibold">
          <EnvelopeIcon color="#4ade80" /> Accepted
        </span>
      );
    case "invited":
      return (
        <span className="inline-flex items-center gap-1.5 text-[rgba(255,255,255,0.5)] text-[13px] font-semibold">
          <EnvelopeIcon color="rgba(255,255,255,0.5)" /> Invited
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1.5 text-[#f87171] text-[13px] font-semibold">
          <EnvelopeIcon color="#f87171" /> Expired
        </span>
      );
    default:
      return null;
  }
};

const TimelineRow = ({ event }: { event: GiftActivityEvent }) => {
  const isDepositLike =
    event.type === "deposit" || event.type === "first_deposit";
  const isGift = event.type === "gift";

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-[rgba(255,255,255,0.07)] last:border-b-0">
      <div className="flex flex-col gap-[2px] min-w-0">
        {isDepositLike && event.amount_cents != null && (
          <span className="text-[#4ade80] font-bold text-[15px]">
            {formatMoney(event.amount_cents)}
          </span>
        )}
        {isGift && (
          <span className="text-[#ff8c00] font-bold text-[14px]">
            {event.code ? `Gift - ${event.code}` : "Gift"}
          </span>
        )}
        {event.type === "expired" && event.code && (
          <span className="text-[rgba(255,255,255,0.55)] text-[11px]">
            Code: {event.code}
          </span>
        )}
        <span className="text-[rgba(255,255,255,0.45)] text-[11px]">
          {formatDate(event.date)}
        </span>
        {isDepositLike && event.ref && (
          <span className="text-[rgba(255,255,255,0.45)] text-[11px] truncate">
            Ref: {event.ref}
          </span>
        )}
      </div>
      <EventStatus event={event} />
    </div>
  );
};

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
  const [visibleEventCount, setVisibleEventCount] = useState(EVENTS_INITIAL);

  useEffect(() => {
    if (!expanded) setVisibleEventCount(EVENTS_INITIAL);
  }, [expanded]);

  const handleCopy = async () => {
    if (!item.gift_code) return;
    await navigator.clipboard.writeText(item.gift_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = effectiveGiftStatus(item);
  const hasEmail = Boolean(item.email?.trim());
  const isAccepted = status === "accepted";
  const isSent = status === "sent";
  const needsCreate =
    status === "none" || status === "pending" || status === "expired";
  const showPromoPanel = expanded && !isAccepted && (isSent || needsCreate);
  const hasCode = Boolean(item.gift_code) && isSent;
  const events = item.events ?? [];
  const visibleEvents = events.slice(0, visibleEventCount);
  const hasMoreEvents = visibleEventCount < events.length;

  const openCard = () => {
    if (!expanded) {
      setAnimKey((k) => k + 1);
      onToggleExpand();
    }
  };

  const handleGiftClick = () => {
    openCard();
  };

  const handleToggleExpand = () => {
    if (!expanded) setAnimKey((k) => k + 1);
    onToggleExpand();
  };

  const giftedButton = (onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center h-[26px] px-3 rounded-[90px] text-[14px] font-bold text-[rgba(255,255,255,0.85)]"
      style={{
        background:
          "linear-gradient(180deg, #454547 0%, #2e2e30 55%, #1c1c1e 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.35)",
      }}
    >
      Gifted!
    </button>
  );

  const renderGiftAction = () => {
    if (isAccepted) {
      return giftedButton(handleGiftClick);
    }

    return (
      <button
        type="button"
        onClick={handleGiftClick}
        disabled={sending || !hasEmail}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-[90px] text-[14px] font-bold text-black disabled:opacity-40"
        style={{
          background:
            "linear-gradient(180deg, #f5d058 0%, #e8b84a 50%, #d4972a 100%)",
        }}
      >
        <span aria-hidden>🎁</span>
        <span>Gift</span>
      </button>
    );
  };

  return (
    <>
      <style>{BOUNCE_STYLE}</style>
      <div className="rounded-2xl bg-[#2a2a2c] overflow-hidden">

        {/* Header + Life row */}
        <div className="px-4 pt-4">
          <p className="text-white font-bold text-[15px]">
            {item.email || "No email on file"}
          </p>

          <p className="text-[rgba(255,255,255,0.4)] text-[12px] mt-[2px]">
            Joined: {formatDate(item.joined_at)}
          </p>

          <div className="mt-3 border-t border-[rgba(255,255,255,0.08)]" />

          <div className="flex justify-between items-center py-3">
            <span className="text-white text-[13px]">
              Life{" "}
              <span className="text-[#4ade80] font-bold text-[15px]">
                {formatMoney(item.lifetime_cents)}
              </span>
            </span>
            {renderGiftAction()}
          </div>
        </div>

        {/* Bottom chevron — borderless inset, smaller */}
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={handleToggleExpand}
            aria-label={expanded ? "Collapse" : "Expand"}
            style={{ borderWidth: "0.25px" }}
            className="w-full h-[24px] flex items-center justify-center rounded-md border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.65)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
          >
            <ChevronDown
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="px-4 pb-4 bg-[#2a2a2c] border-t border-[rgba(255,255,255,0.08)]">
            {showPromoPanel && (
              <div
                key={animKey}
                className="gift-panel-enter mt-3 p-4 rounded-2xl bg-[rgba(255,255,255,0.05)] flex flex-col gap-3"
              >
                <p className="text-[#ff8c00] text-[13px] font-extrabold tracking-wider uppercase">
                  Promo Code
                </p>
                <p className="text-[rgba(255,255,255,0.6)] text-[12px]">
                  {item.diamonds ?? 120} diamonds. Redeem in Teaseme with this email only
                </p>
                {hasCode ? (
                  <>
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
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={sending || !hasEmail}
                    className="w-full py-3 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.4)] text-white font-bold text-[13px] hover:bg-[rgba(255,255,255,0.06)] transition-colors disabled:opacity-40"
                  >
                    {sending ? "Creating…" : "Create"}
                  </button>
                )}
              </div>
            )}

            {events.length > 0 && (
              <div className="mt-3">
                {visibleEvents.map((event, idx) => (
                  <TimelineRow key={`${event.type}-${event.date}-${idx}`} event={event} />
                ))}
                {hasMoreEvents && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleEventCount((count) =>
                        Math.min(count + EVENTS_MORE, events.length),
                      )
                    }
                    className="w-full py-3 text-center text-[rgba(255,255,255,0.45)] text-[13px] hover:text-[rgba(255,255,255,0.7)] transition-colors"
                  >
                    Show More...
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

const activityRowKey = (item: GiftActivityItem) => `${item.user_id}:${item.influencer_id}`;

type GiftActivityFilters = {
  influencerId: string;
  groupId: string;
  debouncedSearch: string;
  page: number;
  showMissingOnly: boolean;
};

const filtersMatch = (a: GiftActivityFilters, b: GiftActivityFilters) =>
  a.influencerId === b.influencerId &&
  a.groupId === b.groupId &&
  a.debouncedSearch === b.debouncedSearch &&
  a.page === b.page &&
  a.showMissingOnly === b.showMissingOnly;

export const GiftActivityFeed = ({ influencerId, groupId }: Props) => {
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
  const loadRequestIdRef = useRef(0);
  const filtersRef = useRef<GiftActivityFilters>({
    influencerId,
    groupId,
    debouncedSearch: "",
    page: 1,
    showMissingOnly: false,
  });

  useEffect(() => {
    filtersRef.current = {
      influencerId,
      groupId,
      debouncedSearch,
      page,
      showMissingOnly,
    };
  }, [influencerId, groupId, debouncedSearch, page, showMissingOnly]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => { setPage(1); }, [showMissingOnly]);

  useEffect(() => {
    setExpandedRowKey(null);
  }, [page, debouncedSearch, showMissingOnly]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    const filtersAtStart = { ...filtersRef.current };
    const requestId = silent ? loadRequestIdRef.current : ++loadRequestIdRef.current;

    const isStale = () =>
      silent
        ? !filtersMatch(filtersAtStart, filtersRef.current)
        : requestId !== loadRequestIdRef.current;

    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await chattersApi.getGiftActivity(
        filtersAtStart.influencerId,
        filtersAtStart.groupId,
        filtersAtStart.debouncedSearch || undefined,
        filtersAtStart.page,
        filtersAtStart.showMissingOnly,
        FEED_PAGE_SIZE,
      );
      if (isStale()) return;
      const pageWasClamped =
        res.page != null && res.page !== filtersAtStart.page;
      setPendingCount(res.pending_count);
      setTotalPages(res.total_pages ?? 1);
      // Silent polls must not change the user's page or swap in another page's rows.
      if (silent && pageWasClamped) return;
      setItems(res.items);
      if (!silent && res.page != null) setPage(res.page);
      if (silent) {
        setError((prev) =>
          prev === "Unable to load gift activity" ? null : prev,
        );
      }
    } catch {
      if (isStale()) return;
      if (!silent) {
        setError("Unable to load gift activity");
      }
    } finally {
      if (!silent && requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [influencerId, groupId, debouncedSearch, page, showMissingOnly, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const hasAwaitingRedemption = items.some(
    (item) => effectiveGiftStatus(item) === "sent",
  );

  useEffect(() => {
    if (!hasAwaitingRedemption || document.visibilityState !== "visible") {
      return;
    }

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }, GIFT_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasAwaitingRedemption, load]);

  const handleSend = useCallback(async (target: GiftActivityItem) => {
    const { user_id: userId, influencer_id: itemInfluencerId } = target;
    const rowKey = activityRowKey(target);
    const status = effectiveGiftStatus(target);
    const wasPending =
      target.deposit_count >= 1 &&
      (status === "none" || status === "pending" || status === "expired");
    setError(null);
    setSendingRowKey(rowKey);
    try {
      const res = await chattersApi.sendGiftCode(userId, itemInfluencerId, groupId);
      setItems((prev) =>
        prev.map((item) => {
          if (item.user_id !== userId || item.influencer_id !== itemInfluencerId) {
            return item;
          }
          return {
            ...item,
            gift_status: res.status as GiftActivityItem["gift_status"],
            gift_code: res.code,
            diamonds: res.diamonds,
            expires_at: res.expires_at || null,
          };
        }),
      );
      if (wasPending) {
        setPendingCount((count) => Math.max(0, count - 1));
      }
      void load({ silent: true });
    } catch {
      setError("Unable to send gift");
    } finally {
      setSendingRowKey(null);
    }
  }, [groupId, load]);

  const renderRows = () => {
    if (loading && !items.length) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-tm-primary-color04 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (error && !items.length) {
      return <p className="text-[rgba(255,255,255,0.5)] text-sm py-6 text-center">{error}</p>;
    }
    if (!items.length) {
      return <p className="text-[rgba(255,255,255,0.4)] text-sm py-6 text-center">No activity yet.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const rowKey = activityRowKey(item);
          return (
            <ActivityRow
              key={rowKey}
              item={item}
              expanded={expandedRowKey === rowKey}
              onToggleExpand={() => setExpandedRowKey((cur) => (cur === rowKey ? null : rowKey))}
              onSend={() => void handleSend(item)}
              sending={sendingRowKey === rowKey}
            />
          );
        })}
      </div>
    );
  };

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

      {error && items.length > 0 && (
        <p className="text-[#f87171] text-sm text-center">{error}</p>
      )}
      <div className={loading && items.length > 0 ? "opacity-60 pointer-events-none" : ""}>
        {renderRows()}
      </div>

      {renderPagination()}
    </div>
  );
};
