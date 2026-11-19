// A comment box that suggests editors and admins to @mention (src/lib/share/mentions.ts; the list from GET
// /api/admin/share-comments?people). Typing @ and the start of a handle or name lists those who match:
// arrows choose, Enter or Tab puts the @handle in, Escape closes the list. The page editor's Comments panel
// and the campaign screen use it; `withMentions` shows a comment with its @handles in bold.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MentionPerson {
  id: string;
  name: string;
  handle: string;
}

let people: Promise<MentionPerson[]> | null = null;
/** The people to mention, read once per page. */
function loadPeople(): Promise<MentionPerson[]> {
  people ??= fetch('/api/admin/share-comments?people=1')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return people;
}

/** The @ being typed just before the caret: where it starts and what follows it. */
function typing(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(^|[^\w@.])@([a-z0-9._-]*)$/i);
  return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null;
}

export default function MentionTextarea({ value, onChange, className, rows, maxLength, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; className?: string; rows?: number; maxLength?: number; placeholder?: string; ariaLabel?: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [all, setAll] = useState<MentionPerson[]>([]);
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    loadPeople().then(setAll);
  }, []);

  const matches = at ? all.filter((p) => p.handle.startsWith(at.query) || p.name.toLowerCase().includes(at.query)).slice(0, 6) : [];
  const open = matches.length > 0;

  const look = (el: HTMLTextAreaElement) => {
    setAt(typing(el.value, el.selectionStart ?? el.value.length));
    setActive(0);
  };
  const pick = (p: MentionPerson) => {
    const el = box.current;
    if (!el || !at) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, at.start)}@${p.handle} ${value.slice(caret)}`;
    onChange(next);
    setAt(null);
    const pos = at.start + p.handle.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={box}
        className={className}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          look(e.target);
        }}
        onClick={(e) => look(e.currentTarget)}
        onBlur={() => setTimeout(() => setAt(null), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setAt(null);
          }
        }}
      />
      {open && (
        <ul role="listbox" className="absolute left-0 z-10 mt-1 max-h-56 w-64 overflow-auto rounded border border-admin-ink/15 bg-white py-1 text-sm shadow-lg">
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-admin-accent/10' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <span className="font-medium">@{p.handle}</span> <span className="text-admin-muted">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A comment's text with its @handles in bold. */
export function withMentions(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/(^|[^\w@.])(@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/gi)) {
    const start = (m.index ?? 0) + m[1].length;
    out.push(text.slice(last, start), <strong key={start}>{m[2]}</strong>);
    last = start + m[2].length;
  }
  out.push(text.slice(last));
  return out;
}
