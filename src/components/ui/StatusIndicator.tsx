import { AlertCircle, CheckCircle2, Clock, FileEdit, Loader2 } from 'lucide-react';
import { ProcessingStatus } from '../../types/gis';

interface StatusIndicatorProps {
  status: ProcessingStatus;
  compact?: boolean;
}

export function StatusIndicator({ status, compact = false }: StatusIndicatorProps) {
  const config: Record<
    ProcessingStatus,
    { textColor: string; icon: typeof CheckCircle2; spin?: boolean }
  > = {
    Completed: { textColor: 'text-[#3C5C47]', icon: CheckCircle2 },
    Processing: { textColor: 'text-[#9A6820]', icon: Loader2, spin: true },
    Pending: { textColor: 'text-[#626A65]', icon: Clock },
    Failed: { textColor: 'text-[#A64438]', icon: AlertCircle },
    Draft: { textColor: 'text-[#727A75]', icon: FileEdit },
  };

  const { textColor, icon: Icon, spin } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${textColor}`}>
      <Icon
        size={compact ? 13 : 14}
        strokeWidth={1.75}
        className={spin ? 'animate-spin shrink-0' : 'shrink-0'}
        aria-hidden="true"
      />
      <span>{status}</span>
    </span>
  );
}
