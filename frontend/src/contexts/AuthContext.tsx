import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<User>;
  loginWithToken: (token: string, apiUser: unknown) => User;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  updateUser: (patch: Partial<User>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapApiUserToUser = (apiUser: any): User => {
  const userType = apiUser.userType?.toLowerCase() || apiUser.role?.toLowerCase();
  const role = userType as UserRole;

  const nameParts = [apiUser.firstName, apiUser.lastName].filter(Boolean);
  const name = nameParts.length > 0 ? nameParts.join(' ') : apiUser.email;

  return {
    id: apiUser.id,
    name,
    email: apiUser.email,
    role: role,
    baseRole: role,
    canSwitchToPromoter: role === 'team_manager',
    wiseEmail: apiUser.wiseEmail ?? null,
    wiseRecipientId: apiUser.wiseRecipientId ?? null,
    wiseRecipientType: apiUser.wiseRecipientType ?? null,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem('auth_token');

      if (storedToken) {
        try {
          const apiUser = await authApi.getCurrentUser(storedToken);
          const mappedUser = mapApiUserToUser(apiUser);
          setToken(storedToken);
          setUser(mappedUser);
          localStorage.setItem('auth_user', JSON.stringify(mappedUser));
        } catch {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
        }
      }
      setIsLoading(false);
    };

    init();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const response = await authApi.login(email, password);
    const mappedUser = mapApiUserToUser(response.user);

    setToken(response.token);
    setUser(mappedUser);

    localStorage.setItem('auth_token', response.token);
    localStorage.setItem('auth_user', JSON.stringify(mappedUser));

    return mappedUser;
  };

  // Used by the Set Password flow: the server returns a JWT + user on
  // successful password reset, and we drop the new session straight into
  // the context so the user doesn't have to log in a second time.
  const loginWithToken = (newToken: string, apiUser: unknown): User => {
    const mappedUser = mapApiUserToUser(apiUser);
    setToken(newToken);
    setUser(mappedUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(mappedUser));
    return mappedUser;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const updateUser = (patch: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...patch };
    setUser(updated);
    localStorage.setItem('auth_user', JSON.stringify(updated));
  };

  const switchRole = (role: UserRole) => {
    if (user && user.canSwitchToPromoter) {
      if (role === 'team_manager' || role === 'promoter') {
        const updatedUser = { ...user, role };
        setUser(updatedUser);
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, loginWithToken, logout, switchRole, updateUser, isLoading }}>
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
