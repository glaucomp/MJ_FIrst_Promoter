import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; firstName?: string; lastName?: string; inviteCode?: string }) =>
    api.post('/auth/register', data),
  getCurrentUser: () => api.get('/auth/me'),
  refreshToken: () => api.post('/auth/refresh')
};

export const campaignAPI = {
  getAll: () => api.get('/campaigns'),
  getById: (id: string) => api.get(`/campaigns/${id}`),
  create: (data: any) => api.post('/campaigns', data),
  update: (id: string, data: any) => api.put(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
  assignToManager: (id: string, managerId: string) =>
    api.post(`/campaigns/${id}/assign`, { managerId }),
  getStats: (id: string) => api.get(`/campaigns/${id}/stats`)
};

export const referralAPI = {
  createInvite: (campaignId: string, email?: string) =>
    api.post('/referrals/create', { campaignId, email }),
  getByInviteCode: (inviteCode: string) =>
    api.get(`/referrals/invite/${inviteCode}`),
  getMyReferrals: () => api.get('/referrals/my-referrals'),
  getById: (id: string) => api.get(`/referrals/${id}`),
  generateTrackingLink: (campaignId: string) =>
    api.post('/referrals/tracking-link', { campaignId }),
  getMyTrackingLinks: () => api.get('/referrals/tracking-links/me'),
  trackClick: (data: any) => api.post('/referrals/track-click', data)
};

export const userAPI = {
  getAll: (params?: any) => api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  createAccountManager: (data: any) => api.post('/users/account-manager', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  getAccountManagers: () => api.get('/users/role/account-managers')
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getActivity: (limit?: number) => api.get('/dashboard/activity', { params: { limit } }),
  getEarnings: () => api.get('/dashboard/earnings'),
  getTopPerformers: (limit?: number) => api.get('/dashboard/top-performers', { params: { limit } })
};

export default api;
