import { useEffect, useRef, useState } from "react";
import { elevenLabsApi } from "../services/api";
import PhoneTip from '../assets/imagePhoneTip.svg';
import DesktopTip from '../assets/imageDesktopTip.svg';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5555/api';

interface PreregisterSuccess {
  status: "ok";
  verification_url: string;
  expires_at?: string;
  user_id?: string;
}

const callPreregister = async (payload: {
  email: string;
  influencer_id: string;
  telegram_id: number;
  full_name: string;
}): Promise<PreregisterSuccess> => {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    throw new Error("You must be logged in to generate an invite.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/chatters/preregister-vip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the preregistration service. Check your connection and try again.");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).detail)
        : "";
    switch (response.status) {
      case 401:
        throw new Error("Session expired. Please log in again.");
      case 403:
        throw new Error("You are not allowed to preregister users.");
      case 404:
        throw new Error(detail || "Influencer not found.");
      case 409:
        throw new Error(detail || "This user is already registered.");
      case 422:
        throw new Error(detail || "Some fields are invalid. Please review and try again.");
      default:
        throw new Error(detail || `Preregistration failed (HTTP ${response.status}).`);
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("verification_url" in (body as Record<string, unknown>)) ||
    typeof (body as Record<string, unknown>).verification_url !== "string"
  ) {
    throw new Error("Unexpected response from the preregistration service.");
  }

  return body as PreregisterSuccess;
};

// ── Link Generator ─────────────────────────────────────────────────────────────

interface LinkGeneratorProps {
  username: string;
}

