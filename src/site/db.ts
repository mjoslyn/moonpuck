// The site's own tables' policies (who may read and write them; see src/lib/db/access.ts), its
// plugins' among them: `...plugin.policies`. A table not listed is the server's only. A core table's
// policy can't be changed here.
import type { TablePolicy } from '../lib/db/access';

export const SITE_POLICIES: Record<string, TablePolicy> = {};
