import type { DashboardStats, InvitedUser, ChartData } from '../types';

const API_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: 'include', ...init });

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    userType: string;
    isActive: boolean;
  };
  token?: string; // Deprecated: server now sets httpOnly cookie
}

// Returned in place of LoginResponse when the backend has marked this
// account as `mustChangePassword=true` (typically a freshly promoted
// pre-influencer who got a temp password by email). The frontend MUST
// route the user to /first-password-change with `changeToken` instead
// of treating the response as a successful session.
export interface RequirePasswordChangeResponse {
  requirePasswordChange: true;
  changeToken: string;
  email: string;
  firstName: string | null;
}

export type LoginResult = LoginResponse | RequirePasswordChangeResponse;

export const isPasswordChangeRequired = (
  result: LoginResult,
): result is RequirePasswordChangeResponse =>
  (result as RequirePasswordChangeResponse).requirePasswordChange === true;

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const response = await apiFetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Invalid email or password');
    }

    return response.json();
  },

  async getCurrentUser(): Promise<LoginResponse['user']> {
    const response = await apiFetch(`${API_URL}/auth/me`);

    if (!response.ok) {
      throw new Error('Failed to get user information');
    }

    const data = await response.json();
    return data.user;
  },

  async logout(): Promise<void> {
    await apiFetch(`${API_URL}/auth/logout`, { method: 'POST' });
  },

  /**
   * Ask the server to send a password-reset email. Always resolves to the
   * same generic message regardless of whether the email matches a real
   * account, so the UI can't be used to enumerate users.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiFetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to send reset email');
    }
    return response.json();
  },

  /**
   * Check a raw invite / reset token without consuming it, so the Set
   * Password page can render the right greeting (or an "expired" state).
   */
  async validateResetToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    firstName?: string | null;
    purpose?: 'invite' | 'reset';
  }> {
    const response = await apiFetch(
      `${API_URL}/auth/password-reset/${encodeURIComponent(token)}/validate`,
    );
    if (!response.ok) {
      return { valid: false };
    }
    return response.json();
  },

  /**
   * Consume a token and set a new password. On success the server returns
   * a JWT so the FE can drop the user straight into their dashboard
   * without a second login hop.
   */
  async resetPassword(token: string, password: string): Promise<LoginResponse & { purpose: 'invite' | 'reset' }> {
    const response = await apiFetch(`${API_URL}/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to reset password');
    }
    return response.json();
  },

  /**
   * Exchange the short-lived `changeToken` from a `requirePasswordChange`
   * login response for a real session. The backend writes the new
   * password, clears the must-change flag, and sets the auth_token
   * cookie so subsequent requests are authenticated normally.
   */
  async firstPasswordChange(
    changeToken: string,
    newPassword: string,
  ): Promise<LoginResponse> {
    const response = await apiFetch(`${API_URL}/auth/first-password-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeToken, newPassword }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to set new password');
    }
    return response.json();
  },
};


export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string;
  defaultReferralUrl: string | null;
  commissionRate: number;
  secondaryRate: number | null;
  recurringRate: number | null;
  cookieLifeDays: number;
  autoApprove: boolean;
  isActive: boolean;
  visibleToPromoters: boolean;
  maxInvitesPerMonth: number | null;
  linkedCampaignId: string | null;
  /** Populated by the backend on admin / AM-scoped campaign reads so the
   *  UI can show "this hidden AM campaign invites into <name>" without an
   *  extra round-trip. May be missing on endpoints that don't include it. */
  linkedCampaign?: {
    id: string;
    name: string;
    visibleToPromoters: boolean;
  } | null;
  createdAt: string;
  _count?: {
    referrals: number;
    commissions: number;
  };
}

export interface CampaignInput {
  name: string;
  description?: string;
  websiteUrl: string;
  defaultReferralUrl?: string;
  commissionRate: number;
  secondaryRate?: number;
  recurringRate?: number | null;
  cookieLifeDays?: number;
  autoApprove?: boolean;
  visibleToPromoters?: boolean;
  maxInvitesPerMonth?: number | null;
  /** Primarily used for hidden (AM membership) campaigns: the public
   *  campaign that AMs enrolled here will invite promoters into.
   *  Current API behavior may still persist this value for visible
   *  campaigns, so omit it or send `null` unless you intend to link. */
  linkedCampaignId?: string | null;
}

