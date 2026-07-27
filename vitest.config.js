import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.js: that config sets `root: 'src'` for the
// build, which would otherwise hide the test files from discovery.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
