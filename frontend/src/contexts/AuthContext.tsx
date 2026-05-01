import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { authApi, isPasswordChangeRequired } from '../services/api';

// Thrown by `login()` when the backend marks the account as
// `mustChangePassword=true`. Callers (Login.tsx) catch this and route
// the user to /first-password-change instead of treating the throw as
// a real login failure. Carries the `changeToken` they need to swap.
export class RequirePasswordChangeError extends Error {
  changeToken: string;
  emailAddress: string;
  firstName: string | null;
  constructor(changeToken: string, email: string, firstName: string | null) {
    super('Password change required');
    this.name = 'RequirePasswordChangeError';
    this.changeToken = changeToken;
    this.emailAddress = email;
    this.firstName = firstName;
  }
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  loginWithToken: (token: string | undefined, apiUser: unknown) => User;
  firstPasswordChange: (
    changeToken: string,
    newPassword: string,
  ) => Promise<User>;
  logout: () => Promise<void>;
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
    username: apiUser.username ?? null,
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
    // Hard-block: server signals the account still has the temp password
    // from the welcome email. Don't `setUser` (we have no real session
    // cookie either) — surface a typed error so the Login page can
    // navigate to /first-password-change with the changeToken in tow.
    if (isPasswordChangeRequired(response)) {
      throw new RequirePasswordChangeError(
        response.changeToken,
        response.email,
        response.firstName,
      );
    }
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

  // Exchange the short-lived changeToken from a `requirePasswordChange`
  // login for a real session. The server sets the auth_token cookie on
  // success so we can `setUser` and let the caller navigate into the
  // dashboard normally.
  const firstPasswordChange = async (
    changeToken: string,
    newPassword: string,
  ): Promise<User> => {
    const response = await authApi.firstPasswordChange(changeToken, newPassword);
    const mappedUser = mapApiUserToUser(response.user);
    setUser(mappedUser);
    return mappedUser;
  };

  const logout = async () => {
    await authApi.logout();
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
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithToken,
        firstPasswordChange,
        logout,
        switchRole,
        updateUser,
        isLoading,
      }}
    >
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