export interface ReferralCommission {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  userId: string;
}

export interface ReferralMetadata {
  accountManagerEmail?: string | null;
  inviterEmail?: string | null;
  inviteeEmail?: string | null;
  inviteCode?: string | null;
  emailSentAt?: string | null;
  expiresAt?: string | null;
  resendCount?: number;
}

export interface Referral {
  id: string;
  inviteCode: string;
  level: number;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  campaign: {
    id?: string;
    name: string;
    commissionRate: number;
  };
  referredUser?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    username?: string | null;
    /** Presigned GET URL (1h expiry). */
    photoUrl?: string | null;
  };
  commissions?: ReferralCommission[];
  childReferrals?: Array<{
    id: string;
    referredUser?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      username?: string | null;
      /** Presigned GET URL (1h expiry). */
      photoUrl?: string | null;
    };
    commissions?: ReferralCommission[];
  }>;
  createdAt: string;
  // Populated by getMyReferrals — invitee/inviter/AM emails + expiry. May be
  // empty ({}) for legacy rows created before the email-required flow.
  metadata?: ReferralMetadata;
  // True when status === PENDING and now > (metadata.expiresAt || createdAt+24h).
  isExpired?: boolean;
  // The campaign tracking URL with all 4 referral query params appended.
  // Null for accepted rows or legacy rows missing inviteeEmail.
  inviteUrl?: string | null;
  // TeaseMe onboarding snapshot for pending invites. Null once the invitee
  // has registered on our side (the backend deletes the PreUser row then),
  // and null for legacy rows that pre-date the lifecycle tracker.
  preUser?: {
    currentStep: number;
    // Lifecycle label mirrored from TeaseMe's /step-progress response.
    // Drives the 5-state chip on the My Promoters card. Expected values:
    // "pending" | "order_lp" | "building" | "live" — but stored as an open
    // string so upstream additions don't break the type.
    status: string | null;
    lastCheckedAt: string | null;
    teasemeUserId: string | null;
    // In-flight onboarding session URL, mirrored from TeaseMe's
    // /step-progress response. Used by the top "Open" pill on the Models
    // card while chip = waiting/order_lp/building. Null until upstream
    // populates.
    surveyLink: string | null;
    // Live landing-page URL, mirrored from TeaseMe's /step-progress
    // response. Used by the top "Open" pill once chip = lp_live. Null
    // until upstream populates (i.e. until the LP build finishes).
    assetLink: string | null;
    // ISO timestamp the welcome email was last delivered to the invitee
    // (after the AM clicked "Send Welcome Email" on the LP Live card).
    // Drives the Send/Resend button label. Null = never sent.
    welcomeEmailSentAt: string | null;
  } | null;
}

export interface TrackingLink {
  id: string;
  shortCode: string;
  fullUrl: string;
  clicks: number;
  createdAt: string;
  campaign: {
    name: string;
    websiteUrl: string;
  };
}

export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  isActive: boolean;
  createdAt: string;
  /** Raw creator of this user (could be an admin or a deleted user). */
  createdBy?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    userType?: string;
  } | null;
  /**
   * Effective account manager for this user — resolved on the server by
   * preferring a dedicated `accountManagerId` assignment, then falling back to
   * `createdById`, then walking ACTIVE referrals transitively until an AM is found.
   * This is what the admin Users page groups by, so it matches the commission
   * routing driven by the current referral and assignment rules.
   */
  accountManager?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    userType?: string;
  } | null;
  stats?: {
    totalReferrals: number;
    activeReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
  };
}

const getAuthHeaders = () => ({ 'Content-Type': 'application/json' });

const handleResponse = async (response: Response, fallbackMessage: string) => {
  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || fallbackMessage);
  }
  return response.json();
};