export const LinkGenerator = ({ username }: LinkGeneratorProps) => {
  const [name, setName] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [email, setEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (loading) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedTelegram = telegramId.trim();

    if (!trimmedName || !trimmedEmail || !trimmedTelegram) {
      setErrorMessage("Please fill in name, telegram ID and email.");
      return;
    }
    if (!/^\d+$/.test(trimmedTelegram)) {
      setErrorMessage("Telegram ID must be a number.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setErrorMessage(null);
    setLoading(true);
    try {
      const result = await callPreregister({
        email: trimmedEmail,
        influencer_id: username,
        telegram_id: Number(trimmedTelegram),
        full_name: trimmedName,
      });
      setGeneratedLink(result.verification_url);
      setCopied(false);
    } catch (err) {
      setGeneratedLink("");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName("");
    setTelegramId("");
    setEmail("");
    setGeneratedLink("");
    setCopied(false);
    setErrorMessage(null);
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

  const canGenerate = !!(name.trim() && telegramId.trim() && email.trim()) && !loading;

  return (
    <div className="flex flex-col gap-[16px]">
      {/* Section header */}
      <div className="flex items-center gap-[8px]">
        <svg
          className="w-[14px] h-[14px] text-[#ff2a71]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-[#9e9e9e]">
          Invite Link
        </p>
      </div>

      {/* Name + Telegram ID row */}
      <div className="grid lg:grid-cols-2 gap-[10px]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="buttonXl inputMJ text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#9e9e9e]"
        />
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value.replaceAll(/\D/g, ""))}
          placeholder="Telegram ID"
          className="buttonXl inputMJ text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#9e9e9e]"
        />
      </div>

      {/* Email + Reset + Generate row */}
      <div className="flex flex-col lg:flex-row gap-[10px]">
        <div className="relative flex-1">
          <svg
            className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="Email"
            className="buttonXl inputIcon w-full inputMJ text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#9e9e9e]"
          />
        </div>
        <button
          onClick={handleReset}
          title="Reset form"
          aria-label="Reset form"
          className="lg:w-[56px] buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] text-[#555] hover:text-[#9e9e9e] hover:border-[rgba(255,255,255,0.2)] transition-all shrink-0"
        >
          <svg
            className="w-[15px] h-[15px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="buttonSubtle bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-full px-[20px] py-[11px] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          {loading ? "Generating..." : "Generate Link"}
        </button>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="flex items-start gap-2 border border-[rgba(255,15,95,0.35)] bg-[rgba(255,15,95,0.08)] text-[#ff6b99] text-[12px] px-4 py-3 rounded-[8px]">
          <svg
            className="w-[14px] h-[14px] mt-[2px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M4.062 19h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L2.33 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Generated link */}
      {generatedLink && (
        <div className="flex flex-col gap-4 border border-neutral-800 p-8 rounded-xl bg-tm-neutral-color08 min-w-0 w-full overflow-hidden">
          <div className="flex flex-row w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-[#9e9e9e]">
              Generated Link
            </p>
          </div>
          <div className="flex flex-col lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] lg:grid gap-2 min-w-0 w-full">
            <div className="flex items-center gap-2 inputMJ p-4 w-full min-w-0 overflow-hidden">
              <svg
                className="w-[14px] h-[14px] text-[#555] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              <p className="flex-1 min-w-0 text-[#9e9e9e] text-[13px] truncate font-mono">
                {generatedLink}
              </p>
            </div>
            <button
              onClick={handleCopy}
              aria-label={
                copied ? "Copied generated link" : "Copy generated link"
              }
              className={`flex buttonSubtle buttonLg items-center justify-center px-10 flex-row-reverse transition-all [background:linear-gradient(250deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] hover:[background:linear-gradient(290deg,#212121_8.83%,#383838_13.08%,#333_23.52%,#2E2E2E_35.88%,#141414_61.39%,#292929_89.22%)] ${copied ? "text-[#28ff70]" : "text-white"}`}
            >
              <p className="text-sm font-medium">
                {copied ? "Copied!" : "Copy"}
              </p>

              {copied ? (
                <svg
                  className="w-[16px] h-[16px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-[16px] h-[16px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Language options ───────────────────────────────────────────────────────────

const LANGUAGES: { code: string; flag: string; label: string }[] = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Spanish" },
  { code: "pt", flag: "🇧🇷", label: "Portuguese" },
  { code: "fr", flag: "🇫🇷", label: "French" },
  { code: "it", flag: "🇮🇹", label: "Italian" },
  { code: "de", flag: "🇩🇪", label: "German" },
  { code: "pl", flag: "🇵🇱", label: "Polish" },
  { code: "ru", flag: "🇷🇺", label: "Russian" },
  { code: "ar", flag: "🇸🇦", label: "Arabic" },
  { code: "hi", flag: "🇮🇳", label: "Hindi" },
  { code: "ja", flag: "🇯🇵", label: "Japanese" },
  { code: "ko", flag: "🇰🇷", label: "Korean" },
  { code: "zh", flag: "🇨🇳", label: "Chinese" },
  { code: "tr", flag: "🇹🇷", label: "Turkish" },
  { code: "nl", flag: "🇳🇱", label: "Dutch" },
];

// ── Mood options ───────────────────────────────────────────────────────────────

const MOODS: {
  value: string;
  emoji: string;
  label: string;
  description: string;
}[] = [
    {
      value: "seductive",
      emoji: "💋",
      label: "Seductive",
      description:
        "Slow, breathy, and intensely intimate. Long pauses between phrases. Every word feels deliberate and loaded with desire.",
    },
    {
      value: "teasing",
      emoji: "😜",
      label: "Teasing",
      description:
        "Light and mischievous, with playful giggles and sudden pauses. The tone dances between sweet and provocative.",
    },
    {
      value: "needy",
      emoji: "🥺",
      label: "Needy",
      description:
        "Longing and slightly desperate. Voice trembles at the edges, emotionally raw, as if the speaker really needs attention right now.",
    },
    {
      value: "dominant",
      emoji: "👑",
      label: "Dominant",
      description:
        "Commanding and self-assured. Short, direct sentences. A tone that expects to be obeyed without needing to raise its voice.",
    },
    {
      value: "innocent",
      emoji: "🌸",
      label: "Innocent",
      description:
        "Soft, wide-eyed, and sweetly naive. The speaker seems unaware of any double meaning, which makes every line more charming.",
    },
    {
      value: "flirting",
      emoji: "😏",
      label: "Flirting",
      description:
        "Suggestive and knowing, with smirks you can hear. Sentences trail off invitingly. The listener feels personally chosen.",
    },
    {
      value: "horny",
      emoji: "🔥",
      label: "Horny",
      description:
        "Explicit heat and urgency. Breathless pacing, direct language. The speaker is barely holding back.",
    },
    {
      value: "heartbroken",
      emoji: "💔",
      label: "Heartbroken",
      description:
        "Trembling and tearful. Sentences crack mid-way. There is a vulnerability that makes every word feel fragile.",
    },
    {
      value: "mysterious",
      emoji: "🌙",
      label: "Mysterious",
      description:
        "Hushed and slow, with dramatic pauses. The speaker seems to know something the listener does not. Each sentence is a half-revealed secret.",
    },
    {
      value: "naughty",
      emoji: "😈",
      label: "Naughty",
      description:
        "Wickedly playful with a dark edge. Mischievous laughs. The speaker is clearly up to something and loving every second of it.",
    },
    {
      value: "excited",
      emoji: "🤩",
      label: "Excited",
      description:
        "High-energy and fast, with bursts of enthusiasm. The speaker can barely contain themselves, words tumbling out.",
    },
    {
      value: "desperate",
      emoji: "😰",
      label: "Desperate",
      description:
        "Urgent and breathless, as if running out of time. Short sentences, gasps between thoughts, an almost pleading quality.",
    },
  ];

// ── Voice Message ──────────────────────────────────────────────────────────────

interface VoiceMessageProps {
  modelName?: string;
  voiceId?: string;
}

export const VoiceMessage = ({ modelName, voiceId }: VoiceMessageProps) => {
  const [text, setText] = useState("");
  const [selectedMood, setSelectedMood] = useState("seductive");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [showLanguagePanel, setShowLanguagePanel] = useState(false);
  const labelClickCountRef = useRef(0);
  const labelClickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLabelClick = () => {
    if (labelClickResetRef.current) clearTimeout(labelClickResetRef.current);
    labelClickCountRef.current += 1;
    if (labelClickCountRef.current >= 10) {
      labelClickCountRef.current = 0;
      setShowLanguagePanel((v) => !v);
      return;
    }
    labelClickResetRef.current = setTimeout(() => {
      labelClickCountRef.current = 0;
    }, 3000);
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const prevAudioUrlRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (labelClickResetRef.current) clearTimeout(labelClickResetRef.current);
      if (prevAudioUrlRef.current) URL.revokeObjectURL(prevAudioUrlRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            /* ignore teardown errors */
          }
        }
        recorder.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    setRecordingSeconds(0);
    timerRef.current = setInterval(
      () => setRecordingSeconds((s) => s + 1),
      1000,
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone access and try again.",
      );
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.onstop = async () => {
      const rawMimeType = mr.mimeType || "audio/webm";
      const mimeType = rawMimeType.split(";")[0].trim() || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      mr.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      setIsTranscribing(true);
      setError("");
      try {
        const result = await elevenLabsApi.transcribe(blob);
        setText((prev) => {
          const trimmed = prev.trimEnd();
          return trimmed ? `${trimmed} ${result.text}` : result.text;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    };
    mr.stop();
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (!voiceId?.trim()) {
      setError(
        "No voice is configured for this model yet. Please ask an admin to sync the model from TeaseMe.",
      );
      return;
    }
    setIsGenerating(true);
    setError("");
    setAudioUrl("");
    setIsPlaying(false);
    if (prevAudioUrlRef.current) {
      URL.revokeObjectURL(prevAudioUrlRef.current);
      prevAudioUrlRef.current = "";
    }
    try {
      const moodObj = MOODS.find((m) => m.value === selectedMood);
      const blob = await elevenLabsApi.textToSpeech(
        text,
        voiceId,
        moodObj?.value,
        moodObj?.description,
        selectedLanguage,
      );
      const url = URL.createObjectURL(blob);
      prevAudioUrlRef.current = url;
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate audio");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlaySound = () => {
    if (countdown !== null) return;
    setCountdown(3);
    let count = 3;
    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCountdown(null);
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          void audioRef.current.play();
        }
      } else {
        setCountdown(count);
      }
    }, 500);
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const busy = isGenerating || isRecording || isTranscribing;
  const displayName = modelName ?? "The Model";
  const hasVoice = !!voiceId && voiceId.trim().length > 0;

  return (
    <div className="flex flex-col gap-[20px]">
      {/* Section header */}
      <div className="flex items-center gap-[8px]">
        <svg
          className="w-[14px] h-[14px] text-[#ff2a71]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
        </svg>
        <p className="text-[11px] font-bold uppercase tracking-[0.3px] text-[#9e9e9e]">
          Talk Like {displayName}
        </p>
      </div>

      {/* Missing voice warning */}
      {!hasVoice && (
        <div className="flex items-start gap-[10px] bg-[#2a1a0f] border border-[rgba(255,170,50,0.25)] rounded-[10px] px-[14px] py-[12px]">
          <svg
            className="w-[16px] h-[16px] text-[#ffaa33] shrink-0 mt-[2px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <p className="text-[#ffcf80] text-[13px] leading-normal">
            <span className="font-semibold text-white">
              No voice configured for {displayName}.
            </span>{" "}
            Ask an admin to sync this model from TeaseMe — until then, Generate
            Voice is disabled.
          </p>
        </div>
      )}

      {/* Text to Speech label */}
      <div className="flex flex-col gap-[10px]">
        <button
          type="button"
          className="text-[12px] text-[#555] font-medium select-none cursor-pointer bg-transparent border-0 p-0 text-left"
          onClick={handleLabelClick}
        >
          Text to Speech
        </button>

        <div className="w-full grid lg:grid-cols-[2fr_56px_1fr]  gap-2 items-center">
          {/* === ROW 1: Input with Mic inside === */}
          <div className="relative flex flex-row items-center w-full bg-[#141414] rounded-[8px] p-[14px] border border-[rgba(255,255,255,0.1)] shadow-sm h-full">
            {/* The Input Field (flex-1 ensures it takes remaining space) */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && handleGenerate()}
              placeholder={
                isTranscribing
                  ? "Transcribing…"
                  : "Type text here (shorter is better)"
              }
              disabled={isTranscribing}
              className="flex-1 bg-transparent outline-none text-[14px] text-white focus:placeholder-[#555] placeholder:text-[rgba(255,255,255,0.1)] mr-4 lg:mr-19"
            />

            {/* Mic Button (Absolute Positioned) */}
            <div className="relative shrink-0">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  title="Stop recording"
                  aria-label="Stop recording"
                  className="lg:absolute right-2 w-14 h-14  lg:-top-7  buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#660022] border border-[#ff2a71] rounded-[8px] text-white shrink-0 hover:bg-[#7a0029] transition-all"
                >
                  <span className="w-4 h-4 rounded-full bg-tm-primary-color01 animate-pulse" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isTranscribing || isGenerating}
                  title={
                    isRecording
                      ? `Stop — ${fmtTime(recordingSeconds)}`
                      : "Record voice"
                  }
                  aria-label="Record voice"
                  className="lg:absolute right-2 lg:-top-7 w-14 h-14 buttonSubtle buttonXl rounded-full flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] text-[#555] hover:text-[#9e9e9e] hover:border-[rgba(255,255,255,0.2)] transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-[16px] h-[16px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* === ROW 2: Reset Text Button (Own Div) === */}
          <div className="flex flex-col shrink-0">
            <button
              onClick={() => {
                setText("");
                setAudioUrl("");
                setIsPlaying(false);
                setError("");
              }}
              disabled={busy}
              title="Clear text"
              aria-label="Clear text"
              className="w-full buttonSubtle buttonXl rounded-[8px] flex items-center justify-center bg-[#141414] border border-[rgba(255,255,255,0.1)] rounded-[8px] text-[#555] hover:text-[#9e9e9e] hover:border-[rgba(255,255,255,0.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className="w-[15px] h-[15px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

          </div>

          {/* === ROW 3: Generate Voice & Play Sound (Stacked Div) === */}
          <div className="flex flex-col gap-[10px] shrink-0">
            <div className="flex"> {isRecording && (
              <p className="text-[#ff2a71] text-sm font-medium animate-pulse">
                ● Recording — {fmtTime(recordingSeconds)} — tap mic to stop
              </p>
            )}</div>
            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={busy || !text.trim() || !hasVoice}
              title={
                hasVoice
                  ? undefined
                  : "No voice configured for this model — ask an admin to sync from TeaseMe"
              }
              className="flex items-center justify-center gap-[7px] bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[18px] py-[11px] text-white text-[13px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <span className="w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-[14px] h-[14px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3"
                  />
                </svg>
              )}
              {isGenerating
                ? selectedMood
                  ? "Applying mood…"
                  : "Generating…"
                : "Generate Voice"}
            </button>

            {/* Play Sound Button */}
            <div className="flex items-center gap-[8px]">
              <button
                onClick={handlePlaySound}
                disabled={!audioUrl || countdown !== null}
                className={`flex items-center justify-center gap-[8px] rounded-[8px] px-[18px] py-[10px] text-[13px] font-bold active:scale-[0.98] transition-all ${audioUrl
                  ? "bg-[#1e1e20] border border-[rgba(255,255,255,0.12)] text-white hover:bg-[#252528]"
                  : "bg-[#141414] border border-[rgba(255,255,255,0.06)] text-[#444] cursor-not-allowed"
                  }`}
              >
                <svg
                  className={`w-[14px] h-[14px] ${audioUrl ? "text-[#ff2a71]" : "text-[#444]"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75v-13.5"
                  />
                </svg>
                Play Sound
              </button>


              {audioUrl && countdown === null && !isPlaying && (
                <a
                  href={audioUrl}
                  download="voice-message.mp3"
                  className="inline-flex flex-1 text-center items-center gap-[8px] rounded-[8px] px-[18px] py-[10px] text-[13px] font-bold active:scale-[0.98] transition-all bg-[#1e1e20] border border-[rgba(255,255,255,0.12)] text-white hover:bg-[#252528]"
                >
                  Download
                </a>
              )}
            </div>
            {/* Countdown & Playing Status Text (Same row as button) */}
            <div className="flex flex-col gap-[4px] min-w-[60px]">
              {countdown !== null && (
                <p className="text-[#ff2a71] text-[20px] font-bold animate-pulse w-[32px] text-center">
                  {countdown}
                </p>
              )}
              {isPlaying && countdown === null && (
                <p className="text-[#28ff70] text-[13px] font-bold animate-pulse">
                  ♪ Playing…
                </p>
              )}
              {/* Move Download Link to separate row for clarity if needed, or keep inline */}
            </div>
          </div>

          {/* Hidden Audio Element */}
          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      </div>

      {/* Mood selector */}
      <div className="flex flex-col gap-[10px]">
        <p className="text-[12px] text-[#555] font-medium">Select Mood</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() =>
                setSelectedMood((prev) => (prev === m.value ? "" : m.value))
              }
              className={`buttonSubtle buttonMd flex items-center justify-center gap-2  rounded-full text-sm transition-all active:scale-95  ${selectedMood === m.value
                ? "bg-tm-primary-color11 border border-tm-primary-color09 text-white"
                : "bg-tm-neutral-color05 hover:bg-tm-neutral-color03 border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:border-[#ff2a71]"
                }`}
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Language selector — hidden until "Text to Speech" label is clicked 10 times */}
      {showLanguagePanel && (
        <div className="flex flex-col gap-[10px]">
          <p className="text-[12px] text-[#555] font-medium">Select Language</p>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLanguage(lang.code)}
                className={`buttonSubtle buttonMd flex items-center justify-center gap-2 rounded-full text-sm transition-all active:scale-95 ${
                  selectedLanguage === lang.code
                    ? "bg-tm-primary-color11 border border-tm-primary-color09 text-white"
                    : "bg-tm-neutral-color05 hover:bg-tm-neutral-color03 border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:border-[#ff2a71]"
                }`}
              >
                <span>{lang.flag}</span>
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-[#ff2a2a] text-[13px]">{error}</p>}

      {/* Tip cards */}
      <div className="grid lg:grid-cols-2 gap-[12px] mt-[4px]">
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-[12px] p-[16px] flex flex-col gap-[10px]">
          <div className="flex items-center  justify-center">
            <img src={PhoneTip} alt="" />

          </div>
          <p className="text-[#555] text-sm leading-[1.6]">
            <span className="text-white">Phone Tip: </span>Align the bottom edges of both phones while recording. Tap Play on
            the tool phone, then wait for the countdown before tapping Record on
            the messaging phone.
          </p>
        </div>
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.06)] rounded-[12px] p-[16px] hidden lg:flex flex-col gap-[10px]">
          <div className="flex items-center gap-4 justify-center">
            <img src={DesktopTip} alt="" />
          </div>
          <p className="text-[#555] text-sm leading-[1.6]">
            <span className="text-white">Desktop Tip: </span>Place phone in front of the desktop speaker while recording. Tap
            Play on the desktop, wait for the countdown before tapping Record on
            the phone.
          </p>
        </div>
      </div>
    </div>
  );
};
