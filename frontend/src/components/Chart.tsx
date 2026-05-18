import { useState } from 'react';
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
// Minimum rendered bar height when a bucket has data (keeps very small values visible)
const MIN_BAR_PCT = 6;
// Thin line height (px) for buckets with zero data
const EMPTY_BAR_PX = 4;

const formatValue = (v: number) => {
  if (v <= 0) return null;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
};

export const Chart = ({
  data,
  className = '',
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
}: ChartProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const hasPagination = onPrev !== undefined || onNext !== undefined;
  const bottomReserve = LABEL_H + (hasPagination ? PAGINATION_H : 6);

  const rawMax = data.values.length > 0 ? Math.max(...data.values) : 0;
  // true when there is genuinely no data at all
  const isEmpty = rawMax <= 0;

  const PLACEHOLDER_COUNT = 7;

  const keys = isEmpty
    ? data.labels.length > 0
      ? data.labels
      : Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `p${i}`)
    : data.labels;

  // Heights as percentages (null = use EMPTY_BAR_PX instead)
  const heights: (number | null)[] = isEmpty
    ? keys.map(() => 35) // flat placeholder look
    : data.values.map((v) =>
        v <= 0 ? null : Math.max((v / rawMax) * 100, MIN_BAR_PCT),
      );

  const highlightIndex = isEmpty
    ? -1
    : data.values.reduce(
        (best, v, i) => (v > (data.values[best] ?? -1) ? i : best),
        0,
      );

  // Tooltip position: percentage across the bars area
  const tooltipLeft =
    activeIndex !== null && keys.length > 0
      ? ((activeIndex + 0.5) / keys.length) * 100
      : 50;

  const activeVal =
    activeIndex !== null ? formatValue(data.values[activeIndex] ?? 0) : null;

  const card = `relative bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[var(--radius-card)] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1)] ${className}`;

  return (
    <div
      className={card}
      onMouseLeave={() => setActiveIndex(null)}
      onTouchEnd={() => setTimeout(() => setActiveIndex(null), 1500)}
    >
      {/* Card-level tooltip — sits at the top, never clipped */}
      {activeVal && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `calc(${PAD_H}px + ${tooltipLeft / 100} * (100% - ${PAD_H * 2}px))`,
            top: 8,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-[#111] border border-white/10 rounded-md px-2 py-1 shadow-[0px_4px_12px_rgba(0,0,0,0.5)] whitespace-nowrap">
            <span className="text-[11px] font-semibold text-white leading-none">
              {activeVal}
            </span>
          </div>
          <div
            className="mx-auto mt-[2px]"
            style={{
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid rgba(255,255,255,0.10)',
            }}
          />
        </div>
      )}

      {/* Bars */}
      <div
        className="absolute flex gap-3 justify-center"
        style={{
          left: PAD_H,
          right: PAD_H,
          top: PAD_TOP,
          bottom: bottomReserve,
          alignItems: 'flex-end', // bars grow up from the bottom
        }}
      >
        {keys.map((key, i) => {
          const isActive = activeIndex === i;
          const isHighlight = i === highlightIndex && !isEmpty;
          const h = heights[i];
          const isEmptyBar = h === null;

          return (
            <div
              key={`bar-${key}-${i}`}
              className="flex-1 min-w-0 cursor-pointer"
              style={{
                height: isEmptyBar ? `${EMPTY_BAR_PX}px` : `${h}%`,
                borderRadius: '2px',
                background: isHighlight
                  ? undefined
                  : isEmptyBar
                  ? 'rgba(255,255,255,0.06)'
                  : isActive
                  ? '#50566a'
                  : 'var(--color-surface-overlay, #3a3e48)',
                backgroundImage: isHighlight
                  ? 'linear-gradient(to bottom, #ff0f5f, #990033)'
                  : undefined,
                boxShadow: isHighlight
                  ? '0px -1px 0px 0px rgba(255,255,255,0.2), 0px 4px 16px rgba(255,15,95,0.35), inset -3px 4px 1px -3px rgba(255,255,255,0.35), inset -3px 4px 3px -3px rgba(255,255,255,0.2)'
                  : undefined,
                opacity:
                  activeIndex !== null && !isActive
                    ? isEmptyBar
                      ? 0.3
                      : 0.5
                    : 1,
                transition: 'opacity 0.15s ease, background-color 0.1s ease',
              }}
              onMouseEnter={() => setActiveIndex(i)}
              onTouchStart={(e) => {
                e.preventDefault();
                setActiveIndex(i);
              }}
            />
          );
        })}
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
              className="text-[9px] leading-none font-medium truncate text-center select-none transition-colors duration-150"
              style={{
                color:
                  activeIndex === i
                    ? 'rgba(255,255,255,0.80)'
                    : 'rgba(255,255,255,0.30)',
              }}
            >
              {data.labels[i] ?? ''}
            </span>
          </div>
        ))}
      </div>

      {/* Pagination arrows */}
      {hasPagination && (
        <div
          className="absolute left-0 right-0 flex items-center justify-between px-3"
          style={{ bottom: 0, height: PAGINATION_H }}
        >
          <button
            type="button"
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
            type="button"
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
