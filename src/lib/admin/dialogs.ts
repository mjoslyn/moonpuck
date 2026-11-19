// The admin's own confirm, message and question boxes, in place of the browser's confirm(), alert() and
// prompt() (browser only). Each opens a modal in the admin's style and answers a promise: `ask` (true for the
// confirming button, false for Cancel, Escape or a click outside), `tell` (one OK button) and `askText` (a
// text box; null when cancelled). Cancel, or OK, has the focus first, so a slip of Enter never confirms;
// Tab stays inside; the focus goes back where it was. `installDialogs` (src/layouts/AdminTheme.astro, every
// admin page) puts them on `window` (`adminAsk`, `adminTell`, `adminAskText`) for pages' inline scripts and
// asks first for any form with `data-confirm` (its words) before it is sent. The React screens use
// ConfirmModal (src/admin/ConfirmModal.tsx) where the box is part of the screen, and these elsewhere.

export interface AskOptions {
  /** The heading; else the message is the heading. */
  title?: string;
  /** The confirming button's words (default OK). */
  confirm?: string;
  /** The cancelling button's words (default Cancel). */
  cancel?: string;
  /** A destructive action: the button in red, with a warning sign. */
  danger?: boolean;
}

/** Words in the message that suggest an action can't be taken back. */
const DANGER = /\b(delete|remove|erase|refund|cancel|discard|unsubscribe|turn off|clear|replace|overwrite|take this page off|for good|can['’]t be)/i;

const STYLE_ID = 'admin-dialog-style';
const CSS = `
.adm-dlg{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgb(26 26 46 / .45);font:14px/1.45 var(--font-admin, system-ui, sans-serif);animation:adm-dlg-in .12s ease-out}
.adm-dlg__box{width:100%;max-width:26rem;border-radius:12px;background:#fff;color:var(--color-admin-ink,#1a1a2e);padding:20px;box-shadow:0 20px 50px rgb(0 0 0 / .25)}
.adm-dlg__row{display:flex;gap:12px;align-items:flex-start}
.adm-dlg__sign{flex:none;display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:999px;background:rgb(196 89 42 / .1);color:#c4592a}
.adm-dlg__title{margin:0;font-size:16px;font-weight:600}
.adm-dlg__msg{margin:4px 0 0;color:var(--color-admin-muted,#555f6d);white-space:pre-line;overflow-wrap:anywhere}
.adm-dlg__input{box-sizing:border-box;width:100%;margin-top:12px;border:1px solid rgb(26 26 46 / .2);border-radius:6px;padding:8px 10px;font:inherit;outline:none}
.adm-dlg__input:focus{border-color:var(--color-admin-accent,#b87333);box-shadow:0 0 0 3px rgb(184 115 51 / .15)}
.adm-dlg__buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.adm-dlg__buttons button{border-radius:6px;padding:7px 14px;font:inherit;font-weight:500;cursor:pointer}
.adm-dlg__cancel{border:1px solid rgb(26 26 46 / .15);background:#fff;color:inherit}
.adm-dlg__cancel:hover{border-color:rgb(26 26 46 / .4)}
.adm-dlg__ok{border:0;background:var(--color-admin-ink,#1a1a2e);color:#fff}
.adm-dlg__ok:hover{background:var(--color-admin-accent,#b87333)}
.adm-dlg__ok.is-danger{background:#c4592a}
.adm-dlg__ok.is-danger:hover{background:#a8481f}
@keyframes adm-dlg-in{from{opacity:0}to{opacity:1}}`;

const WARNING = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

/** Verbs a question can start with that make a better button than OK ("Delete this campaign?": Delete). */
const VERBS = ['Delete', 'Remove', 'Erase', 'Refund', 'Discard', 'Unsubscribe', 'Clear', 'Replace', 'Buy', 'Email', 'Put', 'Start', 'Make', 'Save', 'Resume', 'Allow', 'Duplicate', 'Restore', 'Go'];

/** The confirming button's words from the question, when it starts with one of `VERBS`. */
function verbOf(message: string): string | undefined {
  const first = message.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '');
  if (first === 'Cancel') return 'Cancel it';
  return VERBS.includes(first) ? first : undefined;
}

let count = 0;

function open<T>(kind: 'ask' | 'tell' | 'text', message: string, opts: AskOptions & { value?: string }, done: (ok: boolean, text: string) => T): Promise<T> {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.append(s);
  }
  const id = `adm-dlg-${++count}`;
  const danger = kind === 'ask' && (opts.danger ?? DANGER.test(`${opts.title ?? ''} ${message} ${opts.confirm ?? ''}`));
  const back = document.activeElement as HTMLElement | null;
  const shade = document.createElement('div');
  shade.className = 'adm-dlg';
  const box = document.createElement('div');
  box.className = 'adm-dlg__box';
  box.setAttribute('role', kind === 'tell' ? 'dialog' : 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', `${id}-t`);
  const row = document.createElement('div');
  row.className = 'adm-dlg__row';
  if (danger) {
    const sign = document.createElement('span');
    sign.className = 'adm-dlg__sign';
    sign.innerHTML = WARNING;
    row.append(sign);
  }
  const words = document.createElement('div');
  words.style.minWidth = '0';
  words.style.flex = '1';
  const title = document.createElement('h2');
  title.className = 'adm-dlg__title';
  title.id = `${id}-t`;
  title.textContent = opts.title ?? message;
  words.append(title);
  if (opts.title) {
    const msg = document.createElement('p');
    msg.className = 'adm-dlg__msg';
    msg.id = `${id}-m`;
    msg.textContent = message;
    words.append(msg);
    box.setAttribute('aria-describedby', msg.id);
  }
  let input: HTMLInputElement | null = null;
  if (kind === 'text') {
    input = document.createElement('input');
    input.className = 'adm-dlg__input';
    input.value = opts.value ?? '';
    input.setAttribute('aria-labelledby', title.id);
    words.append(input);
  }
  row.append(words);
  const buttons = document.createElement('div');
  buttons.className = 'adm-dlg__buttons';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = `adm-dlg__ok${danger ? ' is-danger' : ''}`;
  ok.textContent = opts.confirm ?? (kind === 'ask' ? verbOf(opts.title ?? message) : undefined) ?? 'OK';
  let cancel: HTMLButtonElement | null = null;
  if (kind !== 'tell') {
    cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'adm-dlg__cancel';
    // "Cancel this order?" Cancel / Cancel it reads badly: keep it, then.
    cancel.textContent = opts.cancel ?? (ok.textContent === 'Cancel it' ? 'Keep it' : 'Cancel');
    buttons.append(cancel);
  }
  buttons.append(ok);
  box.append(row, buttons);
  shade.append(box);
  document.body.append(shade);
  (input ?? cancel ?? ok).focus();
  input?.select();

  return new Promise<T>((resolve) => {
    const finish = (yes: boolean) => {
      shade.remove();
      document.removeEventListener('keydown', keys, true);
      back?.focus?.();
      resolve(done(yes, input?.value ?? ''));
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(kind === 'tell');
      } else if (e.key === 'Enter' && input && document.activeElement === input) {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Tab') {
        const items = [input, cancel, ok].filter(Boolean) as HTMLElement[];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey ? i <= 0 : i === items.length - 1) {
          e.preventDefault();
          items[e.shiftKey ? items.length - 1 : 0].focus();
        }
      }
    };
    document.addEventListener('keydown', keys, true);
    ok.addEventListener('click', () => finish(true));
    cancel?.addEventListener('click', () => finish(false));
    shade.addEventListener('mousedown', (e) => e.target === shade && finish(kind === 'tell'));
  });
}

