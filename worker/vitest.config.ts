import { configDefaults, defineConfig } from 'vitest/config';

// `wrangler dev` writes the bundled text modules (copies of ../test/*.test.ts) under .wrangler/tmp:
// they are not this package's tests.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.wrangler/**'] },
});
