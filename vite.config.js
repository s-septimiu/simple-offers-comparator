import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * The Vite entry lives in `src/index.html`, NOT at the repo root.
 *
 * Root `index.html` is the committed build *output* — a single self-contained
 * file with React and compiled Tailwind inlined, so it can be downloaded and
 * opened straight from disk. Entry and output must never be the same path or
 * each build would clobber the dev shell.
 *
 * `npm run build` writes dist/ (published by Netlify), then
 * scripts/emit-bundle.mjs copies dist/index.html to the repo root.
 */
export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Inlining is what makes the single-file build possible at all.
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
})
