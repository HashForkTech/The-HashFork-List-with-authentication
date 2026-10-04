'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

type UnsavedChangesDialogProps = {
  busy?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
};

/**
 * Modal warning shown when the admin tries to leave an editing form that
 * holds unsaved changes. Offers three explicit choices — save, discard or
 * keep editing — and follows the same conventions as `ConfirmDialog`: focus
 * starts on the safest action ("Keep editing"), Escape keeps editing and Tab
 * is trapped inside the dialog.
 */
export function UnsavedChangesDialog({ busy, onSave, onDiscard, onStay }: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onStay();
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
  }, [onStay]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-message"
        className="w-full max-w-sm rounded-sm border border-paper/20 bg-[#1a1a1a] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-paper/70" aria-hidden="true" />
          <div>
            <h2 id="unsaved-title" className="text-base font-semibold tracking-tight text-paper">
              Unsaved changes
            </h2>
            <div id="unsaved-message" className="mt-2 text-sm leading-relaxed text-paper/65">
              <p>You have unsaved changes. Save them before leaving, discard them, or keep editing.</p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={stayRef}
            type="button"
            className="btn"
            onClick={onStay}
            disabled={busy}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDiscard}
            disabled={busy}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={busy}
            aria-busy={busy ?? false}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
