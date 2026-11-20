// Unit tests (npm test): tests/**/*.test.ts, and the site's and its plugins' under src/site/, in Node, each file with a database of its own made from
// db/migrations, whose every statement is checked against D1's limits (tests/setup/d1-limits.ts).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests have no build, so no scripts' version (src/lib/asset-version.ts).
  plugins: [{ name: 'asset-version', resolveId: (id) => (id === 'virtual:asset-version' ? '\0virtual:asset-version' : undefined), load: (id) => (id === '\0virtual:asset-version' ? "export default '';" : undefined) }],
  test: {
    include: ['tests/**/*.test.ts', 'src/site/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/setup/global.ts'],
    setupFiles: ['tests/setup/db.ts'],
  },
});
