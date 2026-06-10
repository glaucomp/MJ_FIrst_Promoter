import { useCallback, useEffect, useRef, useState } from "react";
import { elevenLabsApi } from "../services/api";
import { useMediaQuery } from "../hooks/useMediaQuery";
import PhoneTip from '../assets/imagePhoneTip.svg';
import DesktopTip from '../assets/imageDesktopTip.svg';
import {
  applyName,
  DEFAULT_USER_NAME,
  MOOD_CATEGORIES,
} from "../data/moodPhrases";

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5555/api';

interface PreregisterSuccess {
  invite_id: string;
  user_id: number;
  invite_code: string;
  status: VipInviteStatus;
  expires_at?: string;
}

type VipInviteStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "expired";

interface VipInviteStatusResponse {
  invite_id: string;
  status: VipInviteStatus;
  last_event_at: string | null;
  invite_code: string;
  teaseme_user_id: number;
  email?: string | null;
  full_name?: string;
  instagram_username?: string | null;
}

const VIP_POLL_INTERVAL_MS = 10_000;

const POLLING_STATUSES = new Set<VipInviteStatus>(["pending", "in_progress"]);

const statusBadgeLabel = (status: VipInviteStatus): string => {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "expired":
      return "Expired";
    default:
      return status;
  }
};

const statusBadgeClass = (status: VipInviteStatus): string => {
  switch (status) {
    case "pending":
      return "bg-[rgba(255,170,50,0.12)] border-[rgba(255,170,50,0.35)] text-[#ffcf80]";
    case "in_progress":
      return "bg-[rgba(100,149,237,0.12)] border-[rgba(100,149,237,0.35)] text-[#9ec5ff]";
    case "completed":
      return "bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.35)] text-tm-success-color05";
    case "expired":
      return "bg-[rgba(255,15,95,0.08)] border-[rgba(255,15,95,0.35)] text-tm-primary-color01";
    default:
      return "bg-[#141414] border-[rgba(255,255,255,0.1)] text-tm-text-color08";
  }
};

const callPreregister = async (payload: {
  influencer_id: string;
  instagram_username: string;
  full_name: string;
  group_id: string;
}): Promise<PreregisterSuccess> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chatters/preregister-vip`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the preregistration service. Check your connection and try again.");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const pickMessage = (raw: unknown): string => {
      if (!raw || typeof raw !== "object") return "";
      const record = raw as Record<string, unknown>;
      for (const key of ["error", "message", "detail"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value;
      }
      return "";
    };
    const serverMessage = pickMessage(body);
    switch (response.status) {
      case 401:
        throw new Error(serverMessage || "Session expired. Please log in again.");
      case 403:
        throw new Error(serverMessage || "You are not allowed to preregister users.");
      case 404:
        throw new Error(serverMessage || "Influencer not found.");
      case 409:
        throw new Error(serverMessage || "This user is already registered.");
      case 422:
        throw new Error(serverMessage || "Some fields are invalid. Please review and try again.");
      default:
        throw new Error(serverMessage || `Preregistration failed (HTTP ${response.status}).`);
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("invite_code" in (body as Record<string, unknown>)) ||
    typeof (body as Record<string, unknown>).invite_code !== "string" ||
    !("invite_id" in (body as Record<string, unknown>)) ||
    typeof (body as Record<string, unknown>).invite_id !== "string"
  ) {
    throw new Error("Unexpected response from the preregistration service.");
  }

  return body as PreregisterSuccess;
};

const fetchVipInviteStatus = async (
  inviteId: string,
): Promise<VipInviteStatusResponse> => {
  const response = await fetch(
    `${API_URL}/chatters/vip-invites/${encodeURIComponent(inviteId)}/status`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : `Status check failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).status !== "string"
  ) {
    throw new Error("Unexpected response from status service.");
  }

  return body as VipInviteStatusResponse;
};

const sendVipInviteVerificationEmail = async (
  inviteId: string,
): Promise<{ message: string; email: string }> => {
  const response = await fetch(
    `${API_URL}/chatters/vip-invites/${encodeURIComponent(inviteId)}/send-email`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : `Failed to send email (HTTP ${response.status})`;
    throw new Error(message);
  }

  const record = body as Record<string, unknown>;
  return {
    message:
      typeof record.message === "string"
        ? record.message
        : "Verification email sent",
    email: typeof record.email === "string" ? record.email : "",
  };
};

interface VipInviteListItem {
  invite_id: string;
  status: VipInviteStatus;
  last_event_at: string | null;
  invite_code: string;
  teaseme_user_id: number;
  expires_at: string | null;
  full_name: string;
  email: string | null;
  influencer_id: string;
  instagram_username: string | null;
  telegram_id: string | null;
  created_at: string;
}

const INSTAGRAM_USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;

const normalizeInstagramUsername = (raw: string): string =>
  raw.trim().replace(/^@+/, "").toLowerCase();

const formatInviteContact = (invite: VipInviteListItem): string => {
  if (invite.instagram_username) {
    return `@${invite.instagram_username}`;
  }
  if (invite.telegram_id) {
    return `TG ${invite.telegram_id}`;
  }
  return "";
};

const fetchVipInvites = async (
  groupId: string,
  search?: string,
): Promise<VipInviteListItem[]> => {
  const params = new URLSearchParams({ groupId });
  const trimmed = search?.trim();
  if (trimmed) params.set("search", trimmed);

  const response = await fetch(
    `${API_URL}/chatters/vip-invites?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : `Failed to load invites (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as Record<string, unknown>).invites)
  ) {
    throw new Error("Unexpected response from invite list.");
  }

  return (body as { invites: VipInviteListItem[] }).invites;
};

const formatInviteDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// ── Promo Code ─────────────────────────────────────────────────────────────────

interface PromoCodeSuccess {
  ok: true;
  code: string;
  email: string;
  reward_credits: number;
  reward_cents: number;
  influencer_id: string | null;
  max_redemptions: number;
  expires_at: string | null;
}

const callCreatePromoCode = async (payload: {
  email: string;
  influencer_id: string;
  code?: string;
  reward_credits?: number;
  max_redemptions?: number;
  expires_at?: string;
}): Promise<PromoCodeSuccess> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chatters/promo-codes`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the promo code service. Check your connection and try again.");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const pickMessage = (raw: unknown): string => {
      if (!raw || typeof raw !== "object") return "";
      const record = raw as Record<string, unknown>;
      for (const key of ["error", "message", "detail"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value;
      }
      return "";
    };
    const serverMessage = pickMessage(body);
    switch (response.status) {
      case 401:
        throw new Error(serverMessage || "Session expired. Please log in again.");
      case 403:
        throw new Error(serverMessage || "You are not allowed to create promo codes.");
      case 404:
        throw new Error(serverMessage || "Influencer not found.");
      case 409:
        throw new Error(serverMessage || "This promo code already exists. Try generating again.");
      case 422:
        throw new Error(serverMessage || "Some fields are invalid. Please review and try again.");
      default:
        throw new Error(serverMessage || `Promo code creation failed (HTTP ${response.status}).`);
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("code" in (body as Record<string, unknown>)) ||
    typeof (body as Record<string, unknown>).code !== "string"
  ) {
    throw new Error("Unexpected response from the promo code service.");
  }

  return body as PromoCodeSuccess;
};

interface PromoCodeGeneratorProps {
  influencerId: string;
  email?: string;
  onEmailChange?: (email: string) => void;
}

export const PromoCodeGenerator = ({
  influencerId,
  email: controlledEmail,
  onEmailChange,
}: PromoCodeGeneratorProps) => {
  const [internalEmail, setInternalEmail] = useState("");
  const email = controlledEmail ?? internalEmail;
  const setEmail = onEmailChange ?? setInternalEmail;
  const [customCode, setCustomCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [rewardCredits, setRewardCredits] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (loading) return;

    const trimmedEmail = email.trim();
    const trimmedCode = customCode.trim().toUpperCase();

    if (!trimmedEmail) {
      setErrorMessage("Please enter the user's TeaseMe email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (trimmedCode && (trimmedCode.length < 1 || trimmedCode.length > 64)) {
      setErrorMessage("Custom code must be 1–64 characters.");
      return;
    }

    setErrorMessage(null);
    setLoading(true);
    try {
      const result = await callCreatePromoCode({
        email: trimmedEmail,
        influencer_id: influencerId,
        ...(trimmedCode ? { code: trimmedCode } : {}),
      });
      setGeneratedCode(result.code);
      setRewardCredits(result.reward_credits);
      setCopied(false);
    } catch (err) {
      setGeneratedCode("");
      setRewardCredits(null);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setEmail("");
    setCustomCode("");
    setGeneratedCode("");
    setRewardCredits(null);
    setCopied(false);
    setErrorMessage(null);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  };

  const canGenerate = !!email.trim() && !loading;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[8px]">
        <svg
          className="w-[14px] h-[14px] text-tm-primary-color04"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <p className="text-xs font-bold uppercase text-tm-text-color08">
          Promo Code
        </p>
      </div>

      <p className="text-[#555] text-sm leading-relaxed">
        Creates a single-use code tied to the user&apos;s TeaseMe email. Standard reward:{" "}
        <span className="text-tm-text-color08">120 diamonds ($2)</span>.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="User's TeaseMe email"
            className="buttonXl inputIcon w-full inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
          />
        </div>
        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="Custom code (optional)"
          maxLength={64}
          className="buttonXl inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08 uppercase"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <button
          onClick={handleReset}
          title="Reset form"
          aria-label="Reset form"
          className="lg:w-[56px] buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)] text-[#555] hover:text-tm-text-color08 hover:border-[rgba(255,255,255,0.2)] transition-all shrink-0"
        >
          <svg
            className="w-[15px] h-[15px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="buttonSubtle btn-primary-cta rounded-full px-[20px] py-[11px] text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          {loading ? "Generating..." : "Generate Code"}
        </button>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 border border-[rgba(255,15,95,0.35)] bg-[rgba(255,15,95,0.08)] text-tm-primary-color01 text-xs px-4 py-3 rounded-sm">
          <svg
            className="w-[14px] h-[14px] mt-[2px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M4.062 19h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L2.33 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {generatedCode && (
        <div className="flex flex-col gap-4 border border-neutral-800 p-8 rounded-xl bg-tm-neutral-color08 min-w-0 w-full overflow-hidden">
          <div className="flex flex-row w-full">
            <p className="text-xs font-bold uppercase text-tm-text-color08">
              Promo Code
            </p>
          </div>
          {rewardCredits != null && (
            <p className="text-sm text-tm-text-color08">
              {rewardCredits} diamonds — redeem in the TeaseMe app with this email only.
            </p>
          )}
          <div className="flex flex-col lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] lg:grid gap-2 min-w-0 w-full">
            <div className="flex items-center gap-2 inputMJ p-4 w-full min-w-0 overflow-hidden">
              <svg
                className="w-[14px] h-[14px] text-[#555] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <p className="flex-1 min-w-0 text-white text-lg font-bold tracking-widest truncate font-mono">
                {generatedCode}
              </p>
            </div>
            <button
              onClick={handleCopy}
              aria-label={copied ? "Copied promo code" : "Copy promo code"}
              className={`flex buttonSubtle buttonLg items-center justify-center px-10 flex-row-reverse transition-all [background:linear-gradient(250deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] hover:[background:linear-gradient(290deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] ${copied ? "text-tm-success-color05" : "text-white"}`}
            >
              <p className="text-sm font-medium">
                {copied ? "Copied!" : "Copy"}
              </p>
              {copied ? (
                <svg
                  className="w-[16px] h-[16px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-[16px] h-[16px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Link Generator ─────────────────────────────────────────────────────────────

interface LinkGeneratorProps {
  username: string;
  groupId: string;
  name?: string;
  onNameChange?: (name: string) => void;
}

export const LinkGenerator = ({
  username,
  groupId,
  name: controlledName,
  onNameChange,
}: LinkGeneratorProps) => {
  const [internalName, setInternalName] = useState("");
  const name = controlledName ?? internalName;
  const setName = onNameChange ?? setInternalName;
  const [instagramUsername, setInstagramUsername] = useState("");
  const [selectedInviteEmail, setSelectedInviteEmail] = useState<string | null>(
    null,
  );
  const [generatedInviteCode, setGeneratedInviteCode] = useState("");
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<VipInviteStatus | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [sendEmailLoading, setSendEmailLoading] = useState(false);
  const [sendEmailSuccess, setSendEmailSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trackSearch, setTrackSearch] = useState("");
  const [trackedInvites, setTrackedInvites] = useState<VipInviteListItem[]>(
    [],
  );
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadTrackedInvites = useCallback(async (search?: string) => {
    setTrackLoading(true);
    setTrackError(null);
    try {
      const invites = await fetchVipInvites(groupId, search);
      setTrackedInvites(invites);
    } catch (err) {
      setTrackedInvites([]);
      setTrackError(
        err instanceof Error ? err.message : "Could not load invites.",
      );
    } finally {
      setTrackLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (trackSearchDebounceRef.current) {
      clearTimeout(trackSearchDebounceRef.current);
    }
    const delay = trackSearch.trim() ? 300 : 0;
    trackSearchDebounceRef.current = setTimeout(() => {
      void loadTrackedInvites(trackSearch);
    }, delay);
    return () => {
      if (trackSearchDebounceRef.current) {
        clearTimeout(trackSearchDebounceRef.current);
      }
    };
  }, [trackSearch, loadTrackedInvites]);

  // Refresh the tracked list while any invite is still redeemable.
  useEffect(() => {
    const hasActive = trackedInvites.some((inv) =>
      POLLING_STATUSES.has(inv.status),
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      void loadTrackedInvites(trackSearch);
    }, VIP_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [trackedInvites, trackSearch, loadTrackedInvites]);

  useEffect(() => {
    if (!inviteId || !inviteStatus || !POLLING_STATUSES.has(inviteStatus)) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const result = await fetchVipInviteStatus(inviteId);
        setInviteStatus(result.status);
        setGeneratedInviteCode(result.invite_code);
        if (result.email) {
          setSelectedInviteEmail(result.email);
        }
        setTrackedInvites((prev) =>
          prev.map((inv) =>
            inv.invite_id === inviteId
              ? {
                  ...inv,
                  status: result.status,
                  invite_code: result.invite_code,
                  last_event_at: result.last_event_at,
                  ...(result.email !== undefined ? { email: result.email } : {}),
                  ...(result.full_name ? { full_name: result.full_name } : {}),
                  ...(result.instagram_username !== undefined
                    ? { instagram_username: result.instagram_username }
                    : {}),
                }
              : inv,
          ),
        );
      } catch {
        // Keep last-known state on transient poll failures.
      }
    };

    void poll();
    pollTimerRef.current = setInterval(() => {
      void poll();
    }, VIP_POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [inviteId, inviteStatus]);

  const handleGenerate = async () => {
    if (loading) return;

    const trimmedName = name.trim();
    const trimmedInstagram = normalizeInstagramUsername(instagramUsername);

    if (!trimmedName || !trimmedInstagram) {
      setErrorMessage("Please fill in name and Instagram username.");
      return;
    }
    if (!INSTAGRAM_USERNAME_PATTERN.test(trimmedInstagram)) {
      setErrorMessage(
        "Instagram username must be 1–30 characters (letters, numbers, dots, underscores).",
      );
      return;
    }

    setErrorMessage(null);
    setLoading(true);
    try {
      const result = await callPreregister({
        influencer_id: username,
        instagram_username: trimmedInstagram,
        full_name: trimmedName,
        group_id: groupId,
      });
      setGeneratedInviteCode(result.invite_code);
      setInviteId(result.invite_id);
      setInviteStatus(result.status);
      setSelectedInviteEmail(null);
      setCopied(false);
      setSendEmailSuccess(null);
      void loadTrackedInvites(trackSearch);
    } catch (err) {
      setGeneratedInviteCode("");
      setInviteId(null);
      setInviteStatus(null);
      setSelectedInviteEmail(null);
      setSendEmailSuccess(null);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName("");
    setInstagramUsername("");
    setSelectedInviteEmail(null);
    setGeneratedInviteCode("");
    setInviteId(null);
    setInviteStatus(null);
    setCopied(false);
    setSendEmailSuccess(null);
    setErrorMessage(null);
  };

  const handleSelectTrackedInvite = (invite: VipInviteListItem) => {
    setName(invite.full_name);
    setInstagramUsername(invite.instagram_username ?? "");
    setSelectedInviteEmail(invite.email);
    setGeneratedInviteCode(invite.invite_code);
    setInviteId(invite.invite_id);
    setInviteStatus(invite.status);
    setCopied(false);
    setSendEmailSuccess(null);
    setErrorMessage(null);
  };

  const handleSendEmail = async () => {
    if (sendEmailLoading || !inviteId) return;

    // Note: /vip-invites/:inviteId/send-email uses the email stored on the invite record (server-side).
    // Don’t block on the current input value here; let the server return 422 when the invite has no email on file.

    setErrorMessage(null);
    setSendEmailSuccess(null);
    setSendEmailLoading(true);
    try {
      const result = await sendVipInviteVerificationEmail(inviteId);
      setSendEmailSuccess(
        result.message || `Verification email sent to ${result.email}.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not send verification email.",
      );
    } finally {
      setSendEmailLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedInviteCode);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  };

  const canGenerate =
    !!(name.trim() && instagramUsername.trim()) && !loading;
  const canSendEmail =
    !!inviteId && !!selectedInviteEmail?.trim() && !sendEmailLoading && !loading;

  return (
    <div className="flex flex-col gap-[16px] ">
      {/* Section header */}
      <div className="flex items-center gap-[8px]">
        <svg
          className="w-[14px] h-[14px] text-tm-primary-color04 "
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p className="text-xs font-bold uppercase text-tm-text-color08">
          Invite Link
        </p>
      </div>

      {/* Track invites */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={trackSearch}
            onChange={(e) => setTrackSearch(e.target.value)}
            placeholder="Search by name, Instagram username, or invite code…"
            aria-label="Search VIP invites"
            className="buttonXl inputIcon w-full inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadTrackedInvites(trackSearch)}
          disabled={trackLoading}
          title="Refresh invite list"
          aria-label="Refresh invite list"
          className="lg:w-[56px] buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)] text-[#555] hover:text-tm-text-color08 hover:border-[rgba(255,255,255,0.2)] transition-all shrink-0 disabled:opacity-40"
        >
          <svg
            className={`w-[15px] h-[15px] ${trackLoading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-2 border border-[rgba(255,255,255,0.08)] rounded-xl bg-[#141414] p-4 max-h-[220px] overflow-y-auto">
          <p className="text-xs font-bold uppercase text-tm-text-color08">
            Tracked invites
          </p>
          {trackLoading && (
            <p className="text-sm text-tm-text-color08">Loading…</p>
          )}
          {trackError && !trackLoading && (
            <p className="text-sm text-tm-primary-color01">{trackError}</p>
          )}
          {!trackLoading && !trackError && trackedInvites.length === 0 && (
            <p className="text-sm text-tm-text-color08">
              {trackSearch.trim()
                ? "No invites match your search."
                : "No invites yet for this group."}
            </p>
          )}
          {!trackLoading &&
            !trackError &&
            trackedInvites.map((invite) => (
                <button
                  key={invite.invite_id}
                  type="button"
                  onClick={() => handleSelectTrackedInvite(invite)}
                  className="w-full text-left rounded-lg border border-[rgba(255,255,255,0.08)] px-3 py-2.5 transition-colors hover:border-[rgba(255,255,255,0.18)] outline-none focus:outline-none active:border-[rgba(255,255,255,0.08)] active:bg-transparent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {invite.full_name}
                      </p>
                      <p className="text-xs text-tm-text-color08 truncate">
                        {formatInviteContact(invite)}
                        {invite.email ? ` · ${invite.email}` : ""}
                      </p>
                      <p className="text-xs text-[#555] truncate">
                        Code {invite.invite_code} · {formatInviteDate(invite.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusBadgeClass(invite.status)}`}
                    >
                      {statusBadgeLabel(invite.status)}
                    </span>
                  </div>
                </button>
            ))}
      </div>

      {/* Name + Instagram username row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="buttonXl inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
        />
        <div className="relative">
          <span className="absolute left-[12px] top-1/2 -translate-y-1/2 text-sm text-[#555]">
            @
          </span>
          <input
            type="text"
            value={instagramUsername}
            onChange={(e) => setInstagramUsername(e.target.value.replace(/^@+/, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="Instagram username"
            className="buttonXl inputIcon w-full inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
          />
        </div>
      </div>

      {/* Reset + Generate row */}
      <div className="flex flex-col lg:flex-row gap-4 lg:justify-end">
        <button
          onClick={handleReset}
          title="Reset form"
          aria-label="Reset form"
          className="lg:w-[56px] buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)]  text-[#555] hover:text-tm-text-color08 hover:border-[rgba(255,255,255,0.2)] transition-all shrink-0"
        >
          <svg
            className="w-[15px] h-[15px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="buttonSubtle btn-primary-cta rounded-full px-[20px] py-[11px] text-sm font-bold  active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          {loading ? "Generating..." : "Generate Code"}
        </button>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-start gap-2 border border-[rgba(255,15,95,0.35)] bg-[rgba(255,15,95,0.08)] text-tm-primary-color01 text-xs px-4 py-3 rounded-sm">
          <svg
            className="w-[14px] h-[14px] mt-[2px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M4.062 19h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L2.33 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Generated invite code */}
      {generatedInviteCode && (
        <div className="flex flex-col gap-4 border border-neutral-800 p-8 rounded-xl bg-tm-neutral-color08 min-w-0 w-full overflow-hidden">
          <div className="flex flex-row w-full items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase text-tm-text-color08">
              Invite Code
            </p>
            {inviteStatus && (
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(inviteStatus)}`}
              >
                {statusBadgeLabel(inviteStatus)}
              </span>
            )}
          </div>
          <p className="text-xs text-[#555] leading-relaxed">
            Share this code with @{normalizeInstagramUsername(instagramUsername) || "the invitee"}
            {selectedInviteEmail
              ? ", or send the personal invite email to the address on file."
              : " via Instagram DM."}
          </p>
          <div className="flex flex-col gap-2 min-w-0 w-full">
            <div className="flex items-center gap-2 inputMJ p-4 w-full min-w-0 overflow-hidden">
              <svg
                className="w-[14px] h-[14px] text-[#555] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
              <p className="flex-1 min-w-0 text-tm-text-color08 text-sm truncate font-mono tracking-wide">
                {generatedInviteCode}
              </p>
            </div>
            <div
              className={`grid gap-2 ${selectedInviteEmail ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
            >
              <button
                type="button"
                onClick={handleCopy}
                aria-label={
                  copied ? "Copied invite code" : "Copy invite code"
                }
                className={`flex buttonSubtle buttonLg items-center justify-center gap-2 px-6 transition-all [background:linear-gradient(250deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] hover:[background:linear-gradient(290deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] ${copied ? "text-tm-success-color05" : "text-white"}`}
              >
                {copied ? (
                  <svg
                    className="w-[16px] h-[16px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-[16px] h-[16px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
                <span className="text-sm font-medium">
                  {copied ? "Copied!" : "Copy code"}
                </span>
              </button>
              {selectedInviteEmail && (
              <button
                type="button"
                onClick={() => void handleSendEmail()}
                disabled={!canSendEmail}
                aria-label="Send TeaseMe verification email"
                className="flex buttonSubtle buttonLg items-center justify-center gap-2 px-6 border border-[rgba(255,15,95,0.35)] bg-[rgba(255,15,95,0.12)] text-white hover:bg-[rgba(255,15,95,0.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-[16px] h-[16px] shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm font-medium">
                  {sendEmailLoading ? "Sending…" : "Send email"}
                </span>
              </button>
              )}
            </div>
          </div>
          {sendEmailSuccess && (
            <div className="flex items-start gap-2 border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-tm-success-color05 text-xs px-4 py-3 rounded-sm">
              <span>{sendEmailSuccess}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Language options ───────────────────────────────────────────────────────────

const LANGUAGES: { code: string; flag: string; label: string }[] = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Spanish" },
  { code: "pt", flag: "🇧🇷", label: "Portuguese" },
  { code: "fr", flag: "🇫🇷", label: "French" },
  { code: "it", flag: "🇮🇹", label: "Italian" },
  { code: "de", flag: "🇩🇪", label: "German" },
  { code: "pl", flag: "🇵🇱", label: "Polish" },
  { code: "ru", flag: "🇷🇺", label: "Russian" },
  { code: "ar", flag: "🇸🇦", label: "Arabic" },
  { code: "hi", flag: "🇮🇳", label: "Hindi" },
  { code: "ja", flag: "🇯🇵", label: "Japanese" },
  { code: "ko", flag: "🇰🇷", label: "Korean" },
  { code: "zh", flag: "🇨🇳", label: "Chinese" },
  { code: "tr", flag: "🇹🇷", label: "Turkish" },
  { code: "nl", flag: "🇳🇱", label: "Dutch" },
];

// ── Phrase preview ─────────────────────────────────────────────────────────────

const NAME_PLACEHOLDER = "{user name}";

const PhrasePreview = ({
  phrase,
  userName,
}: {
  phrase: string;
  userName: string;
}) => {
  const displayName = userName.trim() || DEFAULT_USER_NAME;
  const parts = phrase.split(NAME_PLACEHOLDER);

  if (parts.length === 1) {
    return (
      <span className="text-tm-text-color09 text-base leading-relaxed">
        {phrase}
      </span>
    );
  }

  return (
    <span className="text-tm-text-color09 text-base leading-relaxed ">
      {parts.map((part, i) => (
        <span key={`${i}-${part.slice(0, 12)}`}>
          {part}
          {i < parts.length - 1 && (
            <span className="inline-flex mx-1 px-1.5 py-0.5 rounded bg-tm-primary-color12 border border-tm-primary-color10/75 text-tm-primary-color05 text-sm ">
              {displayName}
            </span>
          )}
        </span>
      ))}
    </span>
  );
};

const ConnectorArrow = ({
  panelRef,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const handleClick = () => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative flex items-center justify-center py-1 lg:py-0 lg:self-center">
      <div
        className="absolute inset-x-0 top-1/2 h-px bg-[rgba(255,255,255,0.07)] lg:hidden"
        aria-hidden
      />
      <button
        type="button"
        onClick={handleClick}
        className="relative z-10 w-10 h-10 rounded-full border border-[rgba(255,255,255,0.12)] bg-[#1a1a1c] flex items-center justify-center shrink-0 cursor-pointer lg:cursor-default lg:pointer-events-none transition-colors hover:border-[rgba(255,255,255,0.25)] active:scale-95 lg:active:scale-100"
        aria-label="Scroll to compose panel"
      >
        <svg
          className="w-4 h-4 text-[#888] rotate-90 lg:rotate-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
};

// ── Voice Message ──────────────────────────────────────────────────────────────

const PANEL_ANIM_MS = 320;
const SHOW_RECORD_VOICE = false;

interface VoiceMessageProps {
  modelName?: string;
  voiceId?: string;
  userName?: string;
  onUserNameChange?: (name: string) => void;
}

export const VoiceMessage = ({
  modelName,
  voiceId,
  userName: controlledUserName,
  onUserNameChange,
}: VoiceMessageProps) => {
  const [text, setText] = useState("");
  const [selectedPhrase, setSelectedPhrase] = useState("");
  const [internalUserName, setInternalUserName] = useState("");
  const userName = controlledUserName ?? internalUserName;
  const setUserName = onUserNameChange ?? setInternalUserName;
  const [selectedCategory, setSelectedCategory] = useState("");
  const [displayedCategoryKey, setDisplayedCategoryKey] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [showLanguagePanel, setShowLanguagePanel] = useState(false);
  const labelClickCountRef = useRef(0);
  const labelClickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleLabelClick = () => {
    if (labelClickResetRef.current) clearTimeout(labelClickResetRef.current);
    labelClickCountRef.current += 1;
    if (labelClickCountRef.current >= 10) {
      labelClickCountRef.current = 0;
      setShowLanguagePanel((v) => !v);
      return;
    }
    labelClickResetRef.current = setTimeout(() => {
      labelClickCountRef.current = 0;
    }, 3000);
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const prevAudioUrlRef = useRef("");
  const autoPlayAfterGenerateRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const composeScrollRef = useRef<HTMLDivElement | null>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isMobile = !useMediaQuery('(min-width: 1024px)');

  const displayedCategory = MOOD_CATEGORIES.find(
    (c) => c.key === displayedCategoryKey,
  );

  const handleCategorySelect = (key: string, index: number) => {
    if (panelCloseTimerRef.current) {
      clearTimeout(panelCloseTimerRef.current);
      panelCloseTimerRef.current = null;
    }

    if (selectedCategory === key) {
      setContentVisible(false);
      setSelectedCategory("");
      setIsPanelOpen(false);
      panelCloseTimerRef.current = window.setTimeout(() => {
        setDisplayedCategoryKey("");
        panelCloseTimerRef.current = null;
      }, PANEL_ANIM_MS);
    } else {
      setSelectedCategory(key);
      setDisplayedCategoryKey(key);
      setContentVisible(false);
      setIsPanelOpen(true);
    }

    categoryButtonRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  useEffect(() => {
    if (!displayedCategoryKey || !isPanelOpen) {
      setContentVisible(false);
      return;
    }

    setContentVisible(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setContentVisible(true);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [displayedCategoryKey, isPanelOpen]);

  const handlePhraseSelect = (phrase: string) => {
    setSelectedPhrase(phrase);
    setError("");
    if (isMobile) {
      composeTextareaRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          rightPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          if (composeScrollRef.current) {
            composeScrollRef.current.scrollTop = composeScrollRef.current.scrollHeight;
          }
        });
      });
    }
  };

  const clearSelectedPhrase = () => {
    setSelectedPhrase("");
    if (isMobile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          leftPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
  };

  const getComposeText = () => {
    const parts = [
      selectedPhrase ? applyName(selectedPhrase, userName) : "",
      text.trim(),
    ].filter(Boolean);
    return parts.join(" ");
  };

  useEffect(() => {
    return () => {
      if (labelClickResetRef.current) clearTimeout(labelClickResetRef.current);
      if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
      if (prevAudioUrlRef.current) URL.revokeObjectURL(prevAudioUrlRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            /* ignore teardown errors */
          }
        }
        recorder.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    setRecordingSeconds(0);
    timerRef.current = setInterval(
      () => setRecordingSeconds((s) => s + 1),
      1000,
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone access and try again.",
      );
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.onstop = async () => {
      const rawMimeType = mr.mimeType || "audio/webm";
      const mimeType = rawMimeType.split(";")[0].trim() || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      mr.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      setIsTranscribing(true);
      setError("");
      try {
        const result = await elevenLabsApi.transcribe(blob);
        setText((prev) => {
          const trimmed = prev.trimEnd();
          return trimmed ? `${trimmed} ${result.text}` : result.text;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    };
    mr.stop();
  };

  const handleGenerate = async () => {
    const composeText = getComposeText();
    if (!composeText.trim()) return;
    if (!voiceId?.trim()) {
      setError(
        "No voice is configured for this model yet. Please ask an admin to sync the model from TeaseMe.",
      );
      return;
    }
    setIsGenerating(true);
    setError("");
    setAudioUrl("");
    setIsPlaying(false);
    if (prevAudioUrlRef.current) {
      URL.revokeObjectURL(prevAudioUrlRef.current);
      prevAudioUrlRef.current = "";
    }
    try {
      const blob = await elevenLabsApi.textToSpeech(
        composeText,
        voiceId,
        selectedCategory || undefined,
        undefined,
        selectedLanguage,
      );
      const url = URL.createObjectURL(blob);
      prevAudioUrlRef.current = url;
      autoPlayAfterGenerateRef.current = true;
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate audio");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlaySound = useCallback(() => {
    if (countdown !== null) return;
    setCountdown(3);
    let count = 3;
    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCountdown(null);
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          void audioRef.current.play();
        }
      } else {
        setCountdown(count);
      }
    }, 500);
  }, [countdown]);

  useEffect(() => {
    if (!audioUrl || !autoPlayAfterGenerateRef.current) return;
    autoPlayAfterGenerateRef.current = false;
    handlePlaySound();
  }, [audioUrl, handlePlaySound]);

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const busy = isGenerating || isRecording || isTranscribing;
  const displayName = modelName ?? "The Model";
  const hasVoice = !!voiceId && voiceId.trim().length > 0;
  const composeText = getComposeText();

  return (
    <div className="flex flex-col gap-5  ">
      {/* Section header */}
      <div className="flex items-center gap-2 ">
        <svg
          className="w-3.5 h-3.5 text-tm-text-color08"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <button
          type="button"
          className="text-base font-semibold text-white select-none cursor-pointer bg-transparent border-0 p-0 text-left"
          onClick={handleLabelClick}
        >
          Talk Like {displayName}
        </button>
      </div>

      {/* Missing voice warning */}
      {!hasVoice && (
        <div className="flex items-start gap-4 bg-[#2a1a0f] border border-[rgba(255,170,50,0.25)] rounded-[10px] px-[14px] py-[12px]">
          <svg
            className="w-[16px] h-[16px] text-[#ffaa33] shrink-0 mt-[2px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <p className="text-[#ffcf80] text-sm leading-normal">
            <span className="font-semibold text-white">
              No voice configured for {displayName}.
            </span>{" "}
            Ask an admin to sync this model from TeaseMe — until then, Generate
            is disabled.
          </p>
        </div>
      )}

      {/* Mobile: stacked | Desktop: left panel — arrow — right panel */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_56px_1fr] lg:items-stretch gap-4 tools-desktop-layout ">
        {/* Left panel: name, purpose, phrases */}
        <div ref={leftPanelRef} className="tools-panel tools-panel-left flex flex-col gap-4 min-w-0 lg:rounded-2xl lg:border lg:border-[rgba(255,255,255,0.08)] lg:bg-[#141414] lg:p-5">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="user-name"
              className="text-base text-tm-text-color08 font-medium"
            >
              User&apos;s Name
            </label>
            <input
              id="user-name"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder={DEFAULT_USER_NAME}
              className="buttonXl inputMJ text-white focus:outline-none focus:border-tm-primary-color04 placeholder-tm-text-color08"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-base text-tm-text-color08 font-medium">Purpose</p>
            <div className="flex flex-nowrap gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 py-2 bg-neutral-900 rounded-2xl">
              {MOOD_CATEGORIES.map((cat, index) => (
                <button
                  key={cat.key}
                  ref={(el) => {
                    categoryButtonRefs.current[index] = el;
                  }}
                  type="button"
                  onClick={() => handleCategorySelect(cat.key, index)}
                  className={`buttonSubtle buttonLg flex items-center justify-center gap-2 rounded-full text-sm snap-start shrink-0 min-w-30 transition-[background-color,border-color,color,transform,box-shadow] duration-300 ease-out active:scale-95 ${
                    selectedCategory === cat.key
                      ? "bg-tm-primary-color11 border border-tm-primary-color09 text-white scale-[1.02] shadow-[0_0_14px_rgba(255,15,95,0.18)]"
                      : "bg-tm-neutral-color05 hover:bg-tm-neutral-color03  border-t-2 border-neutral-600/75 text-tm-text-color08 hover:border-neutral-500 scale-100 "
                  }`}
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              {MOOD_CATEGORIES.map((cat, index) => (
                <button
                  key={cat.key}
                  type="button"
                  aria-label={`Go to ${cat.label}`}
                  onClick={() => handleCategorySelect(cat.key, index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ease-out  ${
                    selectedCategory === cat.key
                      ? "w-4 bg-tm-primary-color04"
                      : "w-1.5 bg-[rgba(255,255,255,0.2)]"
                  }`}
                />
              ))}
            </div>
          </div>

          {(displayedCategoryKey || isPanelOpen) && (
            <div
              className={`mood-phrases-panel ${isPanelOpen ? "is-open" : ""}`}
            >
              {displayedCategory && (
                <div
                  key={displayedCategory.key}
                  className={`mood-phrases-content bg-neutral-900 px-3 pb-12 pt-4 rounded-2xl border border-neutral-700 flex flex-col gap-4 max-h-[180px] lg:max-h-[200px] overflow-y-auto no-scrollbar compose-scroll-fade ${
                    contentVisible ? "is-visible" : ""
                  }`}
                >
                  {displayedCategory.phrases.map((phrase, index) => {
                    const isSelected = selectedPhrase === phrase;
                    return (
                      <button
                        key={phrase}
                        type="button"
                        onClick={() => handlePhraseSelect(phrase)}
                        style={
                          contentVisible
                            ? { animationDelay: `${index * 35}ms` }
                            : undefined
                        }
                        className={`text-left rounded-lg border border-neutral-600/60 bg-tm-neutral-color05 px-3 py-2 transition-opacity duration-200 outline-none focus:outline-none ${
                          contentVisible ? "phrase-item-enter" : ""
                        } ${
                          isSelected
                            ? "opacity-30"
                            : "opacity-100 hover:opacity-80"
                        }`}
                      >
                        <PhrasePreview phrase={phrase} userName={userName} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <ConnectorArrow panelRef={rightPanelRef} />

        {/* Right panel: compose + actions */}
        <div ref={rightPanelRef} className="tools-panel tools-panel-right scroll-mt-50 flex flex-col gap-4 min-w-0 lg:rounded-2xl lg:border lg:border-neutral-600/60 lg:bg-tm-neutral-color11 lg:p-5">
          <div ref={composeScrollRef} className="relative flex flex-col flex-1 w-full bg-neutral-900 px-3 pb-12 pt-4 rounded-2xl border border-neutral-700 p-3.5 min-h-[140px] max-h-52 lg:max-h-none lg:min-h-[220px] lg:border-0 lg:bg-transparent lg:p-0 overflow-y-auto no-scrollbar">
            {selectedPhrase && (
              <div
                onClick={busy ? undefined : clearSelectedPhrase}
                className={`relative mb-3 rounded-lg border border-neutral-600/60 bg-tm-neutral-color05 p-3 pr-9 transition-opacity ${
                  busy ? "cursor-not-allowed" : "cursor-pointer active:opacity-70"
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectedPhrase();
                  }}
                  disabled={busy}
                  title="Remove phrase"
                  aria-label="Remove phrase"
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-tm-text-color10 hover:text-white hover:bg-tm-neutral-color06 transition-colors disabled:opacity-40"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
                <PhrasePreview phrase={selectedPhrase} userName={userName} />
              </div>
            )}
            <textarea
              ref={composeTextareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !busy) {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder={
                isTranscribing ? "Transcribing…" : "Tap to add text…"
              }
              disabled={isTranscribing}
              className={`flex-1 min-h-[72px] px-3 bg-transparent outline-none text-base text-white resize-none transition-opacity duration-200 ${
                selectedPhrase && !text.trim()
                 ? "placeholder:text-tm-text-color03"
                 : "placeholder:text-tm-text-color09"
              } focus:placeholder:text-tm-text-color09`}
            />
            {SHOW_RECORD_VOICE && (
              <div className="flex justify-end pt-2">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    title="Stop recording"
                    aria-label="Stop recording"
                    className="w-12 h-12 buttonSubtle rounded-full flex items-center justify-center bg-tm-primary-color12 border border-tm-primary-color06 text-white shrink-0 hover:bg-tm-primary-color11 transition-all"
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-tm-primary-color01 animate-pulse" />
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={isTranscribing || isGenerating}
                    title="Record voice"
                    aria-label="Record voice"
                    className="w-12 h-12 buttonSubtle rounded-full flex items-center justify-center bg-tm-neutral-color08 border border-neutral-600/60 text-tm-text-color11 hover:text-tm-text-color08 hover:border-tm-text-color09 transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {SHOW_RECORD_VOICE && isRecording && (
            <p className="text-tm-primary-color04 text-sm font-medium animate-pulse">
              ● Recording — {fmtTime(recordingSeconds)} — tap mic to stop
            </p>
          )}

          <div className="flex items-center gap-2 px-4 py-3 bg-neutral-900 rounded-4xl border-t-2 border-neutral-600/75">
            <button
              onClick={handleGenerate}
              disabled={busy || !composeText.trim() || !hasVoice}
              title={
                hasVoice
                  ? undefined
                  : "No voice configured for this model — ask an admin to sync from TeaseMe"
              }
              className="flex-1 flex items-center justify-center gap-2 rounded-full btn-primary-cta px-5 py-3 text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <span className="w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : null}
              {isGenerating ? "Generating…" : "Generate"}
            </button>

            <button
              onClick={handlePlaySound}
              disabled={!audioUrl || countdown !== null}
              title="Play Sound"
              aria-label="Play Sound"
              className={`w-12 h-12 shrink-0 buttonSubtle rounded-full flex items-center justify-center transition-all ${
                audioUrl
                  ? "bg-[#1e1e20] border border-[rgba(255,255,255,0.12)] text-white hover:bg-[#252528]"
                  : "bg-[#141414] border border-[rgba(255,255,255,0.06)] text-[#444] cursor-not-allowed"
              }`}
            >
              <svg
                className={`w-4 h-4 ${audioUrl ? "text-tm-primary-color04" : "text-[#444]"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75v-13.5"
                />
              </svg>
            </button>

            {audioUrl ? (
              <a
                href={audioUrl}
                download="voice-message.mp3"
                title="Download"
                aria-label="Download audio"
                className="w-12 h-12 shrink-0 buttonSubtle rounded-full flex items-center justify-center bg-[#1e1e20] border border-[rgba(255,255,255,0.12)] text-white hover:bg-[#252528] transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </a>
            ) : (
              <button
                type="button"
                disabled
                aria-label="Download audio"
                className="w-12 h-12 shrink-0 buttonSubtle rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.06)] text-[#444] cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
            )}
          </div>

          {(countdown !== null || isPlaying) && (
            <div className="flex items-center gap-2 ">
              {countdown !== null && (
                <p className="text-tm-primary-color04 text-lg font-bold animate-pulse">
                  {countdown}
                </p>
              )}
              {isPlaying && countdown === null && (
                <p className="text-tm-success-color05 text-sm font-bold animate-pulse">
                  ♪ Playing…
                </p>
              )}
            </div>
          )}

          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      </div>

      {/* Language selector — hidden until header is clicked 10 times */}
      {showLanguagePanel && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[#555] font-medium">Select Language</p>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLanguage(lang.code)}
                className={`buttonSubtle buttonMd flex items-center justify-center gap-2 rounded-full text-sm transition-all active:scale-95 ${
                  selectedLanguage === lang.code
                    ? "bg-tm-primary-color11 border border-tm-primary-color09 text-white"
                    : "bg-tm-neutral-color05 hover:bg-tm-neutral-color03 border-[rgba(255,255,255,0.1)] text-tm-text-color08 hover:border-tm-primary-color06"
                }`}
              >
                <span>{lang.flag}</span>
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-tm-danger-color05 text-sm">{error}</p>}

      {SHOW_RECORD_VOICE && (
        <div className="grid lg:grid-cols-2 gap-3 mt-1">
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-md p-4 flex flex-col gap-4">
          <div className="flex items-center justify-center">
            <img src={PhoneTip} alt="" />
          </div>
          <p className="text-[#555] text-sm leading-[1.6]">
            <span className="text-white">Phone Tip: </span>Align the bottom
            edges of both phones while recording. Tap Play on the tool phone,
            then wait for the countdown before tapping Record on the messaging
            phone.
          </p>
        </div>
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-md p-4 hidden lg:flex flex-col gap-4">
          <div className="flex items-center gap-4 justify-center">
            <img src={DesktopTip} alt="" />
          </div>
          <p className="text-[#555] text-sm leading-[1.6]">
            <span className="text-white">Desktop Tip: </span>Place phone in
            front of the desktop speaker while recording. Tap Play on the
            desktop, wait for the countdown before tapping Record on the phone.
          </p>
        </div>
        </div>
      )}
    </div>
  );
};
