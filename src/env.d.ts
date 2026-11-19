/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    db: import('./lib/db/query').Db;
    /** `guest`: someone using a share link (src/lib/share), with `share` the link. */
    user: { id: string; email: string; role: 'editor' | 'admin' | 'guest'; name: string };
    share?: import('./lib/share/links').ShareLink;
  }
}

// The Workers runtime's module (src/worker.ts), as far as the site uses it.
declare module 'cloudflare:workers' {
  export const cache: { purge(options: { tags?: string[] }): Promise<unknown> };
  export const env: Record<string, unknown>;
}

// Cloudflare's module types (the Workers Vite plugin): compiled WebAssembly and raw bytes.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
declare module '*.bin' {
  const data: ArrayBuffer;
  export default data;
}
