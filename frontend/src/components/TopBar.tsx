import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { IconLogout } from './NavIcons';
import { LogoLottie } from './LogoLottie';
import { defaultLandingPath, navItems } from './navConfig';

function initialsForUser(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts.at(-1);
      return (parts[0][0] + (last?.[0] ?? '')).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const roleLabel: Record<UserRole, string> = {
  admin: 'Admin',
  team_manager: 'PROMOTER +',
  account_manager: 'Account manager',
  promoter: 'Promoter',
  chatter: 'Chatter',
  payer: 'Payer',
};

export const TopBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[60px] bg-[#212121] border-b border-[rgba(255,255,255,0.03)] z-50"
      style={{
        boxShadow: '0px -1px 0px 0px rgba(255,255,255,0.1), 0px 2px 4px 0px rgba(0,0,0,0.3)'
      }}
    >
      <div className="flex items-center justify-between h-full px-[40px]">
        {/* Logo/Brand */}
        <button
          onClick={() => user && navigate(defaultLandingPath(user.baseRole))}
          aria-label="Go to home"
          className="flex items-center cursor-pointer"
        >
          <LogoLottie height={40} width={140} />
        </button>

        {/* Navigation - Centered */}
        <nav className="flex items-center gap-[8px] absolute left-1/2 -translate-x-1/2">
          {navItems.filter(item => {
            if (item.adminOnly) return user?.baseRole === 'admin';
            if (item.allowedRoles) return item.allowedRoles.includes(user?.baseRole as UserRole);
            return true;
          }).map((item) => {
            const isActive = location.pathname === item.path;
            const iconColor = isActive
              ? 'var(--color-tm-primary-color05, white)'
              : 'white';

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-[6px] px-[16px] py-[8px] rounded-[6px] hover:-translate-y-0.5 transition-all select-none ${
                  isActive
                    ? 'bg-[#660022] border border-[#ff2a71]'
                    : 'hover:bg-[#292929]/50'
                }`}
              >
                <div style={{ color: iconColor }} className="flex items-center justify-center">
                  <item.Icon width={16} height={16} />
                </div>
                <span
                  className="text-[13px] font-medium"
                  style={{ color: iconColor }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Signed-in user + logout */}
        <div className="flex items-center gap-[12px] shrink-0 min-w-0">
          {user && (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="flex items-center gap-[10px] min-w-0 max-w-[240px] rounded-[8px] px-[10px] py-[6px] hover:bg-[#292929]/50 transition-all text-left"
              aria-label="Open account settings"
            >
              <span
                className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tracking-[0.02em]"
                style={{
                  background: 'linear-gradient(145deg, #660022 0%, #3d0014 100%)',
                  color: '#ffb3cc',
                  border: '1px solid rgba(255, 42, 113, 0.45)',
                }}
              >
                {initialsForUser(user.name, user.email)}
              </span>
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate text-[13px] font-semibold text-white leading-tight">{user.name}</span>
                <span className="truncate text-[11px] font-medium text-white/50 leading-tight">
                  {user.role === user.baseRole
                    ? roleLabel[user.baseRole]
                    : `${roleLabel[user.role]} · ${roleLabel[user.baseRole]}`}
                </span>
              </span>
            </button>
          )}
          <button
            onClick={logout}
            aria-label="Log out"
            className="flex items-center justify-center w-[36px] h-[36px] rounded-[6px] hover:bg-[#292929]/50 transition-all shrink-0"
            style={{ color: '#ff0f5f' }}
          >
            <IconLogout width={20} height={19} />
          </button>
        </div>
      </div>
    </div>
  );
};
