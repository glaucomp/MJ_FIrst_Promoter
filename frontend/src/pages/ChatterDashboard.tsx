import { useEffect, useRef, useState } from 'react';
import { chattersApi, elevenLabsApi } from '../services/api';
import type { ChatterMyGroup } from '../services/api';

const SITE_URL = import.meta.env.VITE_SITE_URL as string | undefined;

const promoterDisplayName = (p: ChatterMyGroup['promoter']): string => {
  if (!p) return '';
  const parts = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return parts || p.email;
};

const buildAffiliateLink = (username: string, customerInput: string): string => {
  const base = (SITE_URL || globalThis.location.origin).replace(/\/$/, '');
  return `${base}/${encodeURIComponent(username)}/${encodeURIComponent(customerInput.trim())}`;
};

// ── Link Generator ────────────────────────────────────────────────────────────

interface LinkGeneratorProps {
  username: string;
}

const LinkGenerator = ({ username }: LinkGeneratorProps) => {
  const [customerInput, setCustomerInput] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    if (!customerInput.trim()) return;
    setGeneratedLink(buildAffiliateLink(username, customerInput));
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.2px] text-[#9e9e9e]">Generate Affiliate Link</p>
      <div className="flex gap-[8px]">
        <input
          type="text"
          value={customerInput}
          onChange={e => setCustomerInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          placeholder="Customer email or nickname"
          className="flex-1 bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[10px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#444]"
        />
        <button
          onClick={handleGenerate}
          disabled={!customerInput.trim()}
          className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[18px] py-[10px] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Generate
        </button>
      </div>

      {generatedLink && (
        <div className="flex items-center gap-[8px] bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[10px]">
          <p className="flex-1 text-[#9e9e9e] text-[13px] truncate font-mono">{generatedLink}</p>
          <button
            onClick={handleCopy}
            className={`text-[12px] font-bold shrink-0 transition-colors ${
              copied ? 'text-[#28ff70]' : 'text-[#ff2a71] hover:text-[#ff4488]'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Voice Message ─────────────────────────────────────────────────────────────

const VoiceMessage = () => {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const prevUrlRef = useRef<string>('');

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError('');

    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = '';
      setAudioUrl('');
    }

    try {
      const blob = await elevenLabsApi.textToSpeech(text);
      const url = URL.createObjectURL(blob);
      prevUrlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.2px] text-[#9e9e9e]">Voice Message</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your message to generate a voice clip…"
        rows={3}
        className="bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[12px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#444] resize-none"
      />

      {error && (
        <p className="text-[#ff2a2a] text-[13px]">{error}</p>
      )}

      <button
        onClick={handleGenerate}
        disabled={isLoading || !text.trim()}
        className="self-start bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[18px] py-[10px] text-white text-[13px] font-bold hover:bg-[#252525] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-[8px]"
      >
        {isLoading ? (
          <>
            <span className="w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" />
            {' Generating…'}
          </>
        ) : (
          '🎙 Generate Audio'
        )}
      </button>

      {audioUrl && (
        <div className="flex flex-col gap-[8px]">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls autoPlay src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download="voice-message.mp3"
            className="self-start text-[#ff2a71] text-[12px] font-semibold hover:underline"
          >
            Download MP3
          </a>
        </div>
      )}
    </div>
  );
};

// ── Group Card ────────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: ChatterMyGroup;
  isSelected: boolean;
  onSelect: () => void;
}

const GroupCard = ({ group, isSelected, onSelect }: GroupCardProps) => {
  const hasUsername = Boolean(group.promoter?.username);

  return (
    <div className="flex flex-col">
      {/* Clickable header row */}
      <button
        onClick={onSelect}
        className={`w-full text-left bg-linear-to-t from-[#212121] to-[#23252a] border rounded-[8px] p-[20px] flex items-center justify-between gap-[16px] transition-all ${
          isSelected
            ? 'border-[#ff2a71] shadow-[0_0_0_1px_rgba(255,42,113,0.2)]'
            : 'border-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.1)]'
        }`}
      >
        {/* Left: group info */}
        <div className="flex flex-col gap-[4px]">
          <p className="text-white text-[16px] font-semibold">{group.name}</p>
          <p className="text-[#9e9e9e] text-[12px]">
            Commission: <span className="text-white font-medium">{group.commissionPercentage}%</span>
          </p>
        </div>

        {/* Right: promoter info */}
        <div className="flex items-center gap-[12px]">
          {group.promoter ? (
            <div className="flex flex-col items-end gap-[2px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.2px] text-[#9e9e9e]">Promoter</span>
              <span className="text-white text-[14px] font-semibold">{promoterDisplayName(group.promoter)}</span>
              {group.promoter.username && (
                <span className="text-[#ff2a71] text-[12px]">@{group.promoter.username}</span>
              )}
            </div>
          ) : (
            <span className="px-[8px] py-[2px] rounded-[100px] text-[11px] border border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
              No promoter
            </span>
          )}

          {/* Expand chevron */}
          <span className={`text-[#9e9e9e] text-[12px] transition-transform duration-200 ${isSelected ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Tools panel — shown only when selected */}
      {isSelected && (
        <div className="bg-[#1c1c1c] border border-t-0 border-[#ff2a71]/30 rounded-b-[8px] p-[20px] flex flex-col gap-[24px]">
          {hasUsername && group.promoter?.username ? (
            <LinkGenerator username={group.promoter.username} />
          ) : (
            <p className="text-[#555] text-[13px]">
              Link generation unavailable — this promoter has no username set.
            </p>
          )}

          <div className="border-t border-[rgba(255,255,255,0.06)]" />

          <VoiceMessage />
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ChatterDashboard = () => {
  const [groups, setGroups] = useState<ChatterMyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="flex flex-col gap-[32px] p-[24px] max-w-[900px] mx-auto">
      <div>
        <h1 className="text-[24px] font-bold text-white leading-[1.3]">Persona</h1>
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
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[32px] text-center">
          <p className="text-[#9e9e9e] text-[15px]">You are not assigned to any group yet.</p>
        </div>
      )}

      {!isLoading && !error && groups.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          {groups.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              isSelected={selectedId === g.id}
              onSelect={() => setSelectedId(prev => prev === g.id ? null : g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
