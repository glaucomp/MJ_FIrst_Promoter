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
  commissions: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    userId: string;
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
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: string;
  };
  campaign: {
    name: string;
    commissionRate: number;
    secondaryRate: number | null;
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
  }): Promise<TransactionListResponse> {
    const query = new URLSearchParams();
    if (params?.startDate) {
      query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
    } else if (params?.period) {
      query.set('period', params.period);
    }
    if (params?.page)  query.set('page',  String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    const url = qs ? `${API_URL}/transactions?${qs}` : `${API_URL}/transactions`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    return handleResponse(response, 'Failed to fetch transactions');
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
