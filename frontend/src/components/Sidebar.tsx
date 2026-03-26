import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', path: '/dashboard' },
  { id: 'models', icon: '👥', label: 'Models', path: '/models' },
  { id: 'campaigns', icon: '🎯', label: 'Campaigns', path: '/campaigns', adminOnly: true },
  { id: 'reports', icon: '📈', label: 'Reports', path: '/reports' },
  { id: 'settings', icon: '⚙️', label: 'Settings', path: '/settings' },
];

interface SidebarProps {
  onToggle?: (isOpen: boolean) => void;
}

export const Sidebar = ({ onToggle }: SidebarProps = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();

  const toggleSidebar = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isOpen) {
      setIsOpen(false);
      onToggle?.(false);
    }
  };

  return (
    <>
      <div
        className={`fixed top-0 left-0 h-screen bg-[#212121] border-r border-[rgba(255,255,255,0.03)] transition-all duration-300 z-50 ${
          isOpen ? 'w-[239px]' : 'w-[80px]'
        }`}
        style={{
          boxShadow: '0px -1px 0px 0px rgba(255,255,255,0.1), 0px 4px 8px 0px rgba(0,0,0,0.4), 0px 8px 16px -4px rgba(0,0,0,0.3), 0px 24px 32px -8px rgba(0,0,0,0.2)'
        }}
      >
        <div className={`flex flex-col h-full pb-[64px] pt-[64px] gap-[32px] ${
          isOpen ? 'px-[12px]' : 'pl-[20px] pr-[16px]'
        }`}>
          <button
            onClick={toggleSidebar}
            className="flex flex-col items-center gap-[5px] w-[40px]"
          >
            <img
              src="/logo.png"
              alt="TeaseMe"
              className="w-[40px] h-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="bg-[#101010] h-[24px] w-[40px] rounded-[4px] flex items-center justify-center">
              <span className={`text-[12px] transition-transform ${isOpen ? '-rotate-90' : 'rotate-90'}`}>
                ▶
              </span>
            </div>
          </button>

          <nav className="flex-1 flex flex-col gap-[8px]">
            {navItems.filter(item => !item.adminOnly || user?.baseRole === 'admin').map((item) => {
              const isActive = location.pathname === item.path;
              
              if (isOpen) {
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.path)}
                    className={`flex items-center gap-[8px] h-[44px] rounded-[8px] p-[12px] transition-all ${
                      isActive
                        ? 'bg-[#660022] border border-[#ff2a71]'
                        : 'hover:bg-[#292929]/50'
                    }`}
                  >
                    <span className="text-[16px] leading-none shrink-0">{item.icon}</span>
                    <span
                      className={`text-[16px] font-medium leading-[1.4] tracking-[0.2px] flex-1 text-left ${
                        isActive ? 'text-[#ff2a71]' : 'text-white'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              }
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className={`flex items-center justify-center h-[40px] w-full px-[12px] py-[8px] rounded-[4px] transition-all ${
                    isActive
                      ? 'bg-[#660022] border border-[#ff2a71]'
                      : 'hover:bg-[#292929]/50'
                  }`}
                >
                  <span className="text-[16px] leading-none">{item.icon}</span>
                </button>
              );
            })}
          </nav>

          <button
            onClick={logout}
            className="flex items-center justify-center px-[12px] py-[4px] rounded-[4px] hover:bg-[#292929]/50 h-[40px] w-full"
          >
            <span className="text-[18px] leading-none">🚪</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{
            backdropFilter: 'blur(18px)',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 37.983%, rgba(12,0,4,0.58) 82.696%, #2d000f 100%)'
          }}
          onClick={() => {
            setIsOpen(false);
            onToggle?.(false);
          }}
        />
      )}
    </>
  );
};
