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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleGenerate = () => {
    if (!customerInput.trim()) return;
    setGeneratedLink(buildAffiliateLink(username, customerInput));
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
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

// ── Mood options ──────────────────────────────────────────────────────────────

const MOODS: { value: string; emoji: string; label: string; description: string }[] = [
  {
    value: 'seductive',
    emoji: '💋',
    label: 'Seductive',
    description: 'Slow, breathy, and intensely intimate. Long pauses between phrases. Every word feels deliberate and loaded with desire.',
  },
  {
    value: 'teasing',
    emoji: '😜',
    label: 'Teasing',
    description: 'Light and mischievous, with playful giggles and sudden pauses. The tone dances between sweet and provocative.',
  },
  {
    value: 'needy',
    emoji: '🥺',
    label: 'Needy',
    description: 'Longing and slightly desperate. Voice trembles at the edges, emotionally raw, as if the speaker really needs attention right now.',
  },
  {
    value: 'dominant',
    emoji: '👑',
    label: 'Dominant',
    description: 'Commanding and self-assured. Short, direct sentences. A tone that expects to be obeyed without needing to raise its voice.',
  },
  {
    value: 'innocent',
    emoji: '🌸',
    label: 'Innocent',
    description: 'Soft, wide-eyed, and sweetly naive. The speaker seems unaware of any double meaning, which makes every line more charming.',
  },
  {
    value: 'flirting',
    emoji: '😏',
    label: 'Flirting',
    description: 'Suggestive and knowing, with smirks you can hear. Sentences trail off invitingly. The listener feels personally chosen.',
  },
  {
    value: 'horny',
    emoji: '🔥',
    label: 'Horny',
    description: 'Explicit heat and urgency. Breathless pacing, direct language. The speaker is barely holding back.',
  },
  {
    value: 'heartbroken',
    emoji: '💔',
    label: 'Heartbroken',
    description: 'Trembling and tearful. Sentences crack mid-way. There is a vulnerability that makes every word feel fragile.',
  },
  {
    value: 'mysterious',
    emoji: '🌙',
    label: 'Mysterious',
    description: 'Hushed and slow, with dramatic pauses. The speaker seems to know something the listener does not. Each sentence is a half-revealed secret.',
  },
  {
    value: 'naughty',
    emoji: '😈',
    label: 'Naughty',
    description: 'Wickedly playful with a dark edge. Mischievous laughs. The speaker is clearly up to something and loving every second of it.',
  },
  {
    value: 'excited',
    emoji: '🤩',
    label: 'Excited',
    description: 'High-energy and fast, with bursts of enthusiasm. The speaker can barely contain themselves, words tumbling out.',
  },
  {
    value: 'desperate',
    emoji: '😰',
    label: 'Desperate',
    description: 'Urgent and breathless, as if running out of time. Short sentences, gasps between thoughts, an almost pleading quality.',
  },
];

// ── Voice Message ─────────────────────────────────────────────────────────────

const VoiceMessage = () => {
  const [text, setText] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');

  const prevAudioUrlRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Revoke any lingering object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (prevAudioUrlRef.current) {
        URL.revokeObjectURL(prevAudioUrlRef.current);
      }
    };
  }, []);

  // Recording timer
  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    mr.onstop = async () => {
      // MediaRecorder.mimeType often includes codec params (e.g. "audio/webm;codecs=opus").
      // Strip params so the blob type matches the backend's MIME allowlist exactly.
      const rawMimeType = mr.mimeType || 'audio/webm';
      const mimeType = rawMimeType.split(';')[0].trim() || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      mr.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      setIsTranscribing(true);
      setError('');
      try {
        const result = await elevenLabsApi.transcribe(blob);
        setText(prev => {
          const trimmed = prev.trimEnd();
          return trimmed ? `${trimmed} ${result.text}` : result.text;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed');
      } finally {
        setIsTranscribing(false);
      }
    };

    mr.stop();
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setError('');

    if (prevAudioUrlRef.current) {
      URL.revokeObjectURL(prevAudioUrlRef.current);
      prevAudioUrlRef.current = '';
      setAudioUrl('');
    }

    try {
      const moodObj = MOODS.find(m => m.value === selectedMood);
      const blob = await elevenLabsApi.textToSpeech(
        text,
        undefined,
        moodObj?.value,
        moodObj?.description,
      );
      const url = URL.createObjectURL(blob);
      prevAudioUrlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      setIsGenerating(false);
    }
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const busy = isGenerating || isRecording || isTranscribing;

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.2px] text-[#9e9e9e]">Voice Message</p>

      {/* Mood selector */}
      <div className="flex flex-col gap-[8px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2px] text-[#555]">Select Mood</p>
        <div className="flex flex-wrap gap-[8px]">
          {MOODS.map(m => (
            <button
              key={m.value}
              onClick={() => setSelectedMood(prev => prev === m.value ? null : m.value)}
              className={`flex items-center gap-[6px] px-[12px] py-[6px] rounded-[100px] text-[12px] font-bold border transition-all active:scale-95 ${
                selectedMood === m.value
                  ? 'bg-[#660022] border-[#ff2a71] text-[#ff2a71]'
                  : 'bg-[#141414] border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:border-[#ff2a71] hover:text-[#ff2a71]'
              }`}
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
        {selectedMood && (
          <p className="text-[12px] text-[#9e9e9e]">
            {'AI will rewrite your message in a '}
            <span className="text-[#ff2a71] font-semibold">{selectedMood}</span>
            {' tone with ElevenLabs v3 expression tags.'}
          </p>
        )}
      </div>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your message… or record your voice below."
        rows={4}
        className="bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[12px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#444] resize-none"
      />

      {/* Record + Generate row */}
      <div className="flex items-center gap-[10px] flex-wrap">
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-[6px] bg-[#660022] border border-[#ff2a71] rounded-[8px] px-[14px] py-[10px] text-white text-[13px] font-bold hover:bg-[#7a0029] active:scale-[0.98] transition-all"
          >
            <span className="w-[8px] h-[8px] rounded-sm bg-white shrink-0 animate-pulse" />
            Stop — {fmtTime(recordingSeconds)}
          </button>
        ) : (
          <button
            onClick={startRecording}
            disabled={isTranscribing}
            className="flex items-center gap-[6px] bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[10px] text-white text-[13px] font-bold hover:bg-[#252525] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="w-[8px] h-[8px] rounded-full bg-[#ff2a71] shrink-0" />
            {isTranscribing ? 'Transcribing…' : 'Record Voice'}
          </button>
        )}

        <button
          onClick={handleGenerate}
          disabled={busy || !text.trim()}
          className="flex items-center gap-[8px] bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[18px] py-[10px] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <span className="w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" />
              {selectedMood ? ' Applying mood…' : ' Generating…'}
            </>
          ) : (
            <>{selectedMood ? `🎙 Generate Audio (${selectedMood})` : '🎙 Generate Audio'}</>
          )}
        </button>
      </div>

      {error && (
        <p className="text-[#ff2a2a] text-[13px]">{error}</p>
      )}

      {/* Playback */}
      {audioUrl && (
        <div className="flex flex-col gap-[8px] border-t border-[rgba(255,255,255,0.06)] pt-[12px]">
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
