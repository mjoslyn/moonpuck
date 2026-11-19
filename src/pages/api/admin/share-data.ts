// What a share link's guest editor renders with that the guest role can't read (src/lib/share/guest-state.ts).
import type { APIRoute } from 'astro';
import { guestCanvasData } from '../../../lib/share/guest-state';

export const GET: APIRoute = async () => Response.json(await guestCanvasData(), { headers: { 'Cache-Control': 'private, no-store' } });
