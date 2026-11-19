// The pieces of a table policy (src/lib/db/policies.ts), apart so a site's own tables' policies
// (src/site/db.ts, its plugins' among them) can be written with them without importing the core's list.
import type { Filter } from './query';

/** `guest`: someone without an account editing or viewing one entry through a share link (src/lib/share). */
export type Role = 'service' | 'admin' | 'editor' | 'guest' | 'none';

export interface Ctx {
  role: Role;
  /** The signed-in person (their auth user id). */
  uid?: string;
  /** A guest's entry: the one their share link is for. */
  entryId?: number;
}

/** A write rule with conditions: the rows it reaches (`using`) and what the written rows must be (`check`). */
export interface Rule {
  using: (ctx: Ctx) => boolean | Filter;
  check: (ctx: Ctx, row: Record<string, any>) => boolean;
}

export type Access = (ctx: Ctx) => boolean;
/** A read: all rows, none, or the rows a filter picks. */
export type ReadAccess = (ctx: Ctx) => boolean | Filter;
export const editors: Access = (c) => c.role === 'editor' || c.role === 'admin';
export const admins: Access = (c) => c.role === 'admin';
export const nobody: Access = () => false;

export interface TablePolicy {
  select: ReadAccess;
  insert: Access | Rule;
  update: Access | Rule;
  delete: Access | Rule;
}

export const all = (read: ReadAccess, write: Access | Rule): TablePolicy => ({ select: read, insert: write, update: write, delete: write });
export const readOnly = (read: ReadAccess): TablePolicy => all(read, nobody);

/** Admins change any row; editors only rows (as they are and as written) that `editorRow` allows. */
export const adminsOrEditorsWhen = (filter: Filter, editorRow: (row: Record<string, any>) => boolean): Rule => ({
  using: (c) => (admins(c) ? true : editors(c) ? filter : false),
  check: (c, row) => admins(c) || (editors(c) && editorRow(row)),
});

/**
 * Editors read every row; a guest (a share link) reads `guestRows` of it (a filter, or true for all), so
 * the editor's canvas can show the page as it is. Writes are never a guest's: a guest's save goes through
 * the entry's own API, as the server, after it checks what a guest may save.
 */
export const editorsOrGuests = (guestRows: (c: Ctx) => boolean | Filter): ReadAccess => (c) => (editors(c) ? true : c.role === 'guest' && c.entryId ? guestRows(c) : false);
