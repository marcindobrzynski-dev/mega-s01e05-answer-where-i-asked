// A `?raw` import is the file's text: wrangler bundles it as a Text module (`rules` in
// wrangler.jsonc), vitest does the same on its own.
declare module '*?raw' {
  const text: string;
  export default text;
}
