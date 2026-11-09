// Header blocks: the site title (its icon and name, from Settings) and the Navigation block (the menu
// from Settings > Menu: links, and panels with a sidebar and featured cards; a search button that opens
// the search form; a menu button on small screens; public/assets/js/navigation.js runs them).
import type { Env, RenderCtx, Renderer } from '../env';
import type { Entry } from '../../lib/types';
import { esc } from '../html';
import { permalink } from '../../lib/permalink';
import { mediaUrl } from '../../lib/media/image';
import { entryTitle } from './entry';
import { eventDates } from '../events/date';
import { typeDef } from '../../lib/site';
import { MENU_CARDS, menuItems, type MenuItem } from '../../lib/navigation';

/** The site's icon and name, linking home; or the theme's logo (Settings > Theme) in their place. */
export const siteTitle: Renderer = (b, { ctx }) => {
  const a = b.attrs ?? {};
  const site = ctx.settings.site ?? {};
  const logo = a.logo && site.theme?.logo_url ? `<img class="c-site-title__logo" src="${esc(site.theme.logo_url)}" alt="${esc(site.name ?? 'Home')}" />` : '';
  if (logo) return `<a class="c-site-title${a.className ? ` ${esc(a.className)}` : ''}" href="/" rel="home">${logo}</a>`;
  const icon = a.icon !== false && site.icon_192 ? `<img class="c-site-title__icon" src="${esc(site.icon_192)}" alt="" width="40" height="40" />` : '';
  const name = a.name === false ? '' : `<span class="c-site-title__text">${esc(`${a.prefix ?? ''}${site.name ?? ''}`)}</span>`;
  return `<a class="c-site-title${a.className ? ` ${esc(a.className)}` : ''}" href="/" rel="home">${icon}${name}${!name ? `<span class="c-sr-only">${esc(site.name ?? 'Home')}</span>` : ''}</a>`;
};

/** The cards an item's panel shows: the latest of a type (upcoming events), else the entries picked. */
const cardKey = (i: number) => `nav-cards:${i}`;

/** Load what the menu's panels show (from prepare). */
export async function prepareNavigation(ctx: RenderCtx, loadEntryMedia: (ids: number[]) => Promise<void>) {
  const items = menuItems(ctx.settings);
  const all: number[] = [];
  for (const [i, item] of items.entries()) {
    let ids: number[] = [];
    if (item.featured_latest) {
      const events = item.featured_latest === 'event';
      ids = (await ctx.loader.query({ postType: item.featured_latest, perPage: MENU_CARDS, upcoming: events, orderBy: 'date', order: 'desc', terms: {} })).ids;
    } else if (Array.isArray(item.featured_items) && item.featured_items.length) {
      ids = (await ctx.loader.entriesByIds(item.featured_items.map(Number))).map((e) => e.id);
    }
    ctx.data.set(cardKey(i), ids);
    all.push(...ids);
  }
  if (all.length) await loadEntryMedia(all);
  const tag = '<script src="/assets/js/navigation.js" defer></script>';
  ctx.headScripts ??= [];
  if (!ctx.headScripts.includes(tag)) ctx.headScripts.push(tag);
}

function card(env: Env, e: Entry | undefined): string {
  if (!e || e.status !== 'publish') return '';
  const media = e.featured_media_id ? env.ctx.loader.media.get(e.featured_media_id) : undefined;
  const thumb = media ? mediaUrl((media.sizes.medium_large ?? media).path) : '';
  let meta = typeDef(e.type)?.singular ?? '';
  if (e.type === 'event') {
    const [s, en] = eventDates(e, 'M j');
    meta = s === en ? s : `${s} – ${en}`;
  }
  return (
    `<li class="c-nav__card"><a class="c-nav__card-link" href="${permalink(e)}">` +
    `<span class="c-nav__card-media"${thumb ? ` style="background-image:url('${esc(thumb)}')"` : ''}>${thumb ? '' : '<span class="c-nav__card-media-fallback" aria-hidden="true"></span>'}</span>` +
    `<span class="c-nav__card-body">${meta ? `<span class="c-nav__card-meta">${esc(meta)}</span>` : ''}<span class="c-nav__card-title">${entryTitle(e)}</span></span></a></li>`
  );
}

const newTab = (on?: boolean) => (on ? ' target="_blank" rel="noopener noreferrer"' : '');

