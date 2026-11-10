// The pieces of a table policy (src/lib/db/policies.ts), apart so a site's own tables' policies
// (src/site/db.ts, its plugins' among them) can be written with them without importing the core's list.
import type { Filter } from './query';

export type Role = 'service' | 'admin' | 'editor' | 'none';

export interface Ctx {
  role: Role;
  /** The signed-in person (their auth user id). */
  uid?: string;
}

/** A write rule with conditions: the rows it reaches (`using`) and what the written rows must be (`check`). */
export interface Rule {
  using: (ctx: Ctx) => boolean | Filter;
  check: (ctx: Ctx, row: Record<string, any>) => boolean;
}

export type Access = (ctx: Ctx) => boolean;
export const editors: Access = (c) => c.role === 'editor' || c.role === 'admin';
export const admins: Access = (c) => c.role === 'admin';
export const nobody: Access = () => false;

export interface TablePolicy {
  select: Access;
  insert: Access | Rule;
  update: Access | Rule;
  delete: Access | Rule;
}

export const all = (read: Access, write: Access | Rule): TablePolicy => ({ select: read, insert: write, update: write, delete: write });
export const readOnly = (read: Access): TablePolicy => all(read, nobody);

/** Admins change any row; editors only rows (as they are and as written) that `editorRow` allows. */
export const adminsOrEditorsWhen = (filter: Filter, editorRow: (row: Record<string, any>) => boolean): Rule => ({
  using: (c) => (admins(c) ? true : editors(c) ? filter : false),
  check: (c, row) => admins(c) || (editors(c) && editorRow(row)),
});
