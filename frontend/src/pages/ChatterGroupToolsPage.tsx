import { useNavigate, useLocation } from 'react-router-dom';
import type { ChatterMyGroup } from '../services/api';
import { LinkGenerator, VoiceMessage } from '../components/GroupTools';
import { useAuth } from '../contexts/AuthContext';

export const ChatterGroupToolsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const group = location.state?.group as ChatterMyGroup | undefined;

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center py-[64px] gap-[16px]">
        <p className="text-[#9e9e9e] text-[15px]">Group not found.</p>
        <button
          onClick={() => navigate('/chatter-portal')}
          className="text-[#ff2a71] text-[14px] font-semibold hover:underline"
        >
          ← Back to groups
        </button>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  return (
    <div className="flex flex-col gap-[28px] py-[24px]">
      {/* Header */}
      <div className="flex flex-col gap-[4px]">
        {firstName && (
          <p className="text-[#9e9e9e] text-[13px]">Welcome back, {firstName}…</p>
        )}
        <div className="flex items-center gap-[12px]">
          <button
            onClick={() => navigate('/chatter-portal')}
            className="text-[#9e9e9e] hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-[24px] font-bold text-white leading-[1.2]">
            {group.name} Tools
          </h1>
        </div>
        {group.promoter && (
          <p className="text-[#9e9e9e] text-[13px] ml-[32px]">
            Promoter:{' '}
            <span className="text-white font-medium">
              {[group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.email}
            </span>
            {group.promoter.username && (
              <span className="text-[#ff2a71] ml-[6px]">@{group.promoter.username}</span>
            )}
          </p>
        )}
      </div>

      {/* Tools */}
      <div className="flex flex-col gap-[24px]">
        {/* Link Generator */}
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-[28px]">
          {group.promoter?.username ? (
            <LinkGenerator username={group.promoter.username} />
          ) : (
            <div className="flex flex-col gap-[8px]">
              <p className="text-[11px] font-bold uppercase tracking-[0.2px] text-[#9e9e9e]">Generate Affiliate Link</p>
              <p className="text-[#555] text-[13px]">
                Link generation unavailable — this group's promoter has no username set.
              </p>
            </div>
          )}
        </div>

        {/* Voice Message */}
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-[28px]">
          <VoiceMessage />
        </div>
      </div>
    </div>
  );
};
