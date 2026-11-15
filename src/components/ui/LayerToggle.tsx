import { Eye, EyeOff } from 'lucide-react';

interface LayerToggleProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  swatchColor: string;
  swatchStyle?: 'solid' | 'line' | 'dashed' | 'raster';
  count?: number;
}

export function LayerToggle({
  label,
  checked,
  onChange,
  swatchColor,
  swatchStyle = 'solid',
  count,
}: LayerToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[4px] border text-left transition-colors ${
        checked
          ? 'bg-white border-[#D6DAD0] text-[#252A27]'
          : 'bg-[#F7F7F2]/60 border-transparent text-[#727A75] hover:bg-white hover:border-[#E4E6DF]'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {swatchStyle === 'line' ? (
          <span
            className="w-3.5 h-[3px] shrink-0 rounded-[1px]"
            style={{ backgroundColor: swatchColor }}
            aria-hidden="true"
          />
        ) : swatchStyle === 'dashed' ? (
          <span
            className="w-3.5 h-3 shrink-0 border-[1.5px] border-dashed rounded-[1px]"
            style={{ borderColor: swatchColor }}
            aria-hidden="true"
          />
        ) : swatchStyle === 'raster' ? (
          <span
            className="w-3.5 h-3.5 shrink-0 rounded-[2px] border border-[#C6C9C0]"
            style={{
              background:
                'linear-gradient(135deg, #9EA494 0%, #9EA494 50%, #D9DDD2 50%, #D9DDD2 100%)',
            }}
            aria-hidden="true"
          />
        ) : (
          <span
            className="w-3.5 h-3.5 shrink-0 rounded-[2px] border"
            style={{
              backgroundColor: `${swatchColor}33`,
              borderColor: swatchColor,
            }}
            aria-hidden="true"
          />
        )}
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {typeof count === 'number' && (
          <span className="text-[11px] font-mono tabular-nums text-[#727A75]">{count}</span>
        )}
        {checked ? (
          <Eye size={13} strokeWidth={1.75} className="text-[#496B54]" />
        ) : (
          <EyeOff size={13} strokeWidth={1.75} className="text-[#9AA09C]" />
        )}
      </div>
    </button>
  );
}
