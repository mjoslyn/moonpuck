// String renderer for Puck item trees. The public site outputs these strings verbatim.
import type { PuckItem } from '../lib/puck/types';
import type { Block, Env, Inner, Renderer } from './env';
import { visibilityPasses } from './blocks/visibility';
import { demoOn } from '../lib/demo/flag';
import { cleanAttrs } from '../lib/demo/sanitize';

const registry = new Map<string, Renderer>();
let fallback: Renderer = () => '';

export function register(map: Record<string, Renderer>, fallbackRenderer?: Renderer) {
  for (const [k, v] of Object.entries(map)) registry.set(k, v);
  if (fallbackRenderer) fallback = fallbackRenderer;
}

export const rendererFor = (type: string): Renderer => registry.get(type) ?? fallback;

/** Whether a block type has a renderer (a known component). */
export const isRegistered = (type: string) => registry.has(type);

export function toBlock(item: PuckItem): Block {
  return { type: item.type, ...item.props } as Block;
}

export function innerFor(item: PuckItem, env: Env): Inner {
  const childEnv = (over: Partial<Env> = {}): Env => ({ ...env, parentLayout: item.props.attrs?.layout ?? null, ...over });
  const inner = ((over?: Partial<Env>) => renderItems(item.props.children, childEnv(over))) as Inner;
  inner.each = (over) => (item.props.children ?? []).map((c) => renderItem(c, childEnv(over)));
  return inner;
}

export function renderItem(item: PuckItem, env: Env): string {
  // Visibility rules apply to every block.
  const vis = item.props.attrs?.visibility;
  if (vis?.enabled && !visibilityPasses(vis.rules ?? {})) return '';
  // On a demo (src/lib/demo) a block's settings are cleaned to an allowlist first, so nothing stored can run script.
  const block = toBlock(item);
  if (demoOn()) block.attrs = cleanAttrs(block.attrs ?? {});
  let out = rendererFor(item.type)(block, env, innerFor(item, env));
  if (env.ctx.markBlocks?.has(item.props.id)) out = markBlock(out, item);
  // A block is recorded after its inner blocks, so styles load in that order.
  if (!env.ctx.rendered.includes(item.type)) env.ctx.rendered.push(item.type);
  return out;
}

/** A block's output with its id and type on its first element, for comments on it (RenderCtx.markBlocks);
 * output that doesn't start with an element is wrapped in one. */
function markBlock(html: string, item: PuckItem): string {
  const attr = (s: string) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const marks = `data-block="${attr(item.props.id)}" data-block-type="${attr(item.type)}"`;
  if (/^\s*<[a-zA-Z][\w-]*[\s>/]/.test(html)) return html.replace(/^(\s*<[a-zA-Z][\w-]*)(?=[\s>/])/, `$1 ${marks}`);
  // Output that starts with text or a comment (an HTML block's, say) is wrapped (previews only).
  return html.trim() ? `<div ${marks}>${html}</div>` : html;
}

/** Record the block types in a subtree whose output is not shown, so their assets still load. */
export function markRendered(items: PuckItem[] | undefined, env: Env) {
  for (const item of items ?? []) {
    markRendered(item.props.children, env);
    if (!env.ctx.rendered.includes(item.type)) env.ctx.rendered.push(item.type);
  }
}

export function renderItems(items: PuckItem[] | undefined, env: Env): string {
  if (!items?.length) return '';
  let out = '';
  for (const item of items) out += renderItem(item, env);
  return out;
}
