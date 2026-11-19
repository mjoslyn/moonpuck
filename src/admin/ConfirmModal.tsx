// A confirmation in the admin's own style, in place of the browser's confirm box: a title, what will happen,
// and two buttons. Cancel has the focus first (a slip of Enter doesn't do it); Escape or a click outside
// cancels. Used for turning share links off and deleting comments.
import { useEffect, useRef, type ReactNode } from 'react';

export default function ConfirmModal({ title, children, confirmLabel, danger = true, busy = false, onConfirm, onCancel }: { title: string; children?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const before = useRef<Element | null>(null);
  useEffect(() => {
    before.current = document.activeElement;
    cancel.current?.focus();
    return () => (before.current as HTMLElement | null)?.focus?.();
  }, []);
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-admin-ink/45 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          if (!busy) onCancel();
        }
        // Keep the focus inside the modal.
        if (e.key === 'Tab') {
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')];
          const i = items.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey ? i <= 0 : i === items.length - 1) {
            e.preventDefault();
            items[e.shiftKey ? items.length - 1 : 0]?.focus();
          }
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" className="w-full max-w-sm rounded-lg bg-white p-5 text-sm shadow-2xl">
        <div className="flex items-start gap-3">
          {danger && (
            <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c4592a]/10 text-[#c4592a]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-admin-ink">
              {title}
            </h2>
            <div id="confirm-body" className="mt-1 text-admin-muted">
              {children}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className="rounded border border-admin-ink/15 px-3.5 py-1.5 font-medium hover:border-admin-ink/40 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`rounded px-3.5 py-1.5 font-medium text-white disabled:opacity-60 ${danger ? 'bg-[#c4592a] hover:bg-[#a8481f]' : 'bg-admin-ink hover:bg-admin-accent'}`}>
            {busy ? 'One moment…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
