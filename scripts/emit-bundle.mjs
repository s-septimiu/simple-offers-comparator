/**
 * Copies the single-file build to the repo root as `index.html`.
 *
 * Root index.html is the downloadable distributable referenced by the README.
 * It is generated — never hand-edit it. CI enforces this with
 * `git diff --exit-code index.html` after a clean build.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repoRoot, 'dist', 'index.html')
const target = join(repoRoot, 'index.html')

const banner = `<!--
  GENERATED FILE — DO NOT EDIT.

  Built from src/ by \`npm run build\`. Any manual change here is overwritten by
  the next build, and CI will fail on the drift check. Edit src/ instead.
-->
`

const html = await readFile(source, 'utf8')
await writeFile(target, banner + html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log(`emit-bundle: wrote index.html (${kb} kB, self-contained)`)
