import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

export const Settings = () => {
  const { user, switchRole } = useAuth();

  const handleRoleSwitch = (role: UserRole) => {
    switchRole(role);
  };

  return (
    <div className="flex flex-col gap-[24px]">
      <h1 className="text-[28px] leading-[36px] font-semibold text-white">Settings</h1>

      {/* View Selection - Only for Team Managers */}
      {user?.baseRole === 'team_manager' && user?.canSwitchToPromoter && (
        <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[8px]">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">
              View Selection
            </h2>
            <p className="text-[14px] leading-[1.4] text-[#9e9e9e] tracking-[0.2px]">
              Switch between your team management view or personal promoter stats
            </p>
          </div>

          <div className="grid grid-cols-2 gap-[12px]">
            <button
              onClick={() => handleRoleSwitch('team_manager')}
              className={`relative flex flex-col items-center gap-[12px] p-[20px] rounded-[8px] border-2 transition-all ${
                user?.role === 'team_manager'
                  ? 'bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] border-[#ff0f5f] shadow-[0px_0px_20px_rgba(255,15,95,0.3)]'
                  : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[#ff0f5f] hover:shadow-[0px_0px_12px_rgba(255,15,95,0.15)]'
              }`}
            >
              <div className="text-[32px]">👥</div>
              <div className="flex flex-col gap-[4px] text-center">
                <p className={`text-[16px] leading-[1.4] font-bold ${
                  user?.role === 'team_manager' ? 'text-white' : 'text-[#9e9e9e]'
                }`}>
                  Team Manager
                </p>
                <p className={`text-[12px] leading-[1.4] ${
                  user?.role === 'team_manager' ? 'text-white/80' : 'text-[#9e9e9e]'
                }`}>
                  Manage your team
                </p>
              </div>
              {user?.role === 'team_manager' && (
                <div className="absolute top-[12px] right-[12px] w-[8px] h-[8px] rounded-full bg-white shadow-[0px_0px_8px_rgba(255,255,255,0.8)]" />
              )}
            </button>

            <button
              onClick={() => handleRoleSwitch('promoter')}
              className={`relative flex flex-col items-center gap-[12px] p-[20px] rounded-[8px] border-2 transition-all ${
                user?.role === 'promoter'
                  ? 'bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] border-[#ff0f5f] shadow-[0px_0px_20px_rgba(255,15,95,0.3)]'
                  : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[#ff0f5f] hover:shadow-[0px_0px_12px_rgba(255,15,95,0.15)]'
              }`}
            >
              <div className="text-[32px]">📈</div>
              <div className="flex flex-col gap-[4px] text-center">
                <p className={`text-[16px] leading-[1.4] font-bold ${
                  user?.role === 'promoter' ? 'text-white' : 'text-[#9e9e9e]'
                }`}>
                  Promoter
                </p>
                <p className={`text-[12px] leading-[1.4] ${
                  user?.role === 'promoter' ? 'text-white/80' : 'text-[#9e9e9e]'
                }`}>
                  Your performance
                </p>
              </div>
              {user?.role === 'promoter' && (
                <div className="absolute top-[12px] right-[12px] w-[8px] h-[8px] rounded-full bg-white shadow-[0px_0px_8px_rgba(255,255,255,0.8)]" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Profile Information */}
      <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
        <h2 className="text-[20px] leading-[1.4] font-bold text-white">
          Profile Information
        </h2>
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[8px]">
            <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Name
            </label>
            <input
              type="text"
              value={user?.name || ''}
              readOnly
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Email
            </label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Role
            </label>
            <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] flex items-center gap-[8px]">
              <span className="text-[16px] text-white font-medium">
                {user?.role.replace('_', ' ').toUpperCase() || ''}
              </span>
              <span className="px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border bg-[#006622] border-[#00d948] text-[#28ff70]">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
        <h2 className="text-[20px] leading-[1.4] font-bold text-white">
          Preferences
        </h2>
        <div className="flex flex-col gap-[16px]">
          <label className="flex items-center justify-between p-[16px] bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer hover:border-[#ff0f5f] transition-colors">
            <span className="text-white text-[16px] font-medium">Email Notifications</span>
            <input 
              type="checkbox" 
              className="w-[24px] h-[24px] accent-[#ff0f5f] cursor-pointer" 
              defaultChecked 
            />
          </label>
          <label className="flex items-center justify-between p-[16px] bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer hover:border-[#ff0f5f] transition-colors">
            <span className="text-white text-[16px] font-medium">Push Notifications</span>
            <input 
              type="checkbox" 
              className="w-[24px] h-[24px] accent-[#ff0f5f] cursor-pointer" 
              defaultChecked 
            />
          </label>
        </div>
      </div>
    </div>
  );
};
