import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { IconLogout } from './NavIcons';
import { navItems } from './navConfig';

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
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-[8px] cursor-pointer"
        >
          <span className="text-[18px] leading-[24px] font-semibold text-white">TeaseMe</span>
          <span className="text-[18px] leading-[24px] font-tertiary text-[#ff0f5f]">HQ</span>
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
              ? 'var(--color-tm-primary-color05)'
              : '#9e9e9e';

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-[6px] px-[16px] py-[8px] rounded-[6px] transition-all ${
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

        {/* Logout - Right side */}
        <button
          onClick={logout}
          aria-label="Log out"
          className="flex items-center justify-center w-[36px] h-[36px] rounded-[6px] hover:bg-[#292929]/50 transition-all"
          style={{ color: 'white' }}
        >
          <IconLogout width={20} height={19} />
        </button>
      </div>
    </div>
  );
};