export const modelsApi = {
  async getAllUsers(options?: { accountManagerId?: string; userType?: string; search?: string }): Promise<ApiUser[]> {
    const params = new URLSearchParams();
    if (options?.accountManagerId) params.set('accountManagerId', options.accountManagerId);
    if (options?.userType) params.set('userType', options.userType);
    if (options?.search) params.set('search', options.search);
    const qs = params.toString();
    const response = await apiFetch(`${API_URL}/users${qs ? `?${qs}` : ''}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch users');
    return data.users;
  },

  async getPromoters(): Promise<ApiUser[]> {
    const response = await apiFetch(`${API_URL}/users/promoters`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch promoters');
    return data.users;
  },

  async getCampaigns(): Promise<Campaign[]> {
    const response = await apiFetch(`${API_URL}/campaigns`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch campaigns');
    return data.campaigns;
  },

  async getMyReferrals(): Promise<Referral[]> {
    const response = await apiFetch(`${API_URL}/referrals/my-referrals`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch referrals');
    return data.referrals;
  },

  async createReferralInvite(campaignId: string, email: string): Promise<{
    inviteUrl: string;
    inviteCode: string;
    referral: Referral;
    emailSent?: boolean;
  }> {
    const response = await apiFetch(`${API_URL}/referrals/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ campaignId, email }),
    });
    return handleResponse(response, 'Failed to create invite');
  },

  async resendReferralInvite(referralId: string): Promise<{
    emailSent: boolean;
    inviteUrl: string;
    inviteeEmail: string;
    expiresAt: string;
    resendCount: number;
  }> {
    const response = await apiFetch(`${API_URL}/referrals/${referralId}/resend`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to resend invite');
  },

  async deleteReferralInvite(referralId: string): Promise<{ success: true; id: string }> {
    const response = await apiFetch(`${API_URL}/referrals/${referralId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to delete invite');
  },

  // ── Lifecycle action endpoints (My Promoters card buttons) ────────────────

  async denyReferralInvite(
    referralId: string,
    reason?: string,
  ): Promise<{
    success: true;
    referral: { id: string; status: 'CANCELLED' };
    upstreamNotified: boolean;
  }> {
    const response = await apiFetch(`${API_URL}/referrals/${referralId}/deny`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reason ? { reason } : {}),
    });
    return handleResponse(response, 'Failed to deny referral');
  },

  async reassignReferralInvite(
    referralId: string,
    newReferrerId: string,
  ): Promise<{
    success: true;
    referral: { id: string; referrerId: string };
    newReferrer: { id: string; email: string; firstName: string | null; lastName: string | null };
    upstreamNotified: boolean;
  }> {
    const response = await apiFetch(`${API_URL}/referrals/${referralId}/reassign`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newReferrerId }),
    });
    return handleResponse(response, 'Failed to reassign referral');
  },

  async orderReferralLandingPage(referralId: string): Promise<{
    success: true;
    preUser: {
      id: string;
      currentStep: number;
      status: string;
      lastCheckedAt: string | null;
      teasemeUserId: string | null;
      // surveyLink and assetLink are returned alongside the lifecycle fields
      // because the click handler re-polls TeaseMe's /step-progress before
      // returning, so links may freshly populate (in particular `assetLink`
      // appears once upstream finishes building the landing page). Letting
      // the frontend ingest them in the same response keeps the UI from
      // having to wait for the next list refresh to pick up the LP URL.
      surveyLink: string | null;
      assetLink: string | null;
    };
  }> {
    const response = await apiFetch(
      `${API_URL}/referrals/${referralId}/order-landing-page`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      },
    );
    return handleResponse(response, 'Failed to order landing page');
  },

  async assignReferralChatters(
    referralId: string,
    chatterGroupId: string,
  ): Promise<{
    success: true;
    chatterGroup: { id: string; name: string };
  }> {
    const response = await apiFetch(
      `${API_URL}/referrals/${referralId}/assign-chatters`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ chatterGroupId }),
      },
    );
    return handleResponse(response, 'Failed to assign chatters');
  },

  /**
   * Manually trigger (or re-trigger) the promoter welcome email for an
   * LP-Live referral. Replaces the previous automatic 4→5 promotion hook.
   *
   * `mode` discriminates a fresh send from a resend so the UI can adjust
   * its toast copy. `welcomeEmailSentAt` is the freshly stamped ISO
   * timestamp echoed back by the server, used to flip the button label
   * to "Resend Welcome Email" without a full list refetch.
   */
  async sendReferralWelcomeEmail(referralId: string): Promise<{
    success: true;
    mode: 'sent' | 'resent';
    emailSent: boolean;
    welcomeEmailSentAt: string | null;
  }> {
    const response = await apiFetch(
      `${API_URL}/referrals/${referralId}/send-welcome-email`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      },
    );
    return handleResponse(response, 'Failed to send welcome email');
  },

  async getInviteQuota(campaignId: string): Promise<{
    used: number;
    remaining: number;
    unlimited: boolean;
  }> {
    const response = await apiFetch(`${API_URL}/referrals/quota/${campaignId}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch quota');
    return data.quota;
  },

  async getMyTrackingLinks(): Promise<TrackingLink[]> {
    const response = await apiFetch(`${API_URL}/referrals/tracking-links/me`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch tracking links');
    return data.trackingLinks;
  },

  async getAllCampaigns(): Promise<Campaign[]> {
    const response = await apiFetch(`${API_URL}/campaigns`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch campaigns');
    return data.campaigns;
  },

  async createCampaign(input: CampaignInput): Promise<Campaign> {
    const response = await apiFetch(`${API_URL}/campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    const data = await handleResponse(response, 'Failed to create campaign');
    return data.campaign;
  },

  async updateCampaign(id: string, input: Partial<CampaignInput & { isActive: boolean }>): Promise<Campaign> {
    const response = await apiFetch(`${API_URL}/campaigns/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    const data = await handleResponse(response, 'Failed to update campaign');
    return data.campaign;
  },

  async deleteCampaign(id: string): Promise<void> {
    const response = await apiFetch(`${API_URL}/campaigns/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    await handleResponse(response, 'Failed to delete campaign');
  },

  async deleteUser(userId: string): Promise<void> {
    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    await handleResponse(response, 'Failed to delete user');
  },

  /**
   * Admin-only update for an existing user. Used by the admin Users page to
   * edit account managers (and any other user) — name, email, optional new
   * password, optional userType change. For account managers, `campaignId`
   * swaps the AM's hidden membership campaign (which the backend models as
   * an ACTIVE referral row); pass `null` to clear it.
   */
  async updateUser(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      userType?: 'account_manager' | 'team_manager' | 'promoter' | 'chatter' | 'payer' | 'admin';
      campaignId?: string | null;
    },
  ): Promise<ApiUser> {
    const body: Record<string, unknown> = {};
    if (input.firstName !== undefined) body.firstName = input.firstName;
    if (input.lastName !== undefined) body.lastName = input.lastName;
    if (input.email !== undefined) body.email = input.email;
    if (input.password) body.password = input.password;
    if (input.userType) body.userType = input.userType.toUpperCase();
    if (input.campaignId !== undefined) body.campaignId = input.campaignId;
    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    const data = await handleResponse(response, 'Failed to update user');
    return data.user;
  },

  async assignAccountManager(
    userId: string,
    accountManagerId: string | null,
  ): Promise<ApiUser> {
    const response = await apiFetch(`${API_URL}/users/${userId}/account-manager`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ accountManagerId }),
    });
    const data = await handleResponse(response, 'Failed to reassign user');
    return data.user;
  },

  async createUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    userType: 'account_manager' | 'team_manager' | 'promoter' | 'payer';
    /** Required when userType is 'account_manager'. The hidden AM campaign
     *  the new account manager will be enrolled in. */
    campaignId?: string;
  }): Promise<{ user: ApiUser; inviteEmailSent: boolean }> {
    const response = await apiFetch(`${API_URL}/users/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...data,
        userType: data.userType.toUpperCase(),
      }),
    });
    const result = await handleResponse(response, 'Failed to create user');
    return { user: result.user, inviteEmailSent: result.inviteEmailSent ?? false };
  },

  async createTrackingLink(campaignId: string): Promise<TrackingLink> {
    const response = await apiFetch(`${API_URL}/referrals/tracking-link`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ campaignId }),
    });
    const data = await handleResponse(response, 'Failed to create tracking link');
    return data.trackingLink;
  },

  /** Admin: force-refresh a user's TeaseMe data (voice, socials, media). */
  async syncTeaseMe(userId: string): Promise<{
    user: {
      id: string;
      username: string | null;
      voiceId: string | null;
      teasemeSyncedAt: string | null;
      photoUrl: string | null;
      videoUrl: string | null;
      socialLinks: { platform: string; url: string }[];
    };
    message: string;
  }> {
    const response = await apiFetch(`${API_URL}/users/${userId}/sync-teaseme`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to sync user from TeaseMe');
  },
};

