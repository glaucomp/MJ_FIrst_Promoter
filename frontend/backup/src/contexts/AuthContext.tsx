import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'ADMIN' | 'PROMOTER';
  userType?: 'ADMIN' | 'ACCOUNT_MANAGER' | 'TEAM_MANAGER' | 'PROMOTER';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await authAPI.getCurrentUser();
          const userData = response.data.user;
          
          // Ensure userType is set, fallback to role-based default
          if (!userData.userType) {
            userData.userType = userData.role === 'ADMIN' ? 'ADMIN' : 'PROMOTER';
          }
          
          // Always update localStorage with fresh data from server
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
        } catch (error) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authAPI.login(email, password);
    const { user, token } = response.data;
    localStorage.setItem('token', token);
    
    // Fetch complete user profile with userType after login
    try {
      const profileResponse = await authAPI.getCurrentUser();
      const completeUser = profileResponse.data.user;
      localStorage.setItem('user', JSON.stringify(completeUser));
      setUser(completeUser);
    } catch (error) {
      // Fallback to login response if getCurrentUser fails
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
    }
  };

  const register = async (data: any) => {
    const response = await authAPI.register(data);
    const { user, token } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
