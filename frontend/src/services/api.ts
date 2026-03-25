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
  description: string;
  websiteUrl: string;
  commissionRate: number;
  secondaryRate: number;
  isActive: boolean;
  visibleToPromoters: boolean;
  _count?: {
    referrals: number;
    commissions: number;
  };
}

export interface Referral {
  id: string;
  inviteCode: string;
  level: number;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  campaign: {
    name: string;
    commissionRate: number;
  };
  referredUser?: {
    email: string;
    firstName: string;
    lastName: string;
  };
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

export const modelsApi = {
  async getAllUsers(): Promise<ApiUser[]> {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    return data.users;
  },

  async getCampaigns(): Promise<Campaign[]> {
    const response = await fetch(`${API_URL}/campaigns`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch campaigns');
    const data = await response.json();
    return data.campaigns;
  },

  async getMyReferrals(): Promise<Referral[]> {
    const response = await fetch(`${API_URL}/referrals/my-referrals`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch referrals: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
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
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create invite');
    }
    return response.json();
  },

  async getInviteQuota(campaignId: string): Promise<{
    used: number;
    remaining: number;
    unlimited: boolean;
  }> {
    const response = await fetch(`${API_URL}/referrals/quota/${campaignId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch quota');
    const data = await response.json();
    return data.quota;
  },

  async getMyTrackingLinks(): Promise<TrackingLink[]> {
    const response = await fetch(`${API_URL}/referrals/tracking-links/me`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch tracking links');
    const data = await response.json();
    return data.trackingLinks;
  },

  async createTrackingLink(campaignId: string): Promise<TrackingLink> {
    const response = await fetch(`${API_URL}/referrals/tracking-link`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ campaignId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create tracking link');
    }
    const data = await response.json();
    return data.trackingLink;
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