export interface Transaction {
  id: string;
  eventId: string;
  type: 'sale' | 'refund';
  saleAmount: number;
  status: 'completed' | 'refunded';
  createdAt: string;
}

export interface TransactionFull {
  id: string;
  eventId: string;
  type: 'sale' | 'refund';
  saleAmount: number;
  currency: string;
  status: 'completed' | 'refunded';
  plan: string | null;
  createdAt: string;
  customer: {
    id: string;
    email: string | null;
    name: string | null;
    revenue: number;
  } | null;
  campaign: {
    id: string;
    name: string;
    commissionRate: number;
  } | null;
  referral: {
    referrer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  } | null;
  commissions: {
    id: string;
    amount: number;
    percentage: number;
    status: string;
    description: string | null;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      userType: string;
    };
  }[];
}

export interface Commission {
  id: string;
  amount: number;
  percentage: number;
  saleAmount: number | null;
  status: 'unpaid' | 'pending' | 'paid';
  description: string | null;
  createdAt: string;
  paidAt?: string | null;
  wiseTransferId?: string | null;
  wiseStatus?: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: string;
    wiseEmail?: string | null;
    wiseRecipientId?: string | null;
    wiseRecipientType?: string | null;
  };
  campaign: {
    name: string;
    commissionRate: number;
    secondaryRate: number | null;
    recurringRate: number | null;
  } | null;
  referral: {
    referrer: {
      firstName: string;
      lastName: string;
      email: string;
    };
  } | null;
  customer: {
    id: string;
    email: string;
    name: string;
    revenue: number;
  } | null;
  transaction: Transaction | null;
}

