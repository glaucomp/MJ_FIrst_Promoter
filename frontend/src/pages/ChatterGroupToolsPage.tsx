import { useNavigate, useLocation } from 'react-router-dom';
import type { ChatterMyGroup } from '../services/api';
import { LinkGenerator, VoiceMessage } from '../components/GroupTools';

const InitialsAvatar = ({ name, photoUrl }: { name: string; photoUrl?: string | null }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  if (photoUrl) {
    return (
      <div className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0 bg-[#1a1a1c]">
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="w-[36px] h-[36px] rounded-full bg-linear-to-br from-[#ff0f5f] to-[#cc0047] flex items-center justify-center shrink-0">
      <span className="text-white text-[13px] font-bold leading-none">{initials}</span>
    </div>
  );
};

// Social icons, keyed by the lowercase `platform` string returned by TeaseMe.
const SocialIcon = ({ platform }: { platform: string }) => {
  const key = platform.toLowerCase();
  switch (key) {
    case 'bluesky':
      return (
        <svg className="w-[24px] h-[24px] text-[#0085ff]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg className="w-[24px] h-[24px]" viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f09433" />
              <stop offset="25%" stopColor="#e6683c" />
              <stop offset="50%" stopColor="#dc2743" />
              <stop offset="75%" stopColor="#cc2366" />
              <stop offset="100%" stopColor="#bc1888" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)" />
          <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className="w-[22px] h-[22px] text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
        </svg>
      );
    case 'onlyfans':
      return (
        <svg className="w-[22px] h-[22px] text-[#00aff0]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      );
    default:
      return (
        <svg className="w-[22px] h-[22px] text-[#9e9e9e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
  }
};

export const ChatterGroupToolsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
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

  const modelName = group.name.replace(/\s+chatters?\s*$/i, '').trim() || group.name;
  const promoterName = group.promoter
    ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.username || modelName
    : modelName;
  const promoter = group.promoter;
  const photoUrl = promoter?.photoUrl ?? null;
  const voiceId = promoter?.voiceId ?? undefined;
  const socialLinks = promoter?.socialLinks ?? [];

  return (
    <div className="flex flex-col gap-[28px] py-[24px]">
      {/* Header */}
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[12px]">
          <button
            onClick={() => navigate('/chatter-portal')}
            className="text-[#9e9e9e] hover:text-white transition-colors shrink-0"
            aria-label="Back"
          >
            <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <InitialsAvatar name={promoterName} photoUrl={photoUrl} />
          <h1 className="text-[24px] font-bold text-white leading-[1.2]">
            {promoterName} Tools
          </h1>
        </div>
      </div>

      {/* Tools */}
      <div className="flex flex-col gap-[20px]">
        {/* Invite Link */}
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-4 lg:p-8">
          {group.promoter?.username ? (
            <LinkGenerator username={group.promoter.username} />
          ) : (
            <div className="flex flex-col gap-[8px]">
              <div className="flex items-center gap-[8px]">
                <svg className="w-[14px] h-[14px] text-[#ff2a71]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-[#9e9e9e]">Invite Link</p>
              </div>
              <p className="text-[#555] text-[13px]">
                Link generation unavailable — this group's promoter has no username set.
              </p>
            </div>
          )}
        </div>

        {/* Talk Like [Influencer] */}
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-4 lg:p-8">
          <VoiceMessage modelName={promoterName} voiceId={voiceId} />
        </div>

        {/* Model Info */}
        <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-[18px] p-[24px] flex flex-col gap-[20px] lg:w-1/2">
          {/* Section header */}
          <div className="flex items-center gap-[10px]">
            {/* Waveform icon */}
            <svg className="w-[18px] h-[14px] shrink-0 text-[#ff2a71]" viewBox="0 0 18 14" fill="currentColor">
              <rect x="0" y="5" width="2" height="4" rx="1" />
              <rect x="3" y="3" width="2" height="8" rx="1" />
              <rect x="6" y="0" width="2" height="14" rx="1" />
              <rect x="9" y="2" width="2" height="10" rx="1" />
              <rect x="12" y="4" width="2" height="6" rx="1" />
              <rect x="15" y="5" width="2" height="4" rx="1" />
            </svg>
            <p className="text-[13px] font-bold uppercase tracking-[0.3px] text-white">
              {promoterName} Info
            </p>
          </div>

          {/* Profile picture + socials */}
          <div className="flex gap-[16px] ">
            {/* Profile picture card */}
            <div className="flex-1 bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-[14px] p-[20px] flex items-center gap-[18px]">
              <div className="w-[72px] h-[72px] rounded-full bg-linear-to-br from-[#ff0f5f] to-[#cc0047] flex items-center justify-center shrink-0 overflow-hidden">
                {photoUrl ? (
                  <img src={photoUrl} alt={promoterName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[22px] font-bold leading-none">
                    {promoterName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
                  </span>
                )}
              </div>
              <p className="text-[#555] text-[13px]">Current Profile Picture</p>
            </div>

            {/* Social icon grid (rendered from promoter.socialLinks) */}
            {socialLinks.length > 0 && (
              <div className="grid grid-cols-2 gap-1 shrink-0">
                {socialLinks.map((link) => (
                  <a
                    key={link.platform}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.platform}
                    aria-label={`Open ${link.platform}`}
                    className="w-[52px] h-[52px] flex items-center justify-center bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-[12px] hover:border-[rgba(255,255,255,0.2)] transition-colors"
                  >
                    <SocialIcon platform={link.platform} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
