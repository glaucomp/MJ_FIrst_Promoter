interface QuickTaskCardProps {
  icon: string;
  title: string;
  description: string;
  onClick?: () => void;
  className?: string;
}

export const QuickTaskCard = ({
  icon,
  title,
  description,
  onClick,
  className = '',
}: QuickTaskCardProps) => {
  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex items-center gap-[12px] hover:border-[#ff2a71] transition-all text-left w-full min-h-[68px] ${className}`}
    >
      <div className="bg-[#292929] border border-[rgba(255,255,255,0.03)] rounded-[4px] p-[12px] shrink-0 w-[44px] h-[44px] flex items-center justify-center">
        <span className="text-[18px] leading-none">{icon}</span>
      </div>
      <div className="flex flex-col gap-[8px] flex-1 min-w-0">
        <p className="text-[#e6e6e6] text-[16px] leading-[1.4] font-medium tracking-[0.2px]">{title}</p>
        <p className="text-[#9e9e9e] text-[14px] leading-[1.4] font-medium tracking-[0.2px]">
          {description}
        </p>
      </div>
    </button>
  );
};
