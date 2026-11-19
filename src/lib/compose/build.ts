// Page plan -> the site's components, in the house style: each section is a full-width band with an
// eyebrow, an accent rule and a heading. Colors, fonts, spacing, widths and corners come from the site
// config's `compose` (role tokens and the defaults below otherwise).
import type { PuckItem } from '../puck/types';
import { cardTemplate, DEFAULT_CARD } from '../content/card-presets';
import type { PagePlan, PlanButton, PlanSection } from './spec';
import { site, typeDef } from '../site';

export interface ImageMaterial { mediaId: number; src: string; alt: string }
export type VideoMaterial = { kind: 'embed'; url: string; provider: 'youtube' | 'vimeo'; html: string; title?: string } | { kind: 'file'; src: string; mediaId: number; title?: string };
export interface BuildMaterials {
  images: Map<string, ImageMaterial>;
  videos: Map<string, VideoMaterial>;
  /** Tag name (lowercase) -> term id. */
  tags: Map<string, number>;
}

const STYLE = site.compose ?? {};
const BG: Record<string, string> = { plain: 'var(--color-surface)', tint: 'var(--color-surface-alt)', soft: 'var(--color-surface-soft)', dark: 'var(--color-dark)', ...STYLE.bands };
const BODY = STYLE.body ?? 'var(--color-muted)';
const ON_DARK = STYLE.onDark ?? 'var(--color-on-dark)';
const ACCENT = STYLE.accent ?? 'var(--color-accent)';
const CARD = STYLE.card ?? 'var(--color-surface)';
/** Band names in plans written before they were generic (the site's own, from its config). */
const bandOf = (b: string | undefined) => (b ? (STYLE.bandNames?.[b] ?? b) : undefined);
// The house style's shapes and type, each a site setting (config `compose`) with these defaults.
const HEADING_FONT = STYLE.headingFont ?? 'var(--font-display)';
const RULE = STYLE.rule !== false;
const BODY_SIZE = STYLE.bodySize ?? 'clamp(0.875rem, 0.875rem + ((1vw - 0.2rem) * 0.417), 1.125rem)';
const BODY_WEIGHT = STYLE.bodyWeight ?? '300';
const BODY_LINE_HEIGHT = STYLE.bodyLineHeight ?? '1.8';
const PAD_BLOCK = STYLE.bandPadding?.block ?? 'var(--space-80)';
const PAD_INLINE = STYLE.bandPadding?.inline ?? 'var(--space-50)';
const PAD = { top: PAD_BLOCK, right: PAD_INLINE, bottom: PAD_BLOCK, left: PAD_INLINE };
const TEXT_WIDTH = STYLE.textWidth ?? '720px';
const WIDE_WIDTH = STYLE.wideWidth ?? '1280px';
const RADIUS = STYLE.radius ?? '6px';
const BUTTON_RADIUS = STYLE.buttonRadius ?? '2px';
const BUTTON_CAPS = STYLE.buttonCaps !== false;

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeUrl = (u: string) => (/^(https?:|mailto:|tel:|\/|#)/i.test(u.trim()) ? u.trim() : '#');
/** A safe address for an href written into HTML. */
const hrefAttr = (u: string) => escHtml(safeUrl(u)).replace(/"/g, '&quot;');

/** Simple Markdown as plain text (for blocks that show text, not HTML). */
const plainText = (md: string | undefined) =>
  (md ?? '')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*|\*([^*\n]+)\*/g, '$1$2')
    .replace(/^\s*(?:#{1,6}|[-*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Inline Markdown: **bold**, *italic*, [text](url). */
export function inline(md: string): string {
  return escHtml(md)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u).replace(/"/g, '&quot;')}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

export function buildPage(plan: PagePlan, m: BuildMaterials, prefix = `c${Date.now().toString(36)}`): PuckItem[] {
  let n = 0;
  const id = (t: string) => `${prefix}-${t}-${n++}`;
  const node = (type: string, attrs: Record<string, any>, children?: PuckItem[]): PuckItem => ({ type, props: { id: id(type), attrs, ...(children ? { children } : {}) } }) as PuckItem;

  const bodyStyle = (dark: boolean) => ({ color: dark ? ON_DARK : BODY, fontSize: BODY_SIZE, fontWeight: BODY_WEIGHT, lineHeight: BODY_LINE_HEIGHT });

  /** Simple Markdown -> text, list and subheading blocks. */
  function body(md: string | undefined, dark: boolean): PuckItem[] {
    if (!md?.trim()) return [];
    const out: PuckItem[] = [];
    for (const block of md.trim().split(/\n\s*\n/)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => /^[-*] /.test(l)) || lines.every((l) => /^\d+[.)] /.test(l))) {
        const ordered = /^\d/.test(lines[0]);
        out.push(node('list', { marker: ordered ? 'number' : 'bullet', style: bodyStyle(dark), items: lines.map((l) => ({ content: inline(l.replace(/^([-*]|\d+[.)]) /, '')) })) }));
      } else if (/^#{2,4} /.test(lines[0])) {
        out.push(node('heading', { level: 3, content: inline(lines[0].replace(/^#+ /, '')), style: { fontFamily: HEADING_FONT, ...(dark ? { color: ON_DARK } : {}) } }));
        if (lines.length > 1) out.push(node('text', { content: lines.slice(1).map(inline).join('<br>'), style: bodyStyle(dark) }));
      } else out.push(node('text', { content: lines.map(inline).join('<br>'), style: bodyStyle(dark) }));
    }
    return out;
  }

  const buttons = (list: PlanButton[] | undefined, dark: boolean, justify = 'left'): PuckItem[] =>
    list?.length
      ? [
          node(
            'buttons',
            { justify, style: { margin: { top: 'var(--space-40)' } } },
            list.map((b) =>
              node('button', {
                href: safeUrl(b.url),
                text: escHtml(b.label),
                ...(b.style === 'outline' ? { variant: 'outline' } : {}),
                ...(/^https?:/i.test(b.url) ? { target: '_blank', rel: 'noopener' } : {}),
                style: { radius: BUTTON_RADIUS, fontSize: '0.875rem', fontWeight: '600', ...(BUTTON_CAPS ? { letterSpacing: '0.06em', textTransform: 'uppercase' } : {}), ...(dark && b.style === 'outline' ? { color: ON_DARK } : {}) },
              }),
            ),
          ),
        ]
      : [];

  /** Eyebrow, accent rule and heading. */
  function header(s: PlanSection, dark: boolean, center = false): PuckItem[] {
    if (!s.heading && !s.eyebrow) return [];
    const kids: PuckItem[] = [];
    if (s.eyebrow) kids.push(node('text', { content: escHtml(s.eyebrow), style: { color: ACCENT, fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.12em', textTransform: 'uppercase', ...(center ? { textAlign: 'center' } : {}) } }));
    if (RULE) kids.push(node('separator', { variant: 'accent', style: { background: ACCENT }, ...(center ? { width: 'center' } : {}) }));
    if (s.heading) kids.push(node('heading', { level: 2, content: inline(s.heading), style: { fontFamily: HEADING_FONT, ...(dark ? { color: ON_DARK } : {}), ...(center ? { textAlign: 'center' } : {}) } }));
    return [node('section', { layout: { type: 'flow' }, gap: 'var(--space-30)' }, kids)];
  }

  // A band spans the page (width: full), its background edge to edge inside a template's content column.
  const band = (s: PlanSection, width: string, children: PuckItem[], fallback = 'plain') =>
    node('section', { width: 'full', style: { background: BG[bandOf(s.background) ?? fallback] ?? BG.plain, padding: PAD }, layout: { type: 'constrained', contentSize: width }, gap: 'var(--space-50)' }, children);

  const img = (ref: string | undefined, attrs: Record<string, any> = {}) => {
    const i = ref ? m.images.get(ref) : undefined;
    return i ? node('image', { mediaId: i.mediaId, src: i.src, alt: i.alt, size: 'large', style: { radius: RADIUS }, ...attrs }) : null;
  };

  function video(ref: string | undefined, caption?: string): PuckItem | null {
    const v = ref ? m.videos.get(ref) : undefined;
    if (!v) return null;
    if (v.kind === 'embed') return node('embed', { url: v.url, provider: v.provider, html: v.html, ratio: 16 / 9, ...(caption ? { caption: escHtml(caption) } : {}) });
    return node('video', { src: v.src, mediaId: v.mediaId, controls: true, ...(caption ? { caption: escHtml(caption) } : {}) });
  }

  const sections = plan.sections.map((s, i): PuckItem | null => {
    const dark = bandOf(s.background) === 'dark';
    switch (s.kind) {
      case 'hero': {
        // The site's Hero block: image, eyebrow, title, text and up to two buttons, edited in its panel.
        const picture = s.image ? m.images.get(s.image) : undefined;
        const [first, second] = s.buttons ?? [];
        const attrs: Record<string, any> = { title: plainText(s.heading ?? plan.title), height: i === 0 ? 'large' : 'medium' };
        if (picture) Object.assign(attrs, { mediaId: picture.mediaId, src: picture.src });
        if (s.eyebrow) attrs.eyebrow = plainText(s.eyebrow);
        if (s.body) attrs.text = plainText(s.body);
        if (first) Object.assign(attrs, { primaryLabel: first.label, primaryHref: safeUrl(first.url) });
        if (second) Object.assign(attrs, { secondaryLabel: second.label, secondaryHref: safeUrl(second.url) });
        if (i > 0) attrs.level = 2;
        return node('hero', attrs);
      }
      case 'text':
        return band(s, TEXT_WIDTH, [...header(s, dark), ...body(s.body, dark), ...buttons(s.buttons, dark)]);
      case 'media_text': {
        const picture = img(s.image);
        const words = [...header(s, dark), ...body(s.body, dark), ...buttons(s.buttons, dark)];
        if (!picture) return band(s, TEXT_WIDTH, words);
        const textCol = node('column', {}, words);
        const imgCol = node('column', {}, [picture]);
        return band(s, WIDE_WIDTH, [node('columns', { gap: { row: '2em', column: 'var(--space-70)' }, verticalAlign: 'center' }, s.image_side === 'right' ? [textCol, imgCol] : [imgCol, textCol])], 'soft');
      }
      case 'cards': {
        const cards = (s.cards ?? []).slice(0, 6).map((c) =>
          node('column', {}, [
            node('section', { layout: { type: 'flow' }, gap: 'var(--space-20)', style: { background: dark ? 'rgba(255,255,255,0.06)' : CARD, radius: RADIUS, padding: { top: 'var(--space-50)', right: 'var(--space-50)', bottom: 'var(--space-50)', left: 'var(--space-50)' } } }, [
              ...(img(c.image, { size: 'medium_large', aspectRatio: '4/3' }) ? [img(c.image, { size: 'medium_large', aspectRatio: '4/3' })!] : []),
              node('heading', { level: 3, content: inline(c.title), style: { fontFamily: HEADING_FONT, fontSize: 'var(--text-large)', ...(dark ? { color: ON_DARK } : {}) } }),
              ...body(c.body, dark),
              ...(c.link_url ? [node('text', { content: `<a href="${hrefAttr(c.link_url)}">${escHtml(c.link_label || 'Learn more')} →</a>`, style: { fontSize: '0.875rem', fontWeight: '600' } })] : []),
            ]),
          ]),
        );
        return band(s, WIDE_WIDTH, [...header(s, dark), ...body(s.body, dark), node('columns', { gap: { row: 'var(--space-50)', column: 'var(--space-50)' } }, cards), ...buttons(s.buttons, dark)], 'tint');
      }
      case 'gallery': {
        const pics = (s.images ?? []).map((r) => img(r, { size: 'medium_large' })).filter(Boolean) as PuckItem[];
        if (!pics.length) return null;
        return band(s, WIDE_WIDTH, [...header(s, dark), node('gallery', { columns: Math.min(3, pics.length), ...(s.gallery_display && s.gallery_display !== 'grid' ? { display: s.gallery_display } : {}), ...(s.caption ? { caption: escHtml(s.caption) } : {}) }, pics)]);
      }
      case 'video': {
        const refs = s.videos?.length ? s.videos : s.video ? [s.video] : [];
        if (refs.length > 1) {
          const clips = refs.map((r) => video(r)).filter(Boolean) as PuckItem[];
          if (!clips.length) return null;
          const display = s.gallery_display && s.gallery_display !== 'grid' ? { display: s.gallery_display } : {};
          return band(s, WIDE_WIDTH, [...header(s, dark), ...body(s.body, dark), node('video-gallery', { columns: Math.min(s.gallery_display === 'masonry' ? 3 : 2, clips.length), gap: 'var(--space-50)', ...display, ...(s.caption ? { caption: escHtml(s.caption) } : {}) }, clips)]);
        }
        const v = video(refs[0], s.caption);
        if (!v) return null;
        return band(s, '960px', [...header(s, dark), ...body(s.body, dark), v]);
      }
      case 'quote':
        if (!s.quote) return null;
        return band(s, TEXT_WIDTH, [node('quote', { citation: s.citation ? escHtml(s.citation) : undefined, style: { fontFamily: HEADING_FONT, fontSize: 'var(--text-x-large)', ...(dark ? { color: ON_DARK } : {}) } }, [node('text', { content: inline(s.quote) })])], 'soft');
      case 'cta':
        return band(s, TEXT_WIDTH, [...header(s, dark, true), ...body(s.body, dark).map((b) => ({ ...b, props: { ...b.props, attrs: { ...b.props.attrs, style: { ...b.props.attrs.style, textAlign: 'center' } } } }) as PuckItem), ...buttons(s.buttons, dark, 'center')], 'tint');
      case 'faq':
        return band(s, TEXT_WIDTH, [
          ...header(s, dark),
          ...(s.items ?? []).flatMap((q) => [node('heading', { level: 3, content: inline(q.question), style: { fontFamily: HEADING_FONT, fontSize: 'var(--text-large)', ...(dark ? { color: ON_DARK } : {}) } }), ...body(q.answer, dark)]),
        ]);
      case 'stats':
        return band(s, WIDE_WIDTH, [
          ...header(s, dark, true),
          node(
            'columns',
            { gap: { row: 'var(--space-50)', column: 'var(--space-50)' } },
            (s.stats ?? []).slice(0, 4).map((st) =>
              node('column', {}, [
                node('text', { content: escHtml(st.value), style: { textAlign: 'center', fontFamily: HEADING_FONT, fontSize: 'var(--text-hero)', color: ACCENT, lineHeight: '1' } }),
                node('text', { content: escHtml(st.label), style: { textAlign: 'center', ...bodyStyle(dark) } }),
              ]),
            ),
          ),
        ], 'dark');
      case 'listing': {
        const l = s.listing;
        if (!l) return null;
        const tag = l.tag ? m.tags.get(l.tag.toLowerCase()) : undefined;
        const card = l.card ?? typeDef(l.content_type)?.card ?? DEFAULT_CARD;
        const collection = node(
          'collection',
          {
            query: l.ids?.length
              ? { postType: l.content_type, include: l.ids.map(Number), perPage: l.ids.length }
              : { postType: l.content_type, perPage: l.count ?? 3, order: 'desc', orderBy: 'date', ...(l.upcoming || l.content_type === 'event' ? { upcoming: true } : {}), ...(tag ? { taxQuery: { tag: [tag] } } : {}) },
            display: l.display ?? 'grid',
            ...(l.display === 'list' ? {} : { columns: Math.min(card === 'logo' ? 5 : 3, l.ids?.length || l.count || 3) }),
            card,
            appliedCard: card,
            itemGap: l.display === 'list' ? 'var(--space-30)' : 'var(--space-50)',
            ...(l.shuffle ? { shuffle: true } : {}),
          },
          [node('collection-items', {}, cardTemplate(card, `${prefix}-card${i}`))],
        );
        return band(s, WIDE_WIDTH, [...header(s, dark), ...body(s.body, dark), collection, ...buttons(s.buttons, dark)], 'tint');
      }
      default:
        return null;
    }
  });
  return sections.filter(Boolean) as PuckItem[];
}
