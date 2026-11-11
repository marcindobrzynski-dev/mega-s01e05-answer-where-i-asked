// A .md import is its text: wrangler bundles it as a Text module (`rules` in wrangler.jsonc).
declare module '*.md' {
  const text: string;
  export default text;
}
