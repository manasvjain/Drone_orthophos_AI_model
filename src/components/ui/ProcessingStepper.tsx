import { AlertCircle, Check, CircleDot } from 'lucide-react';
import { ProcessingStage } from '../../types/gis';

interface ProcessingStepperProps {
  stages: ProcessingStage[];
  orientation?: 'vertical' | 'horizontal';
}

export function ProcessingStepper({
  stages,
  orientation = 'vertical',
}: ProcessingStepperProps) {
  if (orientation === 'horizontal') {
    return (
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {stages.map((stage) => {
          const isDone = stage.status === 'completed';
          const isActive = stage.status === 'active';
          const isFailed = stage.status === 'failed';

          return (
            <div
              key={stage.step}
              className={`border rounded-[4px] p-2.5 flex flex-col justify-between min-w-0 ${
                isDone
                  ? 'bg-[#F4F7F4] border-[#C9D6CB]'
                  : isActive
                  ? 'bg-[#FBF8F1] border-[#DEC9A0]'
                  : isFailed
                  ? 'bg-[#FDF7F6] border-[#E6C5C0]'
                  : 'bg-white border-[#E4E6DF]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono tabular-nums text-[#727A75]">
                  0{stage.step}
                </span>
                {isDone && <Check size={13} strokeWidth={2} className="text-[#496B54] shrink-0" />}
                {isActive && (
                  <CircleDot size={13} strokeWidth={2} className="text-[#9A6820] shrink-0" />
                )}
                {isFailed && (
                  <AlertCircle size={13} strokeWidth={2} className="text-[#A64438] shrink-0" />
                )}
              </div>
              <div className="mt-1.5 text-[11px] font-medium text-[#252A27] leading-tight">
                {stage.name}
              </div>
              <div className="mt-1 text-[10px] font-mono text-[#727A75] tabular-nums">
                {stage.durationSec ? `${stage.durationSec}s` : stage.status}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {stages.map((stage) => {
        const isDone = stage.status === 'completed';
        const isActive = stage.status === 'active';
        const isFailed = stage.status === 'failed';

        return (
          <li
            key={stage.step}
            className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-[4px] text-xs ${
              isDone
                ? 'bg-[#F6F9F6] border-[#D5E0D7]'
                : isActive
                ? 'bg-[#FBF8F1] border-[#E3CFA8]'
                : isFailed
                ? 'bg-[#FDF7F6] border-[#E6C5C0]'
                : 'bg-white border-[#E4E6DF]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-5 h-5 rounded-[2px] flex items-center justify-center text-[11px] font-mono tabular-nums shrink-0 ${
                  isDone
                    ? 'bg-[#496B54] text-white'
                    : isActive
                    ? 'bg-[#C88E41] text-white'
                    : isFailed
                    ? 'bg-[#A64438] text-white'
                    : 'bg-[#F1F2EC] text-[#727A75]'
                }`}
              >
                {isDone ? <Check size={12} strokeWidth={2.2} /> : stage.step}
              </span>
              <span
                className={`truncate ${
                  isDone || isActive || isFailed
                    ? 'font-medium text-[#252A27]'
                    : 'text-[#727A75]'
                }`}
              >
                {stage.name}
              </span>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[#727A75] shrink-0">
              {isDone && stage.durationSec
                ? `${stage.durationSec}s`
                : isActive
                ? 'Running'
                : isFailed
                ? 'Failed'
                : 'Queued'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
