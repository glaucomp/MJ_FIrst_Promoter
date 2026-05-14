import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import mjLogo from '../assets/mjpromoFavicon.svg';
import { IconLogout } from './NavIcons';
import { getNavForRole } from './navConfig';

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
          isOpen ? 'w-60' : 'w-16'
        }`}
        style={{
          boxShadow: '0px -1px 0px 0px rgba(255,255,255,0.1), 0px 4px 8px 0px rgba(0,0,0,0.4), 0px 8px 16px -4px rgba(0,0,0,0.3), 0px 24px 32px -8px rgba(0,0,0,0.2)'
        }}
      >
        <div className={`flex flex-col h-full pb-[64px] pt-16 gap-[32px] ${
          isOpen ? 'px-[12px]' : 'pl-[20px] pr-[16px]'
        }`}>
          <button
            onClick={toggleSidebar}
            className="flex flex-col justify-start gap-[5px]"
          >
            <img
              alt="MJ Promoter"
              className="w-[40px] h-auto object-contain"
              src={mjLogo}
            />
            <div className="h-[24px] w-8 rounded-sm flex items-center justify-center">
              <span className={`text-xs transition-transform ${isOpen ? 'rotate-0 ml-3' : '-rotate-90'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9l6 6l6-6"/></svg>
              </span>
            </div>
          </button>

          <nav className="flex-1 flex flex-col gap-[8px]">
            {getNavForRole(user?.baseRole).map((item) => {
              const isActive = location.pathname === item.path;
              const iconColor = isActive
                ? 'var(--color-tm-primary-color05, white)'
                : 'white';

              if (isOpen) {
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.path)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-[8px] h-[44px] rounded-sm p-[12px] transition-all ${
                      isActive
                        ? 'bg-[#660022] border border-[#ff2a71]'
                        : 'hover:bg-[#292929]/50'
                    }`}
                  >
                    <div style={{ color: iconColor }} className="shrink-0 flex items-center justify-center">
                      <item.Icon width={18} height={18} aria-hidden="true" focusable="false" />
                    </div>
                    <span
                      className="text-base font-medium leading-[1.4] flex-1 text-left whitespace-nowrap text-ellipsis"
                      style={{ color: iconColor }}
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
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.label}
                  className={`flex items-center justify-center h-[40px] w-full px-[12px] py-[8px] rounded-sm transition-all ${
                    isActive
                      ? 'bg-[#660022] border border-[#ff2a71]'
                      : 'hover:bg-[#292929]/50'
                  }`}
                >
                  <div style={{ color: iconColor }} className="flex items-center justify-center">
                      <item.Icon width={18} height={18} aria-hidden="true" focusable="false" />
                  </div>
                </button>
              );
            })}
          </nav>

          <button
            onClick={logout}
            className={`flex items-center justify-start rounded-sm hover:bg-[#292929]/50 h-[44px] w-full transition-all ${
              isOpen ? 'gap-[8px] px-[12px]' : 'px-[12px]'
            }`}
            aria-label="Log out"
          >
            <div style={{ color: '#ff0f5f' }} className="shrink-0 flex items-center justify-center">
              <IconLogout width={20} height={19} />
            </div>
            {isOpen && (
              <span
                className="text-base font-medium leading-[1.4] flex-1 text-left whitespace-nowrap"
                style={{ color: '#ff0f5f' }}
              >
                Log Out
              </span>
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 w-full cursor-default"
          style={{
            backdropFilter: 'blur(8px)',            
            background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 37.983%, rgba(12,0,4,0.58) 50%, #2d000f 100%)'
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
