import { defineConfig } from 'vitest/config';

// wrangler bundles a .md import as its text (`rules` in wrangler.jsonc); vitest has to be told the same.
export default defineConfig({
  plugins: [
    {
      name: 'md-as-text',
      transform(code, id) {
        if (!id.endsWith('.md')) return null;

        return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
});
