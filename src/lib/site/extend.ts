// How a site adds its own blocks and page behaviour to the core (src/site/render.ts, src/site/editor.tsx).
// Block renderers are synchronous string functions that also run inside the editor; anything they need
// from the database is loaded first by the block's `prepare` hook and kept on ctx.
import type { ReactNode } from 'react';
import type { PuckItem } from '../puck/types';
import type { QueryArgs } from '../data';
import type { Renderer, RenderCtx } from '../../render/env';
import type { FieldDef } from './types';
import type { ShareCardDesign } from '../share-card/design';
import type { Theme } from '../theme/theme';

/** Where a block appears in the editor's block list. */
export type BlockCategory = 'text' | 'media' | 'layout' | 'dynamic' | 'card' | 'sections' | 'site' | 'advanced';

/** Helpers the core passes to prepare hooks. */
export interface PrepareTools {
  /** A number unique within the page (slider and feed ids). */
  uid(): number;
  /** Load entries' featured images and image fields in one query. */
  loadEntryMedia(ids: number[]): Promise<void>;
  /** A set of term ids with all their descendants. */
  descendantTermIds(ids: number[]): Promise<number[]>;
}

export interface BlockDef {
  /** Name in the editor ("Member map"). */
  label: string;
  category: BlockCategory;
  /** Renders the block to HTML (server and editor). */
  render: Renderer;
  /** Loads what the block needs before rendering (each occurrence on the page). */
  prepare?: (item: PuckItem, ctx: RenderCtx, tools: PrepareTools) => Promise<void>;
  /** Entry types it applies to (it reads their fields): the editor offers it only on those, and in templates. */
  types?: string[];
}

/** A block in a card design, without ids (they are generated per use). */
export interface CardTemplate {
  type: string;
  props: { attrs: Record<string, any>; children?: CardTemplate[] };
}
/** A card design for collections. */
export interface CardPreset {
  id: string;
  label: string;
  description: string;
  template: CardTemplate[];
}

export interface SiteRender {
  /** The site's own block types. */
  blocks: Record<string, BlockDef>;
  /** Card designs for collections; the first is the default. */
  cards?: CardPreset[];
  /** Adjust the main query of a listing page (type archives and term pages), e.g. search and filters. */
  archiveQuery?: (args: QueryArgs, ctx: RenderCtx, tools: PrepareTools) => Promise<void>;
  /** Extra markup for <head>, after the site stylesheet (web fonts, meta tags). */
  head?: (ctx: RenderCtx) => string;
  /** The page's footer scripts, given those the blocks added (ctx.scripts). Default: ctx.scripts as is. */
  pageScripts?: (ctx: RenderCtx) => Promise<string[]>;
  /** The site's look before anyone saves one under Settings > Theme (`default`), and its own classes
   * whose backgrounds are dark, which take the theme's dark-band colors (`darkSelectors`). */
  theme?: { default?: Theme; darkSelectors?: string[] };
  /** Share cards for pages without a share image of their own (src/lib/share-card): the site's design. */
  shareCard?: ShareCardDesign;
  /** Where an old URL of the site's now lives (a 301), or null: e.g. a previous site's URLs. */
  redirect?: (url: URL) => string | null;
}

export type SetAttrs = (patch: Record<string, any>) => void;

export interface SiteEditor {
  /** Settings panels for the site's blocks (and any core block whose panel the site replaces). */
  panels?: Record<string, (attrs: Record<string, any>, set: SetAttrs) => ReactNode>;
  /** Site-wide options edited under Settings (stored in settings.options), under this heading. */
  settingsFields?: FieldDef[];
  settingsTitle?: string;
}

export const defineRender = (r: SiteRender): SiteRender => r;
export const defineEditor = (e: SiteEditor): SiteEditor => e;
