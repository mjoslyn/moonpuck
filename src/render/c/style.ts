// Block styles: every visual setting a content block can carry, stored as CSS values (design tokens
// as var(--color-*), var(--space-*), var(--text-*)) and emitted as an inline style.
export interface Sides {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface Style {
  background?: string;
  gradient?: string;
  color?: string;
  padding?: Sides;
  margin?: Sides;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: string;
  textDecoration?: string;
  textAlign?: string;
  radius?: string | { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string };
  borderWidth?: string;
  borderColor?: string;
  borderStyle?: string;
  borderTop?: { width?: string; color?: string; style?: string };
  borderBottom?: { width?: string; color?: string; style?: string };
  minHeight?: string;
  width?: string;
  aspectRatio?: string;
  shadow?: string;
  /** Color of links inside the block (and on hover). */
  linkColor?: string;
  linkHover?: string;
  headingColor?: string;
}

export type Decl = [string, string];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** Inline declarations for a style. Selector-scoped colors become inherited custom properties. */
export function styleDecls(s: Style | undefined): Decl[] {
  if (!s) return [];
  const d: Decl[] = [];
  const push = (p: string, v: string | undefined) => v != null && v !== '' && d.push([p, v]);
  push('background', s.gradient);
  push('background-color', s.background);
  push('color', s.color);
  for (const side of SIDES) push(`padding-${side}`, s.padding?.[side]);
  for (const side of SIDES) push(`margin-${side}`, s.margin?.[side]);
  push('font-family', s.fontFamily);
  push('font-size', s.fontSize);
  push('font-weight', s.fontWeight);
  push('font-style', s.fontStyle);
  push('line-height', s.lineHeight);
  push('letter-spacing', s.letterSpacing);
  push('text-transform', s.textTransform);
  push('text-decoration', s.textDecoration);
  push('text-align', s.textAlign);
  if (typeof s.radius === 'string') push('border-radius', s.radius);
  else if (s.radius) {
    push('border-top-left-radius', s.radius.topLeft);
    push('border-top-right-radius', s.radius.topRight);
    push('border-bottom-left-radius', s.radius.bottomLeft);
    push('border-bottom-right-radius', s.radius.bottomRight);
  }
  push('border-color', s.borderColor);
  push('border-width', s.borderWidth);
  if (s.borderWidth || s.borderColor) push('border-style', s.borderStyle ?? 'solid');
  else push('border-style', s.borderStyle);
  for (const [side, b] of [['top', s.borderTop], ['bottom', s.borderBottom]] as const) {
    if (!b) continue;
    push(`border-${side}-color`, b.color);
    push(`border-${side}-width`, b.width);
    if (b.width || b.color) push(`border-${side}-style`, b.style ?? 'solid');
  }
  push('min-height', s.minHeight);
  push('width', s.width);
  push('aspect-ratio', s.aspectRatio);
  push('box-shadow', s.shadow);
  push('--link-color', s.linkColor);
  push('--link-hover', s.linkHover);
  push('--heading-color', s.headingColor);
  return d;
}

export const declString = (d: Decl[]) => d.map(([p, v]) => `${p}:${v}`).join(';');

/** class="..." style="..." for a block root. */
export function attrs(classes: (string | false | null | undefined)[], decls: Decl[], extra: Record<string, string | undefined> = {}): string {
  const cls = classes.filter(Boolean).join(' ');
  let out = cls ? `class="${escAttr(cls)}"` : '';
  const style = declString(decls);
  if (style) out += `${out ? ' ' : ''}style="${escAttr(style)}"`;
  for (const [k, v] of Object.entries(extra)) if (v != null) out += ` ${k}="${escAttr(v)}"`;
  return out;
}

export const escAttr = (s: string) => s.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Width / float classes shared by blocks that sit in a flow. */
export function alignClass(width?: string): string | null {
  return width ? `is-${width}` : null;
}

/** Flex/grid child sizing: grow to fill, a fixed basis, or a grid span. */
export interface Item {
  grow?: boolean;
  basis?: string;
  columnSpan?: number;
  rowSpan?: number;
}

export function itemDecls(item: Item | undefined): Decl[] {
  if (!item) return [];
  const d: Decl[] = [];
  if (item.basis) d.push(['flex-basis', item.basis], ['box-sizing', 'border-box']);
  else if (item.grow) d.push(['flex-grow', '1']);
  if (item.columnSpan) d.push(['grid-column', `span ${item.columnSpan}`]);
  if (item.rowSpan) d.push(['grid-row', `span ${item.rowSpan}`]);
  return d;
}
