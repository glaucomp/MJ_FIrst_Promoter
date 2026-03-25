import type { ChartData } from '../types';

interface ChartProps {
  data: ChartData;
  className?: string;
}

export const Chart = ({ data, className = '' }: ChartProps) => {
  const maxValue = Math.max(...data.values);
  const highlightIndex = data.values.indexOf(maxValue);

  return (
    <div
      className={`bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex items-end justify-center p-[16px] ${className}`}
    >
      <div className="flex items-end justify-center gap-[9px] w-full max-w-[244px]">
        {data.values.map((value, index) => {
          const height = Math.max((value / maxValue) * 100, 15);
          const isHighlight = index === highlightIndex;

          return (
            <div
              key={index}
              className="flex flex-col items-center justify-end"
              style={{ width: '28px', height: '110px' }}
            >
              <div
                className={`w-full rounded-[4px] transition-all ${
                  isHighlight
                    ? 'bg-gradient-to-b from-[#ff0f5f] to-[#990033] border border-[#990033] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]'
                    : 'bg-[#3a3e48]'
                }`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
