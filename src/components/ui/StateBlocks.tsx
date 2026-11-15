import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-8 flex flex-col items-center justify-center text-center">
      <div className="w-10 h-10 rounded-[4px] bg-[#F7F7F2] border border-[#E4E6DF] flex items-center justify-center text-[#727A75]">
        {icon ?? <Inbox size={18} strokeWidth={1.6} />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[#252A27]">{title}</h3>
      <p className="mt-1 text-xs text-[#727A75] max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#496B54] hover:bg-[#3D5B47] rounded-[4px] transition-colors whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Retry Action',
}: ErrorStateProps) {
  return (
    <div
      className="bg-[#FDF7F6] border border-[#E6C5C0] rounded-[4px] p-4 flex items-start justify-between gap-4"
      role="alert"
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle size={16} strokeWidth={1.75} className="text-[#A64438] mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#7E3128]">{title}</div>
          <div className="text-xs text-[#8D433A] mt-0.5 leading-relaxed">{message}</div>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7E3128] bg-white border border-[#DFB5AF] rounded-[4px] hover:bg-[#FAF0EE] transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw size={12} strokeWidth={1.75} />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-3" aria-busy="true">
      <div className="h-4 w-40 bg-[#ECEDE7] rounded-[2px] animate-pulse" />
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-9 w-full bg-[#F2F3EE] rounded-[2px] animate-pulse" />
      ))}
    </div>
  );
}
