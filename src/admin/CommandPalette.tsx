// The command palette: Ctrl+K (⌘K on a Mac) on any admin screen, or the search button in the admin bar.
// Type to go to a screen (src/lib/admin/commands.ts), a Settings section (admins) or an entry, found by
// its title among the types the admin shows (GET /api/admin/commands); arrows choose, Enter opens, Escape closes. In rich text
// (contenteditable) the shortcut is left to the editor.
import { useEffect, useRef, useState } from 'react';
import { matchCommands, type Command } from '../lib/admin/commands';

export const OPEN_EVENT = 'admin-palette:open';

interface Props {
  commands: Command[];
}

export default function CommandPalette({ commands }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Command[]>([]);
  const [active, setActive] = useState(0);

  const open = () => {
    if (dialog.current?.open) return;
    setQ('');
    setActive(0);
    dialog.current?.showModal();
    box.current?.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'k' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('[contenteditable="true"]')) return;
      e.preventDefault();
      if (dialog.current?.open) dialog.current.close();
      else open();
    };
    document.addEventListener('keydown', key);
    document.addEventListener(OPEN_EVENT, open);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener(OPEN_EVENT, open);
    };
  }, []);

  // Entries by title (GET /api/admin/commands), a moment after typing stops.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setEntries([]);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/commands?only=entries&q=${encodeURIComponent(term)}`, { cache: 'no-store' }).catch(() => null);
      setEntries(r?.ok ? ((await r.json()).commands as Command[]) : []);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const found = [...matchCommands(q, commands), ...entries];
  const at = Math.min(active, Math.max(found.length - 1, 0));
  const go = (c: Command | undefined, newTab = false) => {
    if (!c) return;
    if (newTab) window.open(c.href, '_blank', 'noopener');
    else location.href = c.href;
    dialog.current?.close();
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Go to"
      className="fixed top-[12vh] mx-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-admin-ink/10 bg-white p-0 text-admin-ink shadow-2xl backdrop:bg-black/30"
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <input
        ref={box}
        type="search"
        role="combobox"
        aria-expanded={found.length > 0}
        aria-controls="admin-palette-list"
        aria-activedescendant={found.length ? `admin-palette-${at}` : undefined}
        aria-label="Go to a screen, setting or entry"
        placeholder="Go to a screen, setting or entry…"
        className="w-full border-0 border-b border-admin-ink/10 px-4 py-3 text-base outline-none"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((at + 1) % Math.max(found.length, 1)));
          if (e.key === 'ArrowUp') (e.preventDefault(), setActive((at - 1 + found.length) % Math.max(found.length, 1)));
          if (e.key === 'Enter') (e.preventDefault(), go(found[at], e.metaKey || e.ctrlKey));
          // A search field's Escape would only clear it: close at once.
          if (e.key === 'Escape') (e.preventDefault(), dialog.current?.close());
        }}
      />
      <ul id="admin-palette-list" role="listbox" className="m-0 max-h-[50vh] list-none overflow-y-auto p-1">
        {found.map((c, i) => (
          <li key={`${c.href}-${i}`} id={`admin-palette-${i}`} role="option" aria-selected={i === at}>
            <a
              href={c.href}
              onMouseMove={() => setActive(i)}
              onClick={() => dialog.current?.close()}
              className={`flex items-center gap-3 rounded px-3 py-2 text-sm ${i === at ? 'bg-admin-soft text-admin-ink' : 'text-admin-ink'}`}
            >
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="shrink-0 text-xs text-admin-muted">{c.group}</span>
            </a>
          </li>
        ))}
        {!found.length && <li className="px-3 py-2 text-sm text-admin-muted">Nothing matches.</li>}
      </ul>
      <p className="m-0 border-t border-admin-ink/10 px-4 py-2 text-xs text-admin-muted">↑ ↓ to choose · Enter to open · Esc to close</p>
    </dialog>
  );
}
