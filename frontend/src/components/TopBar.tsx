import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import iconDashboard from '../assets/iconDashboard.svg';
import iconModels from '../assets/iconProfile.svg';
import iconCampaigns from '../assets/iconInvite.svg';
import iconReports from '../assets/iconReport.svg';
import iconSettings from '../assets/iconSettings.svg';
import iconLogout from '../assets/iconLogout.svg';

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', icon: iconDashboard, label: 'Dashboard', path: '/dashboard' },
  { id: 'models', icon: iconModels, label: 'Models', path: '/models' },
  { id: 'campaigns', icon: iconCampaigns, label: 'Campaigns', path: '/campaigns', adminOnly: true },
  { id: 'reports', icon: iconReports, label: 'Reports', path: '/reports' },
  { id: 'settings', icon: iconSettings, label: 'Settings', path: '/settings' },
];

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
          {navItems.filter(item => !item.adminOnly || user?.baseRole === 'admin').map((item) => {
            const isActive = location.pathname === item.path;
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
                <img src={item.icon} alt="" className="w-[16px] h-[16px] object-contain shrink-0" aria-hidden="true" />
                <span className={`text-[13px] font-medium ${
                  isActive ? 'text-[#ff2a71]' : 'text-[#9e9e9e]'
                }`}>
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
        >
          <img src={iconLogout} alt="" className="w-[18px] h-[18px] object-contain" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
