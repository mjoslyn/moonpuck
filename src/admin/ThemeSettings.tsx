// Settings > Theme: the site's look as settings (src/lib/theme/theme.ts): its palette, the colours that
// play the core's roles, the colours inside dark bands, buttons, fonts, text sizes, spacing, the content
// widths and a logo. Saved with Save settings; until then the site keeps the theme it has (the one saved,
// else the site's code's, else the core's).
import { useMemo, useState, type ReactNode } from 'react';
import { BANDS, BUTTONS, ROLES, isColor, resolveColor, slugFrom, type Theme, type ThemeColor, type ThemeSize } from '../lib/theme/theme';
import { FONT_LIBRARY, fontFaces, fontStack } from '../lib/theme/fonts';
import { codeTheme } from '../lib/theme/site';
import { MediaPicker, inputClass } from '../puck/fields';

const small = 'rounded-sm border border-admin-ink/20 bg-white px-2 py-0.5 text-xs hover:border-admin-ink/50 disabled:opacity-30';

/** A colour setting: one of the palette's colours, a colour of its own, or (when `none` is given) nothing. */
function ColorRef({ label, value, colors, none, onChange }: { label: string; value: string | undefined; colors: ThemeColor[]; none?: string; onChange: (v: string | undefined) => void }) {
  const inPalette = !!value && colors.some((c) => c.slug === value);
  const custom = !!value && !inPalette;
  const shown = resolveColor({ colors } as Theme, value);
  return (
    <label className="mb-2 flex items-center gap-2 text-sm">
      <span className="inline-block h-5 w-5 shrink-0 rounded-full border border-admin-ink/20" style={{ background: shown ?? 'transparent' }} aria-hidden="true" />
      <span className="w-48 shrink-0">{label}</span>
      <select className={inputClass} value={custom ? '#custom' : (value ?? '')} onChange={(e) => onChange(e.target.value === '#custom' ? shown ?? '#000000' : e.target.value || undefined)}>
        {none !== undefined && <option value="">{none}</option>}
        {colors.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
        <option value="#custom">A colour of its own…</option>
      </select>
      {custom && <input aria-label={`${label}: colour`} className={`${inputClass} w-28`} value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function SizeList({ title, hint, sizes, prefix, onChange }: { title: string; hint: string; sizes: ThemeSize[]; prefix: string; onChange: (s: ThemeSize[]) => void }) {
  const set = (i: number, patch: Partial<ThemeSize>) => onChange(sizes.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <Group title={title} hint={hint}>
      {sizes.map((s, i) => (
        <div key={s.slug} className="mb-1 flex items-center gap-2 text-sm">
          <code className="w-28 shrink-0 text-xs text-admin-muted">{prefix}{s.slug}</code>
          <input aria-label={`${s.slug}: name`} className={`${inputClass} w-40`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input aria-label={`${s.slug}: size`} className={inputClass} value={s.size} onChange={(e) => set(i, { size: e.target.value })} />
        </div>
      ))}
    </Group>
  );
}

/** One part of the Theme screen: every part has the same heading, a hint under it and a rule above. */
export function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6 border-t border-admin-ink/10 pt-5" aria-label={title}>
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      {hint ? <p className="mt-1 mb-3 text-xs text-admin-muted">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export default function ThemeSettings({ value, onChange }: { value: Theme | undefined; onChange: (t: Theme | undefined) => void }) {
  const fallback = useMemo(() => codeTheme(), []);
  const theme = value ?? fallback;
  const [newName, setNewName] = useState('');
  const put = (patch: Partial<Theme>) => onChange({ ...theme, ...patch });
  const colors = theme.colors;
  const setColor = (i: number, patch: Partial<ThemeColor>) => put({ colors: colors.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const move = (i: number, by: number) => {
    const next = [...colors];
    const [c] = next.splice(i, 1);
    next.splice(i + by, 0, c);
    put({ colors: next });
  };
  // A colour still named somewhere can't go: the roles, bands, buttons and shades would point at nothing.
  const usedBy = (slug: string) =>
    [...Object.values(theme.roles), ...Object.values(theme.bands), ...Object.values(theme.buttons), ...colors.map((c) => c.onDark)].includes(slug);
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    let slug = slugFrom(name);
    for (let n = 2; colors.some((c) => c.slug === slug); n++) slug = `${slugFrom(name)}-${n}`;
    put({ colors: [...colors, { slug, name, color: '#888888' }] });
    setNewName('');
  };
  const c = (v: string | undefined) => resolveColor(theme, v);
  const faces = fontFaces([theme.fonts.heading, theme.fonts.body]);

  return (
    <div>
      <p className="mb-4 text-sm text-admin-muted">
        The site's colours, fonts and sizes. Pages, the editor and Compose use them; content names a colour by its name, so changing a colour here changes it everywhere.{' '}
        {value ? (
          <button type="button" className="text-admin-accent hover:underline" onClick={() => onChange(undefined)}>
            Go back to the site's starting theme
          </button>
        ) : (
          <span>This is the site's starting theme; saving keeps your changes.</span>
        )}
      </p>
      {faces && <style>{faces}</style>}

      {/* Preview: the page, then a dark band. */}
      <div className="mb-6 overflow-hidden rounded-sm border border-admin-ink/10" aria-label="Preview">
        <div className="p-5" style={{ background: c(theme.roles.surface) ?? '#fff', color: c(theme.roles.text) }}>
          <p className="m-0 text-2xl" style={{ fontFamily: fontStack(theme.fonts.heading, 'Georgia, serif') }}>
            A heading in the theme
          </p>
          <p className="my-2 text-sm" style={{ fontFamily: fontStack(theme.fonts.body, 'system-ui') }}>
            Body text, <span style={{ color: c(theme.roles.muted) }}>muted text</span> and <span style={{ color: c(theme.roles.accent), textDecoration: 'underline' }}>a link</span>.
          </p>
          <span className="inline-block px-3 py-1.5 text-sm" style={{ background: c(theme.buttons.bg ?? theme.roles['accent-fill'] ?? theme.roles.accent), color: c(theme.buttons.color ?? theme.roles['on-accent']) ?? '#fff', fontFamily: fontStack(theme.fonts.body, 'system-ui') }}>
            A button
          </span>
        </div>
        <div className="p-5" style={{ background: c(theme.roles.dark), color: c(theme.bands.text ?? theme.roles['on-dark']) ?? '#fff' }}>
          <p className="m-0 text-xl" style={{ fontFamily: fontStack(theme.fonts.heading, 'Georgia, serif'), color: c(theme.bands.heading) }}>
            On a dark band
          </p>
          <p className="my-2 text-sm" style={{ fontFamily: fontStack(theme.fonts.body, 'system-ui') }}>
            <span style={{ color: c(theme.bands.muted) }}>Muted text</span> and <span style={{ color: c(theme.bands.accent ?? theme.roles.accent), textDecoration: 'underline' }}>a link</span>.
          </p>
        </div>
      </div>

      <Group title="Colours" hint="The palette. Content and the editor's colour choices use these names. Mark the dark ones: a section on a dark colour takes the colours set for dark backgrounds below.">
        {colors.map((col, i) => (
          <div key={col.slug} className="mb-2 rounded-sm border border-admin-ink/10 bg-white p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input type="color" aria-label={`${col.name}: pick a colour`} value={/^#[0-9a-f]{6}$/i.test(col.color) ? col.color : '#000000'} onChange={(e) => setColor(i, { color: e.target.value })} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" />
              <input aria-label={`${col.name}: name`} className={`${inputClass} w-40`} value={col.name} onChange={(e) => setColor(i, { name: e.target.value })} />
              <input aria-label={`${col.name}: colour`} className={`${inputClass} w-28`} value={col.color} onChange={(e) => setColor(i, { color: e.target.value })} />
              {!isColor(col.color) && <span className="text-xs text-[#b3261e]">Not a colour</span>}
              <code className="text-xs text-admin-muted">--color-{col.slug}</code>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!col.dark} onChange={(e) => setColor(i, { dark: e.target.checked || undefined })} /> Dark background
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!col.hidden} onChange={(e) => setColor(i, { hidden: e.target.checked || undefined })} /> Not in the editor's choices
              </label>
              <label className="flex items-center gap-1">
                On dark backgrounds:
                <select className="rounded-sm border border-admin-ink/20 px-1 py-0.5" value={col.onDark && colors.some((x) => x.slug === col.onDark) ? col.onDark : col.onDark ? '#custom' : ''} onChange={(e) => setColor(i, { onDark: e.target.value === '#custom' ? (c(col.onDark) ?? col.color) : e.target.value || undefined })}>
                  <option value="">Unchanged</option>
                  {colors
                    .filter((x) => x.slug !== col.slug)
                    .map((x) => (
                      <option key={x.slug} value={x.slug}>
                        {x.name}
                      </option>
                    ))}
                  <option value="#custom">A colour of its own…</option>
                </select>
                {col.onDark && !colors.some((x) => x.slug === col.onDark) && <input aria-label={`${col.name} on dark backgrounds`} className="w-24 rounded-sm border border-admin-ink/20 px-1 py-0.5" value={col.onDark} onChange={(e) => setColor(i, { onDark: e.target.value })} />}
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${col.name} up`}>↑</button>
                <button type="button" className={small} disabled={i === colors.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${col.name} down`}>↓</button>
                <button type="button" className={`${small} text-[#b3261e]`} disabled={usedBy(col.slug) || colors.length === 1} title={usedBy(col.slug) ? 'Used by a role, a dark-band colour, a button or a shade' : undefined} onClick={() => put({ colors: colors.filter((_, k) => k !== i) })}>
                  Remove
                </button>
              </span>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <input aria-label="New colour's name" className={`${inputClass} w-48`} placeholder="New colour's name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button type="button" className={small} onClick={add} disabled={!newName.trim()}>
            Add colour
          </button>
        </div>
      </Group>

      <Group title="What each colour is for" hint="The site's styles use these roles: text, links and buttons follow them.">
        {ROLES.map(([k, label]) => (
          <ColorRef key={k} label={label} value={theme.roles[k]} colors={colors} none="Not set" onChange={(v) => put({ roles: { ...theme.roles, [k]: v } })} />
        ))}
      </Group>

      <Group title="On dark backgrounds" hint="Inside sections on a dark colour, and on covers and heroes. Unchanged: as elsewhere (with each colour's dark-background shade, set above).">
        {BANDS.map(([k, label]) => (
          <ColorRef key={k} label={label} value={theme.bands[k]} colors={colors} none="Unchanged" onChange={(v) => put({ bands: { ...theme.bands, [k]: v } })} />
        ))}
      </Group>

      <Group title="Buttons" hint="Default: the button fill, with the text on the accent.">
        {BUTTONS.map(([k, label]) => (
          <ColorRef key={k} label={label} value={theme.buttons[k]} colors={colors} none="Default" onChange={(v) => put({ buttons: { ...theme.buttons, [k]: v } })} />
        ))}
      </Group>

      <Group title="Fonts" hint="Served from the site, so pages don't wait on another site's fonts.">
        {(['heading', 'body'] as const).map((k) => {
          const current = theme.fonts[k];
          const own = current && !FONT_LIBRARY.some((f) => f.id === current);
          return (
            <label key={k} className="mb-2 flex items-center gap-2 text-sm">
              <span className="w-48 shrink-0">{k === 'heading' ? 'Headings' : 'Text'}</span>
              <select className={inputClass} value={current ?? ''} onChange={(e) => put({ fonts: { ...theme.fonts, [k]: e.target.value || undefined } })}>
                {own && <option value={current}>The site's own: {current}</option>}
                {(['sans', 'serif', 'display', 'system'] as const).map((kind) => (
                  <optgroup key={kind} label={{ sans: 'Sans-serif', serif: 'Serif', display: 'Display (headings)', system: "The device's own" }[kind]}>
                    {FONT_LIBRARY.filter((f) => f.kind === kind).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          );
        })}
      </Group>

      <SizeList title="Text sizes" hint="var(--text-<name>). A size can be a CSS length, or a clamp() that grows with the screen." sizes={theme.fontSizes} prefix="--text-" onChange={(s) => put({ fontSizes: s })} />
      <SizeList title="Spacing" hint="var(--space-<name>): the gaps and padding the editor offers." sizes={theme.spacing} prefix="--space-" onChange={(s) => put({ spacing: s })} />

      <Group title="Layout">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <span className="w-48 shrink-0">Text width</span>
          <input className={`${inputClass} w-32`} value={theme.layout.content ?? ''} placeholder="720px" onChange={(e) => put({ layout: { ...theme.layout, content: e.target.value || undefined } })} />
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <span className="w-48 shrink-0">Wide width</span>
          <input className={`${inputClass} w-32`} value={theme.layout.wide ?? ''} placeholder="1280px" onChange={(e) => put({ layout: { ...theme.layout, wide: e.target.value || undefined } })} />
        </label>
      </Group>

      <Group title="Logo" hint={'Shown by a Site title block with "Show the logo instead" on, in place of the icon and name.'}>
        <MediaPicker title="Logo" hideTitle url={theme.logo_url} mediaId={theme.logo} fit="contain" onSelect={(m) => put({ logo: m.id ?? m.mediaId ?? undefined, logo_url: m.url })} />
        {!!theme.logo && (
          <button type="button" className="mb-3 block text-xs text-[#b3261e]" onClick={() => put({ logo: undefined, logo_url: undefined })}>
            Remove logo
          </button>
        )}
      </Group>
    </div>
  );
}
