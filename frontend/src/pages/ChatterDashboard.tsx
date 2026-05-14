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
    <div className="flex items-center gap-3 bg-[#202022] border border-[rgba(255,255,255,0.06)] rounded-lg px-4 py-2">
      <div className="w-11 h-11 rounded-full bg-[#2e2e32] border-2 border-[#3a3a3e] flex items-center justify-center shrink-0">
        <span className="text-[#aaa] text-sm font-semibold">{initials}</span>
      </div>
      <span className="text-white text-sm font-medium flex-1 truncate">{displayName}</span>
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
    <div className="flex flex-col gap-624px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white leading-[1.3]">My Groups</h1>
        <p className="text-[#9e9e9e] text-sm mt-1">
          {groups.length === 0
            ? 'Your assigned chatter groups'
            : `${groups.length} group${groups.length === 1 ? '' : 's'} — commissions split equally among group members`}
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#ff0f5f] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-4 py-3">
          <p className="text-tm-danger-color05 text-sm">{error}</p>
        </div>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-2xl p-8 text-center">
          <p className="text-[#9e9e9e] text-base">You are not assigned to any group yet.</p>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map(group => {
            const promoterName = group.promoter
              ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') ||
              group.promoter.username ||
              group.name
              : group.name;
            const promoterPhoto = group.promoter?.photoUrl ?? null;
            const avatarInitials =
              promoterName
                .split(' ')
                .slice(0, 2)
                .map(w => w[0]?.toUpperCase() ?? '')
                .join('') || group.name.slice(0, 2).toUpperCase();

            return (
              <button
                key={group.id}
                onClick={() => openTools(group)}
                className="w-full text-left bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-2xl flex flex-col  transition-all group/card"
              >
                {/* Card header */}
                <div className="p-7 flex flex-col items-start justify-between gap-4">
                  <div className="flex items-baseline gap-1.25 self-end">
                    <span className="text-[#9e9e9e] text-sm">Referral Bonus</span>
                    <span className="text-white text-sm font-bold">{group.commissionPercentage}%</span>
                  </div>
                  <div className="flex flex-col lg:flex-row justify-between w-full gap-6">
                    <div className="flex items-center gap-3.5">
                      {/* Promoter avatar */}
                      <div className="w-14 h-14 rounded-full bg-linear-to-br from-[#ff0f5f] to-[#cc0047] flex items-center justify-center shrink-0 overflow-hidden border border-[rgba(255,255,255,0.08)]">
                        {promoterPhoto ? (
                          <img
                            src={promoterPhoto}
                            alt={promoterName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-base font-bold leading-none">
                            {avatarInitials}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-white text-lg font-bold leading-[1.2] truncate">{group.name}</h3>
                        {group.tag && (
                          <span className="self-start px-2.5 py-0.75 rounded-full text-sm border text-tm-primary-color05">
                            {group.tag}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 ">

                      <button onClick={() => openTools(group)}
                        className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-linear-to-b from-tm-primary-color08 to-tm-primary-color12 border border-tm-primary-color04 text-white text-base font-semibold  group-hover/card:-translate-y-0.5 transition-all w-full"
                        aria-hidden="true"
                      >
                        View Tools 💬
                      </button >
                    </div></div>
                </div>

                {/* Card body — team members */}
                <div className="px-7 pb-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-4">
                    <p className="text-[#9e9e9e] text-sm font-semibold">Team Members</p>
                    {(group.members ?? []).length === 0 ? (
                      <p className="text-[#555] text-sm">No chatters assigned yet.</p>
                    ) : (
                      <div className="grid lg:grid-cols-3 gap-6">
                        {(group.members ?? []).map(m => (
                          <ChatterAvatarCard key={m.id} member={m} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Linked promoter footer */}
                <div className="flex flex-col lg:flex-row lg:justify-between items-start gap-1.5 px-7 py-3.5 border-t border-tm-neutral-color04">
                  <span className="text-[#444] text-xs font-semibold uppercase">Linked Promoter</span>
                  <span className="text-tm-primary-color04 text-lg">
                    {group.promoter
                      ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.username || 'Unknown'
                      : 'None'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
