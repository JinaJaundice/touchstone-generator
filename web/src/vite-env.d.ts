/// <reference types="vite/client" />

// Raw-text imports (vite's ?raw suffix); used for docs/METHODOLOGY.md so the
// in-app method page cannot drift from the shipped document.
declare module "*.md?raw" {
  const text: string;
  export default text;
}
