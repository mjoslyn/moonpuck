// The theme a site uses: the one saved under Settings > Theme (settings.site.theme), else the one the
// site's code gives (render.ts `theme.default`), else the core's (DEFAULT_THEME). The site's code can also
// name more dark bands (`theme.darkSelectors`: its own classes whose backgrounds are dark).
import { SITE_RENDER } from '../site/render';
import { cleanTheme, DEFAULT_THEME, themeCss, themeHead, type Theme } from './theme';

export const codeTheme = (): Theme => (SITE_RENDER.theme?.default && cleanTheme(SITE_RENDER.theme.default)) || DEFAULT_THEME;

export const siteTheme = (site: Record<string, any> | null | undefined): Theme => cleanTheme(site?.theme) ?? codeTheme();

export const siteDarkSelectors = () => SITE_RENDER.theme?.darkSelectors ?? [];

export const siteThemeCss = (site: Record<string, any> | null | undefined) => themeCss(siteTheme(site), siteDarkSelectors());
export const siteThemeHead = (site: Record<string, any> | null | undefined) => themeHead(siteTheme(site), siteDarkSelectors());