export const commissionApi = {
  async getAll(): Promise<Commission[]> {
    const response = await apiFetch(`${API_URL}/commissions`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch commissions');
    return data.commissions;
  },

  async updateStatus(id: string, status: 'unpaid' | 'pending' | 'paid'): Promise<Commission> {
    const response = await apiFetch(`${API_URL}/commissions/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await handleResponse(response, 'Failed to update commission status');
    return data.commission;
  },
};

export interface TransactionListResponse {
  transactions: TransactionFull[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const transactionApi = {
  async getAll(params?: {
    period?: 'week' | 'month' | '3month' | 'all';
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<TransactionListResponse> {
    const query = new URLSearchParams();
    if (params?.startDate) {
      query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
    } else if (params?.period) {
      query.set('period', params.period);
    }
    if (params?.page)   query.set('page',   String(params.page));
    if (params?.limit)  query.set('limit',  String(params.limit));
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    const url = qs ? `${API_URL}/transactions?${qs}` : `${API_URL}/transactions`;
    const response = await apiFetch(url, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to fetch transactions');
  },
};

export interface WiseProfile {
  id: number;
  type: 'personal' | 'business';
  details: { firstName?: string; lastName?: string; name?: string };
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
}

export interface WiseTransfer {
  id: number;
  status: string;
  targetValue: number;
  targetCurrency: string;
  created: string;
}

export interface WisePayoutResult {
  commissionId: string;
  success: boolean;
  transferId?: number;
  error?: string;
}

export const wiseApi = {
  /** Admin: get Wise profile info + balances */
  async getProfile(): Promise<{ profile: WiseProfile; profileId: number; balances: WiseBalance[] }> {
    const response = await apiFetch(`${API_URL}/wise/profile`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to fetch Wise profile');
  },

  /**
   * Any user: save their Wise recipient account ID (and optional email).
   * wiseRecipientId is the numeric Wise account ID.
   */
  async saveRecipient(data: {
    wiseRecipientId: string | null;
    wiseEmail?: string | null;
    wiseRecipientType?: string | null;
  }): Promise<{ user: { id: string; email: string; wiseRecipientId: string | null; wiseEmail: string | null; wiseRecipientType: string | null } }> {
    const response = await apiFetch(`${API_URL}/wise/recipient`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to save Wise recipient');
  },

  /**
   * Any authenticated user: create their own Wise recipient by providing bank
   * details. Wise API creates the account and the returned ID is auto-saved.
   */
  async createOwnRecipient(recipient: object): Promise<{
    wiseAccount: { id: number; type: string; accountHolderName: string };
    user: { id: string; email: string; wiseRecipientId: string | null; wiseEmail: string | null; wiseRecipientType: string | null };
    message: string;
  }> {
    const response = await apiFetch(`${API_URL}/wise/me/recipient`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ recipient }),
    });
    return handleResponse(response, 'Failed to create Wise recipient');
  },

  /**
   * Admin: create a new Wise recipient account for a user via Wise API.
   * recipient follows the Wise /v1/accounts body format.
   */
  async createRecipientForUser(userId: string, recipient: object): Promise<{
    wiseAccount: { id: number; type: string; accountHolderName: string };
    message: string;
  }> {
    const response = await apiFetch(`${API_URL}/wise/recipients`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, recipient }),
    });
    return handleResponse(response, 'Failed to create Wise recipient');
  },

  /** Admin: initiate a payout for a single commission */
  async initiatePayout(commissionId: string): Promise<{
    commission: Commission;
    transfer: WiseTransfer;
    message: string;
  }> {
    const response = await apiFetch(`${API_URL}/wise/payout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ commissionId }),
    });
    return handleResponse(response, 'Failed to initiate Wise payout');
  },

  /** Admin: initiate payouts for multiple commissions */
  async initiateBulkPayout(commissionIds: string[]): Promise<{
    results: WisePayoutResult[];
    succeeded: number;
    failed: number;
  }> {
    const response = await apiFetch(`${API_URL}/wise/payout/bulk`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ commissionIds }),
    });
    return handleResponse(response, 'Failed to initiate bulk Wise payout');
  },

  /** Admin: refresh transfer status for a commission */
  async getPayoutStatus(commissionId: string): Promise<{ transfer: WiseTransfer; commission: Commission }> {
    const response = await apiFetch(`${API_URL}/wise/payout/${commissionId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to get payout status');
  },
};

export interface AccountManagerSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  _count?: {
    createdCampaigns?: number;
    createdChatterGroups?: number;
  };
  /**
   * The hidden Account Manager membership campaign this AM is currently
   * enrolled in (encoded as the AM's ACTIVE referral whose campaign is
   * `visibleToPromoters: false`). `null` when the AM has no active
   * membership — usually a data anomaly worth flagging in the admin UI.
   */
  currentCampaign?: {
    id: string;
    name: string;
    linkedCampaign: { id: string; name: string } | null;
  } | null;
}

export const usersApi = {
  /**
   * Admin-only. Returns every active ACCOUNT_MANAGER so the admin UI can
   * offer a "filter by account manager" dropdown.
   */
  async listAccountManagers(): Promise<AccountManagerSummary[]> {
    const response = await apiFetch(`${API_URL}/users/role/account-managers`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch account managers');
    return data.managers;
  },
};

export const chattersApi = {
  async list(options?: { accountManagerId?: string }): Promise<{ chatters: import('../types').Chatter[] }> {
    const params = new URLSearchParams();
    if (options?.accountManagerId) params.set('accountManagerId', options.accountManagerId);
    const qs = params.toString();
    const response = await apiFetch(`${API_URL}/chatters${qs ? `?${qs}` : ''}`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to list chatters');
  },

  async get(id: string): Promise<{ chatter: import('../types').Chatter }> {
    const response = await apiFetch(`${API_URL}/chatters/${id}`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to get chatter');
  },

  async create(data: { email: string; firstName?: string; lastName?: string }): Promise<{ chatter: import('../types').Chatter; inviteEmailSent: boolean }> {
    const response = await apiFetch(`${API_URL}/chatters`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    const result = await handleResponse(response, 'Failed to create chatter');
    return { chatter: result.chatter, inviteEmailSent: result.inviteEmailSent ?? false };
  },

  async delete(id: string): Promise<{ message: string }> {
    const response = await apiFetch(`${API_URL}/chatters/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to delete chatter');
  },

  async getMyGroups(): Promise<{ groups: ChatterMyGroup[] }> {
    const response = await apiFetch(`${API_URL}/chatters/me/groups`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to fetch my groups');
  },
};

export interface ChatterMyGroup {
  id: string;
  name: string;
  tag: string | null;
  commissionPercentage: number;
  promoter: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    voiceId: string | null;
    /** Presigned GET URL (1h expiry). */
    photoUrl: string | null;
    /** Presigned GET URL (1h expiry). */
    videoUrl: string | null;
    teasemeSyncedAt: string | null;
    socialLinks: { platform: string; url: string }[];
  } | null;
  members: {
    id: string;
    chatterId: string;
    chatter: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  }[];
}

