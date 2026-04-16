import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chattersApi } from '../services/api';
import type { ChatterMyGroup } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export const ChatterDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatterMyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await chattersApi.getMyGroups();
        setGroups(data.groups);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load groups');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  const openTools = (group: ChatterMyGroup) => {
    navigate(`/chatter-portal/group/${group.id}`, { state: { group } });
  };

  return (
    <div className="flex flex-col gap-[28px] py-[24px]">
      {/* Header */}
      <div>
        {firstName && (
          <p className="text-[#9e9e9e] text-[13px] mb-[4px]">Welcome back, {firstName}…</p>
        )}
        <h1 className="text-[24px] font-bold text-white leading-[1.3]">My Groups</h1>
        <p className="text-[#9e9e9e] text-[14px] mt-[4px]">
          Select a group to generate affiliate links and voice messages.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-[48px]">
          <div className="w-[32px] h-[32px] border-2 border-[#ff0f5f] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
          <p className="text-[#ff2a2a] text-[14px]">{error}</p>
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-[32px] text-center">
          <p className="text-[#9e9e9e] text-[15px]">You are not assigned to any group yet.</p>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-[14px]">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => openTools(group)}
              className="w-full text-left bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-[28px] flex items-start justify-between gap-[16px] hover:border-[rgba(255,42,113,0.3)] hover:bg-[#1e1820] transition-all group/card"
            >
              {/* Left: group name + tag */}
              <div className="flex flex-col gap-[8px]">
                <h3 className="text-white text-[20px] font-bold leading-[1.2]">{group.name}</h3>
                {group.promoter && (
                  <div className="flex flex-col gap-[2px]">
                    <span className="text-[#9e9e9e] text-[13px]">
                      {[group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || ''}
                      {group.promoter.username && (
                        <span className="text-[#ff2a71] ml-[6px]">@{group.promoter.username}</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-[8px] mt-[2px]">
                  <span className="text-[#555] text-[12px]">Referral Bonus</span>
                  <span className="text-[#9e9e9e] text-[12px] font-semibold">{group.commissionPercentage}%</span>
                </div>
              </div>

              {/* Right: chevron */}
              <svg
                className="w-[20px] h-[20px] text-[#444] group-hover/card:text-[#ff2a71] transition-colors shrink-0 mt-[4px]"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
