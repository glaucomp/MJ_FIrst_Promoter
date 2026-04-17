import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chattersApi } from '../services/api';
import type { ChatterMyGroup } from '../services/api';

// ── Chatter Avatar Card ──────────────────────────────────────────────────────

interface ChatterAvatarCardProps {
  member: ChatterMyGroup['members'][number];
}

const ChatterAvatarCard = ({ member }: ChatterAvatarCardProps) => {
  const firstName = member.chatter.firstName ?? '';
  const lastName = member.chatter.lastName ?? '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || member.chatter.email.split('@')[0];
  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-[12px] bg-[#202022] border border-[rgba(255,255,255,0.06)] rounded-[14px] px-[16px] py-[14px]">
      <div className="w-[44px] h-[44px] rounded-full bg-[#2e2e32] border-2 border-[#3a3a3e] flex items-center justify-center shrink-0">
        <span className="text-[#aaa] text-[13px] font-semibold">{initials}</span>
      </div>
      <span className="text-white text-[14px] font-medium flex-1 truncate">{displayName}</span>
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────

export const ChatterDashboard = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ChatterMyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const openTools = (group: ChatterMyGroup) => {
    navigate(`/chatter-portal/group/${group.id}`, { state: { group } });
  };

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

  return (
    <div className="flex flex-col gap-[24px] py-[24px]">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-white leading-[1.3]">My Groups</h1>
        <p className="text-[#9e9e9e] text-[14px] mt-[4px]">
          {groups.length === 0
            ? 'Your assigned chatter groups'
            : `${groups.length} group${groups.length === 1 ? '' : 's'} — commissions split equally among group members`}
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
        <div className="flex flex-col gap-[16px]">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => openTools(group)}
              className="w-full text-left bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] flex flex-col hover:border-[rgba(255,42,113,0.3)] hover:bg-[#1e1820] transition-all group/card"
            >
              {/* Card header */}
              <div className="p-[28px] flex items-start justify-between gap-[16px]">
                <div className="flex flex-col gap-[8px]">
                  <h3 className="text-white text-[22px] font-bold leading-[1.2]">{group.name}</h3>
                  {group.tag && (
                    <span className="self-start px-[10px] py-[3px] rounded-[100px] text-[12px] font-semibold text-[#ff2a71]">
                      {group.tag}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-[6px] shrink-0">
                  <div className="flex items-baseline gap-[5px]">
                    <span className="text-[#9e9e9e] text-[13px]">Referral Bonus</span>
                    <span className="text-white text-[14px] font-bold">{group.commissionPercentage}%</span>
                  </div>
                </div>
              </div>

              {/* Card body — team members */}
              <div className="px-[28px] pb-[24px] flex flex-col gap-[16px]">
                <div className="flex flex-col gap-[12px]">
                  <p className="text-[#9e9e9e] text-[14px] font-semibold">Team Members</p>
                  {group.members.length === 0 ? (
                    <p className="text-[#555] text-[13px]">No chatters assigned yet.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-[10px]">
                      {group.members.map(m => (
                        <ChatterAvatarCard key={m.id} member={m} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Linked promoter footer */}
              <div className="flex items-center gap-[6px] px-[28px] py-[14px] border-t border-[rgba(255,255,255,0.04)]">
                <span className="text-[#444] text-[11px] font-semibold uppercase tracking-[0.3px]">Linked Promoter</span>
                <span className="text-[#666] text-[12px]">
                  {group.promoter
                    ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.username || 'Unknown'
                    : 'None'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
