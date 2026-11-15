interface MetricBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
}

export function MetricBlock({ label, value, unit, subtext }: MetricBlockProps) {
  return (
    <div className="bg-white border border-[#E4E6DF] rounded-[4px] px-4 py-3.5 flex flex-col justify-between min-w-0">
      <div className="text-xs font-medium text-[#727A75] truncate">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5 min-w-0">
        <span className="text-xl font-semibold tracking-tight text-[#252A27] font-mono tabular-nums truncate">
          {value}
        </span>
        {unit && <span className="text-xs text-[#727A75] font-mono shrink-0">{unit}</span>}
      </div>
      {subtext && <div className="mt-1 text-[11px] text-[#727A75] truncate">{subtext}</div>}
    </div>
  );
}
