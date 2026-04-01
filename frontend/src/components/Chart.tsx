import type { ChartData } from '../types';

interface ChartProps {
  data: ChartData;
  className?: string;
}

const PAD = 20;

export const Chart = ({ data, className = '' }: ChartProps) => {
  const rawMax = data.values.length > 0 ? Math.max(...data.values) : 0;
  const maxValue = rawMax > 0 ? rawMax : null;
  const highlightIndex = maxValue === null ? -1 : data.values.indexOf(rawMax);

  const PLACEHOLDER_BARS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  const card = `relative bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[var(--radius-card)] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1)] overflow-hidden ${className}`;

  const renderBars = (keys: string[], heights: number[], highlights: boolean[]) => (
    <div
      className="absolute flex gap-[10px] justify-center"
      style={{ inset: PAD, alignItems: 'stretch' }}
    >
      {keys.map((key, i) => (
        <div key={key} className="flex-1 max-w-[44px] flex flex-col justify-end">
          <div
            className={`w-full rounded-[8px] transition-all ${highlights[i] ? 'bg-linear-to-b from-[#ff0f5f] to-[#990033]' : ''}`}
            style={{
              height: `${heights[i]}%`,
              background: highlights[i] ? undefined : 'var(--color-surface-overlay, #3a3e48)',
              boxShadow: highlights[i]
                ? '0px -1px 0px 0px rgba(255,255,255,0.2), 0px 4px 16px rgba(255,15,95,0.35)'
                : undefined,
            }}
          />
        </div>
      ))}
    </div>
  );

  if (maxValue === null) {
    const emptyKeys = data.values.length > 0 ? data.labels : PLACEHOLDER_BARS;
    return (
      <div className={card}>
        {renderBars(emptyKeys, emptyKeys.map(() => 20), emptyKeys.map(() => false))}
      </div>
    );
  }

  return (
    <div className={card}>
      {renderBars(
        data.labels,
        data.values.map((v) => Math.max((v / maxValue) * 100, 20)),
        data.values.map((_, i) => i === highlightIndex),
      )}
    </div>
  );
};
