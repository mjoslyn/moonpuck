// An R2 bucket in memory, for tests that keep files (backups, snapshots): put (with onlyIf), get, head,
// delete and list with a prefix and delimiter, as src/lib/storage.ts uses the binding.
import type { R2BucketLike, R2ObjectLike } from '../../src/lib/platform';

export function memoryBucket(): R2BucketLike {
  const files = new Map<string, { bytes: Uint8Array; uploaded: Date; type: string }>();
  const object = (key: string, withBody: boolean): R2ObjectLike | null => {
    const f = files.get(key);
    if (!f) return null;
    return {
      key,
      size: f.bytes.length,
      uploaded: f.uploaded,
      httpEtag: `"${key}-${f.uploaded.getTime()}"`,
      ...(withBody ? { body: new Blob([f.bytes]).stream() } : {}),
      writeHttpMetadata: (h: Headers) => h.set('content-type', f.type),
    };
  };
  return {
    async put(key, value, options) {
      if (options?.onlyIf?.etagDoesNotMatch === '*' && files.has(key)) return null;
      const bytes = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof ReadableStream ? new Uint8Array(await new Response(value).arrayBuffer()) : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      files.set(key, { bytes, uploaded: new Date(), type: options?.httpMetadata?.contentType ?? 'application/octet-stream' });
      return object(key, false);
    },
    async get(key) {
      return object(key, true);
    },
    async head(key) {
      return object(key, false);
    },
    async delete(key) {
      files.delete(key);
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      const keys = [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
      if (!options?.delimiter) return { objects: keys.map((k) => object(k, false)!), truncated: false };
      const prefixes = new Set<string>();
      const objects: R2ObjectLike[] = [];
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        const cut = rest.indexOf(options.delimiter);
        if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1));
        else objects.push(object(k, false)!);
      }
      return { objects, delimitedPrefixes: [...prefixes], truncated: false };
    },
  };
}
