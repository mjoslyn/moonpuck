// Whether this is a demo (src/lib/demo), safe in the browser: there the admin pages say so as
// window.__demo (src/layouts/AdminTheme.astro), since the browser can't read the Worker's variables.
import { isDemo } from '../env';

export const demoOn = (): boolean => (typeof window !== 'undefined' ? !!(window as any).__demo : isDemo());
