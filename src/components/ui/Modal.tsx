import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = 'max-w-xl',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#252A27]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`w-full ${maxWidthClass} bg-white border border-[#E4E6DF] rounded-[4px] shadow-lg overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="px-5 py-3.5 border-b border-[#E4E6DF] flex items-start justify-between gap-4 bg-[#F7F7F2]/60">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-sm font-semibold text-[#252A27] truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#727A75] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[4px] text-[#727A75] hover:text-[#252A27] hover:bg-[#E4E6DF]/50 transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <p className="text-sm text-[#252A27] leading-relaxed">{message}</p>
      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 text-xs font-medium text-[#252A27] bg-white border border-[#E4E6DF] rounded-[4px] hover:bg-[#F7F7F2] transition-colors whitespace-nowrap shrink-0"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-3.5 py-2 text-xs font-medium text-white rounded-[4px] transition-colors whitespace-nowrap shrink-0 ${
            destructive
              ? 'bg-[#A64438] hover:bg-[#8E382D]'
              : 'bg-[#496B54] hover:bg-[#3D5B47]'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
