import type { ChartData } from '../types';

interface ChartProps {
  data: ChartData;
  className?: string;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}

const PAD_H = 16;
const PAD_TOP = 16;
const LABEL_H = 22;
const PAGINATION_H = 28;

export const Chart = ({
  data,
  className = '',
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
}: ChartProps) => {
  const hasPagination = onPrev !== undefined || onNext !== undefined;
  const bottomReserve = LABEL_H + (hasPagination ? PAGINATION_H : 6);

  const rawMax = data.values.length > 0 ? Math.max(...data.values) : 0;
  const maxValue = rawMax > 0 ? rawMax : null;
  const highlightIndex =
    maxValue === null ? -1 : data.values.indexOf(rawMax);

  const PLACEHOLDER_COUNT = 7;
  const isEmpty = maxValue === null;

  const keys = isEmpty
    ? data.labels.length > 0
      ? data.labels
      : Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `p${i}`)
    : data.labels;

  const heights = isEmpty
    ? keys.map(() => 20)
    : data.values.map((v) => Math.max((v / maxValue!) * 100, 20));

  const highlights = isEmpty
    ? keys.map(() => false)
    : data.values.map((_, i) => i === highlightIndex);

  const card = `relative bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[var(--radius-card)] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1)] overflow-hidden ${className}`;

  return (
    <div className={card}>
      {/* Bars */}
      <div
        className="absolute flex gap-3 justify-center"
        style={{
          left: PAD_H,
          right: PAD_H,
          top: PAD_TOP,
          bottom: bottomReserve,
          alignItems: 'stretch',
        }}
      >
        {keys.map((key, i) => (
          <div
            key={`bar-${key}-${i}`}
            className="flex-1 min-w-0 flex flex-col justify-end"
          >
            <div
              className={`w-full rounded-sm transition-all ${highlights[i] ? 'bg-linear-to-b from-[#ff0f5f] to-[#990033]' : ''}`}
              style={{
                height: `${heights[i]}%`,
                background: highlights[i]
                  ? undefined
                  : 'var(--color-surface-overlay, #3a3e48)',
                boxShadow: highlights[i]
                  ? '0px -1px 0px 0px rgba(255,255,255,0.2), 0px 4px 16px rgba(255,15,95,0.35), inset -3px 4px 1px -3px rgba(255,255,255,0.35), inset -3px 4px 3px -3px rgba(255,255,255,0.2)'
                  : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div
        className="absolute flex gap-3 justify-center"
        style={{
          left: PAD_H,
          right: PAD_H,
          bottom: hasPagination ? PAGINATION_H : 4,
          height: LABEL_H,
          alignItems: 'center',
        }}
      >
        {keys.map((key, i) => (
          <div
            key={`lbl-${key}-${i}`}
            className="flex-1 min-w-0 flex items-center justify-center"
          >
            <span
              className="text-[9px] leading-none font-medium text-white/35 truncate text-center select-none"
            >
              {data.labels[i] ?? ''}
            </span>
          </div>
        ))}
      </div>

      {/* Pagination arrows — only when hasPagination */}
      {hasPagination && (
        <div
          className="absolute left-0 right-0 flex items-center justify-between px-3"
          style={{ bottom: 0, height: PAGINATION_H }}
        >
          <button
            onClick={onPrev}
            disabled={!canPrev}
            className="flex items-center justify-center w-5 h-5 rounded text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous period"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 10L3.5 6L7.5 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            onClick={onNext}
            disabled={!canNext}
            className="flex items-center justify-center w-5 h-5 rounded text-white/40 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Next period"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M4.5 10L8.5 6L4.5 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
