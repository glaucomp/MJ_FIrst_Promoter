interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  className?: string;
}

export const StatCard = ({ label, value, change, className = '' }: StatCardProps) => {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div
      className={`bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[8px] items-end justify-center overflow-hidden ${className}`}
    >
      <p className="text-[#9e9e9e] text-[16px] leading-[1.4] font-bold uppercase tracking-[0.2px] w-full">{label}</p>
      <div className="flex flex-col gap-[16px] items-start w-full flex-1 min-h-0">
        <p className="text-tm-text-color02 text-lg leading-[1.4] font-bold lg:text-2xl">{value}</p>
        {change !== undefined && (
          <div
            className={`flex items-center gap-[8px] px-2 py-1 rounded-xl border text-[14px] leading-[1.4] font-bold ${
              isPositive
                ? 'bg-[#006622] border-[#00d948] text-[#28ff70]'
                : isNegative
                ? 'bg-tm-danger-color12 border-[#cc0000] text-[#ff2a2a]'
                : 'bg-tm-neutral-color04 border-[rgba(255,255,255,0.03)] text-[#9e9e9e]'
            }`}
          >
            <span className="text-[12px]">
              {isPositive ? '↑' : isNegative ? '↓' : '→'}
            </span>
            <span className="leading-[1.4]">
              {Math.abs(change)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