function item(env: Env, it: MenuItem, i: number, uid: string): string {
  const label = it.label ?? '';
  if (!label) return '';
  const url = it.url || '#';
  const links = (Array.isArray(it.panel_links) ? it.panel_links : []).filter((l) => l?.label);
  const cards = ((env.ctx.data.get(cardKey(i)) as number[] | undefined) ?? []).map((id) => env.ctx.loader.entries.get(id));
  const featured = cards.map((e) => card(env, e)).join('');
  const hasSidebar = !!(it.panel_intro || it.links_heading || links.length);
  const hasPanel = !!featured || hasSidebar;
  const panelId = `${uid}-panel-${i}`;
  let o = `<li class="c-nav__item${hasPanel ? ' has-panel' : ''}"><a class="c-nav__link" href="${esc(url)}"${hasPanel ? ` aria-haspopup="true" aria-expanded="false" aria-controls="${panelId}"` : ''}${newTab(it.open_new_tab)}>${esc(label)}${hasPanel ? '<span class="c-nav__caret" aria-hidden="true"></span>' : ''}</a>`;
  if (hasPanel) {
    o += `<div id="${panelId}" class="c-nav__panel" role="region" aria-label="${esc(`${label} submenu`)}" hidden><div class="c-nav__panel-inner">`;
    if (hasSidebar) {
      o += '<div class="c-nav__sidebar">';
      if (it.links_heading) o += `<h3 class="c-nav__sidebar-heading">${esc(it.links_heading)}</h3>`;
      if (links.length) o += `<ul class="c-nav__links">${links.map((l) => `<li class="c-nav__links-item"><a class="c-nav__links-link" href="${esc(l.url || '#')}"${newTab(l.open_new_tab)}>${esc(l.label!)}</a></li>`).join('')}</ul>`;
      if (it.panel_intro) o += `<p class="c-nav__intro">${it.panel_intro}</p>`;
      if (it.show_view_all) o += `<a class="c-nav__view-all" href="${esc(url)}"${newTab(it.open_new_tab)}>${esc(it.view_all_label || 'View all')} <span aria-hidden="true">&rarr;</span></a>`;
      o += '</div>';
    }
    if (featured) {
      o += `<div class="c-nav__featured">${it.featured_heading ? `<h3 class="c-nav__featured-heading">${esc(it.featured_heading)}</h3>` : ''}<ul class="c-nav__cards" data-columns="${cards.filter(Boolean).length}">${featured}</ul></div>`;
    }
    o += '</div></div>';
  }
  return `${o}</li>`;
}

const SEARCH_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';

/** The search button (a link to /search/ without the script) and the search form it opens. */
function search(env: Env, uid: string): string {
  const q = env.ctx.queried.kind === 'search' ? (env.ctx.queried.search ?? '') : '';
  return (
    `<a class="c-nav__search-toggle" href="/search/" aria-controls="${uid}-search" aria-expanded="false">${SEARCH_ICON}<span class="c-sr-only">Search</span></a>` +
    `<div id="${uid}-search" class="c-nav-search" hidden>` +
    `<form class="c-search-form has-hidden-label c-nav-search__form" role="search" method="get" action="/search/">` +
    `<label class="c-search-form__label" for="${uid}-q">Search the site</label>` +
    `<div class="c-search-form__row"><input class="c-search-form__input" type="search" id="${uid}-q" name="q" value="${esc(q)}" placeholder="Search the site" />` +
    `<button class="c-search-form__button" type="submit">Search</button></div></form></div>`
  );
}

export const navigation: Renderer = (b, env) => {
  const a = b.attrs ?? {};
  const uid = `c-nav-${esc(b.id).replace(/[^\w-]/g, '')}`;
  const items = menuItems(env.ctx.settings).map((it, i) => item(env, it, i, uid)).join('');
  const toggle = `<button type="button" class="c-nav__toggle" aria-controls="${uid}-list" aria-expanded="false"><span class="c-sr-only">Menu</span><span class="c-nav__toggle-bar" aria-hidden="true"></span><span class="c-nav__toggle-bar" aria-hidden="true"></span><span class="c-nav__toggle-bar" aria-hidden="true"></span></button>`;
  return `<nav class="c-nav${a.className ? ` ${esc(a.className)}` : ''}" aria-label="${esc(a.label || 'Primary')}">${toggle}<ul id="${uid}-list" class="c-nav__list">${items}</ul>${a.search === false ? '' : search(env, uid)}</nav>`;
};

export const NAVIGATION_RENDERERS: Record<string, Renderer> = { navigation, 'site-title': siteTitle };
