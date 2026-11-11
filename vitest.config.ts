import { configDefaults, defineConfig } from 'vitest/config';

// worker/ is its own package with its own vitest config (it reads .md imports as text): `pnpm test` there.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'worker/**'] },
});