export const elevenLabsApi = {
  async textToSpeech(text: string, voiceId?: string, mood?: string, moodDescription?: string, language?: string): Promise<Blob> {
    const response = await apiFetch(`${API_URL}/elevenlabs/tts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, voiceId, mood, moodDescription, language }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to generate audio' }));
      throw new Error(err.error || 'Failed to generate audio');
    }
    return response.blob();
  },

  async transcribe(audioBlob: Blob): Promise<{ text: string }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    // No Content-Type header — browser sets multipart boundary automatically
    const response = await apiFetch(`${API_URL}/elevenlabs/transcribe`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to transcribe audio' }));
      throw new Error(err.error || 'Failed to transcribe audio');
    }
    return response.json();
  },
};

export const chatterGroupsApi = {
  async list(): Promise<{ groups: import('../types').ChatterGroup[] }> {
    const response = await apiFetch(`${API_URL}/chatter-groups`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to list chatter groups');
  },

  async get(id: string): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${id}`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to get chatter group');
  },

  async create(data: { name: string; commissionPercentage: number; tag?: string | null }): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await apiFetch(`${API_URL}/chatter-groups`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to create chatter group');
  },

  async update(id: string, data: { name?: string; commissionPercentage?: number; tag?: string | null }): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to update chatter group');
  },

  async delete(id: string): Promise<{ message: string }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to delete chatter group');
  },

  async addMember(groupId: string, chatterId: string): Promise<{ member: import('../types').ChatterGroupMember }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${groupId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chatterId }),
    });
    return handleResponse(response, 'Failed to add member to chatter group');
  },

  async removeMember(groupId: string, chatterId: string): Promise<{ message: string }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${groupId}/members/${chatterId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to remove member from chatter group');
  },

  async linkPromoter(groupId: string, promoterId: string): Promise<{ promoter: { id: string; email: string } }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${groupId}/promoter`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ promoterId }),
    });
    return handleResponse(response, 'Failed to link promoter to chatter group');
  },

  async unlinkPromoter(groupId: string, promoterId: string): Promise<{ message: string }> {
    const response = await apiFetch(`${API_URL}/chatter-groups/${groupId}/promoter/${promoterId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to unlink promoter from chatter group');
  },
};

export const mockApi = {
  getDashboardStats: (): DashboardStats => ({
    models: 2,
    modelsChange: 10,
    income: 500.0,
    incomeChange: -5,
  }),

  getPromoterStats: (): DashboardStats => ({
    followers: 1250,
    followersChange: 15,
    income: 850.0,
    incomeChange: 8,
  }),

  getChartData: (): ChartData => ({
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [49, 65, 92, 75, 55, 19, 65],
  }),

  getInvitedUsers: (): InvitedUser[] => [
    {
      id: '1',
      name: 'Emma Wilson',
      email: 'emma@example.com',
      status: 'active',
      joinedAt: '2024-01-15',
      earnings: 2500,
    },
    {
      id: '2',
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      status: 'active',
      joinedAt: '2024-02-20',
      earnings: 1800,
    },
  ],
};
