// A value made once per server instance whose making finishes later (Better Auth's context, src/lib/auth),
// shared between requests only once it is ready. workerd settles a promise only in the request that made
// it (compatibility flag handle_cross_request_promise_resolution): if that request ends first (the visitor
// leaves, a double-clicked form's first post is dropped), the promise never settles and every later
// request waiting on it fails, for as long as the instance lives. So a request that finds another's value
// still being made makes its own, and the request making one is kept alive until it is ready.
import { afterAnswer, currentScope, type Scope } from './platform';

/** `make()`'s value, shared once `ready(value)` has resolved; made again if that rejects. */
export function onceReady<T>(make: () => T, ready: (value: T) => Promise<unknown>): () => T {
  interface Made { value: T; ready: boolean; scope: Scope | undefined }
  let held: Made | null = null;
  // Each request's own, so one whose value was replaced by a later request's keeps using its own.
  const own = new WeakMap<Scope, Made>();
  return () => {
    const scope = currentScope();
    if (held && (held.ready || held.scope === scope)) return held.value;
    const earlier = scope && own.get(scope);
    if (earlier) return earlier.value;
    const mine: Made = { value: make(), ready: false, scope };
    held = mine;
    if (scope) own.set(scope, mine);
    const done = ready(mine.value).then(
      () => {
        mine.ready = true;
      },
      () => {
        if (held === mine) held = null;
      },
    );
    afterAnswer(done);
    return mine.value;
  };
}
