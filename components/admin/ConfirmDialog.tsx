'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmDialogProps = {
  options: ConfirmOptions;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal confirmation for destructive actions. Prevents accidental deletion
 * from a single tap: focus starts on the cancel button, Escape cancels and
 * Tab is trapped inside the dialog.
 */
export function ConfirmDialog({ options, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-sm border border-paper/20 bg-[#1a1a1a] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-paper/70" aria-hidden="true" />
          <div>
            <h2 id="confirm-title" className="text-base font-semibold tracking-tight text-paper">
              {options.title}
            </h2>
            <div
              id="confirm-message"
              className="mt-2 text-sm leading-relaxed text-paper/65"
            >
              {options.message}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel} disabled={busy}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ?? false}
          >
            {busy ? 'Deleting…' : (options.confirmLabel ?? 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
