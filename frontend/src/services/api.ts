import type { DashboardStats, InvitedUser, ChartData } from '../types';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5555/api';

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    userType: string;
    isActive: boolean;
  };
  token: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Invalid email or password');
    }

    return response.json();
  },

  async getCurrentUser(token: string): Promise<LoginResponse['user']> {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user information');
    }

    const data = await response.json();
    return data.user;
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
}

export interface ReferralCommission {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  userId: string;
}

export interface Referral {
  id: string;
  inviteCode: string;
  level: number;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
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
  };
  commissions?: ReferralCommission[];
  childReferrals?: Array<{
    id: string;
    referredUser?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    commissions?: ReferralCommission[];
  }>;
  createdAt: string;
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
  stats?: {
    totalReferrals: number;
    activeReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
  };
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

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
  async getAllUsers(): Promise<ApiUser[]> {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch users');
    return data.users;
  },

  async getPromoters(): Promise<ApiUser[]> {
    const response = await fetch(`${API_URL}/users/promoters`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch promoters');
    return data.users;
  },

  async getCampaigns(): Promise<Campaign[]> {
    const response = await fetch(`${API_URL}/campaigns`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch campaigns');
    return data.campaigns;
  },

  async getMyReferrals(): Promise<Referral[]> {
    const response = await fetch(`${API_URL}/referrals/my-referrals`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch referrals');
    return data.referrals;
  },

  async createReferralInvite(campaignId: string, email?: string): Promise<{
    inviteUrl: string;
    inviteCode: string;
    referral: Referral;
  }> {
    const response = await fetch(`${API_URL}/referrals/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ campaignId, email }),
    });
    return handleResponse(response, 'Failed to create invite');
  },

  async getInviteQuota(campaignId: string): Promise<{
    used: number;
    remaining: number;
    unlimited: boolean;
  }> {
    const response = await fetch(`${API_URL}/referrals/quota/${campaignId}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch quota');
    return data.quota;
  },

  async getMyTrackingLinks(): Promise<TrackingLink[]> {
    const response = await fetch(`${API_URL}/referrals/tracking-links/me`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch tracking links');
    return data.trackingLinks;
  },

  async getAllCampaigns(): Promise<Campaign[]> {
    const response = await fetch(`${API_URL}/campaigns`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch campaigns');
    return data.campaigns;
  },

  async createCampaign(input: CampaignInput): Promise<Campaign> {
    const response = await fetch(`${API_URL}/campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    const data = await handleResponse(response, 'Failed to create campaign');
    return data.campaign;
  },

  async updateCampaign(id: string, input: Partial<CampaignInput & { isActive: boolean }>): Promise<Campaign> {
    const response = await fetch(`${API_URL}/campaigns/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    const data = await handleResponse(response, 'Failed to update campaign');
    return data.campaign;
  },

  async deleteCampaign(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/campaigns/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    await handleResponse(response, 'Failed to delete campaign');
  },

  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    await handleResponse(response, 'Failed to delete user');
  },

  async createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    userType: 'account_manager' | 'team_manager' | 'promoter';
  }): Promise<ApiUser> {
    const response = await fetch(`${API_URL}/users/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...data,
        userType: data.userType.toUpperCase(),
      }),
    });
    const result = await handleResponse(response, 'Failed to create user');
    return result.user;
  },

  async createTrackingLink(campaignId: string): Promise<TrackingLink> {
    const response = await fetch(`${API_URL}/referrals/tracking-link`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ campaignId }),
    });
    const data = await handleResponse(response, 'Failed to create tracking link');
    return data.trackingLink;
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
    const response = await fetch(`${API_URL}/commissions`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response, 'Failed to fetch commissions');
    return data.commissions;
  },

  async updateStatus(id: string, status: 'unpaid' | 'pending' | 'paid'): Promise<Commission> {
    const response = await fetch(`${API_URL}/commissions/${id}`, {
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
    const response = await fetch(url, { headers: getAuthHeaders() });
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
    const response = await fetch(`${API_URL}/wise/profile`, {
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
    const response = await fetch(`${API_URL}/wise/recipient`, {
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
    const response = await fetch(`${API_URL}/wise/me/recipient`, {
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
    const response = await fetch(`${API_URL}/wise/recipients`, {
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
    const response = await fetch(`${API_URL}/wise/payout`, {
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
    const response = await fetch(`${API_URL}/wise/payout/bulk`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ commissionIds }),
    });
    return handleResponse(response, 'Failed to initiate bulk Wise payout');
  },

  /** Admin: refresh transfer status for a commission */
  async getPayoutStatus(commissionId: string): Promise<{ transfer: WiseTransfer; commission: Commission }> {
    const response = await fetch(`${API_URL}/wise/payout/${commissionId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to get payout status');
  },
};

export const chattersApi = {
  async list(): Promise<{ chatters: import('../types').Chatter[] }> {
    const response = await fetch(`${API_URL}/chatters`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to list chatters');
  },

  async get(id: string): Promise<{ chatter: import('../types').Chatter }> {
    const response = await fetch(`${API_URL}/chatters/${id}`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to get chatter');
  },

  async create(data: { email: string; password: string; firstName?: string; lastName?: string }): Promise<{ chatter: import('../types').Chatter }> {
    const response = await fetch(`${API_URL}/chatters`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to create chatter');
  },

  async delete(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/chatters/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to delete chatter');
  },
};

export const chatterGroupsApi = {
  async list(): Promise<{ groups: import('../types').ChatterGroup[] }> {
    const response = await fetch(`${API_URL}/chatter-groups`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to list chatter groups');
  },

  async get(id: string): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await fetch(`${API_URL}/chatter-groups/${id}`, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to get chatter group');
  },

  async create(data: { name: string; commissionPercentage: number; tag?: string | null }): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await fetch(`${API_URL}/chatter-groups`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to create chatter group');
  },

  async update(id: string, data: { name?: string; commissionPercentage?: number; tag?: string | null }): Promise<{ group: import('../types').ChatterGroup }> {
    const response = await fetch(`${API_URL}/chatter-groups/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response, 'Failed to update chatter group');
  },

  async delete(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/chatter-groups/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to delete chatter group');
  },

  async addMember(groupId: string, chatterId: string): Promise<{ member: import('../types').ChatterGroupMember }> {
    const response = await fetch(`${API_URL}/chatter-groups/${groupId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chatterId }),
    });
    return handleResponse(response, 'Failed to add member to chatter group');
  },

  async removeMember(groupId: string, chatterId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/chatter-groups/${groupId}/members/${chatterId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response, 'Failed to remove member from chatter group');
  },

  async linkPromoter(groupId: string, promoterId: string): Promise<{ promoter: { id: string; email: string } }> {
    const response = await fetch(`${API_URL}/chatter-groups/${groupId}/promoter`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ promoterId }),
    });
    return handleResponse(response, 'Failed to link promoter to chatter group');
  },

  async unlinkPromoter(groupId: string, promoterId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/chatter-groups/${groupId}/promoter/${promoterId}`, {
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
