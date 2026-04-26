import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  loginWithToken: (token: string | undefined, apiUser: unknown) => User;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const apiUser = await authApi.getCurrentUser();
        setUser(mapApiUserToUser(apiUser));
      } catch {
        setUser(null);
      }
      setIsLoading(false);
    };

    init();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const response = await authApi.login(email, password);
    const mappedUser = mapApiUserToUser(response.user);
    setUser(mappedUser);
    return mappedUser;
  };

  // Used by the Set Password flow: the server sets the httpOnly cookie on
  // password reset and returns the user object directly.
  const loginWithToken = (_token: string | undefined, apiUser: unknown): User => {
    const mappedUser = mapApiUserToUser(apiUser);
    setUser(mappedUser);
    return mappedUser;
  };

  const logout = () => {
    authApi.logout().catch(() => {});
    setUser(null);
  };

  const updateUser = (patch: Partial<User>) => {
    if (!user) return;
    setUser({ ...user, ...patch });
  };

  const switchRole = (role: UserRole) => {
    if (user && user.canSwitchToPromoter) {
      if (role === 'team_manager' || role === 'promoter') {
        setUser({ ...user, role });
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithToken, logout, switchRole, updateUser, isLoading }}>
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