/** Ask before doing something: true to go ahead. */
export const ask = (message: string, opts: AskOptions = {}): Promise<boolean> => open('ask', message, opts, (yes) => yes);

/** Say something, with an OK button. */
export const tell = (message: string, opts: Pick<AskOptions, 'title' | 'confirm'> = {}): Promise<void> => open('tell', message, opts, () => undefined);

/** Ask for a line of text: what was typed, or null when cancelled. */
export const askText = (message: string, value = '', opts: AskOptions = {}): Promise<string | null> => open('text', message, { ...opts, value }, (yes, text) => (yes ? text : null));

declare global {
  interface Window {
    adminAsk: typeof ask;
    adminTell: typeof tell;
    adminAskText: typeof askText;
  }
}

/** Put the boxes on `window` and ask first for forms with `data-confirm`. */
export function installDialogs() {
  window.adminAsk = ask;
  window.adminTell = tell;
  window.adminAskText = askText;
  const asked = new WeakSet<HTMLFormElement>();
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.confirm) return;
      if (asked.has(form)) {
        asked.delete(form);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
      ask(form.dataset.confirm, { confirm: form.dataset.confirmLabel || undefined }).then((yes) => {
        if (!yes) return;
        asked.add(form);
        // requestSubmit keeps the button pressed (its name and value) and the form's own listeners.
        if (form.requestSubmit) form.requestSubmit(submitter && form.contains(submitter) ? submitter : undefined);
        else form.submit();
      });
    },
    true,
  );
}
