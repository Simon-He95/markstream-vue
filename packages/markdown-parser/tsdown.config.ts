import { defineConfig } from 'tsdown'

// Node 22 warns for every dependency that exposes a deprecated "./" exports pattern.
// Bundling markdown-it, markdown-it-ts, and their helpers prevents Nuxt/Nitro from
// touching those packages directly, eliminating the SSR build flood of DEP0155 logs.
// `markdown-it-cjk-friendly` (a build-time dependency, see package.json) and its
// `get-east-asian-width` dependency are ESM-only, so they have to be inlined too: an
// external here would leave a `require()` in the CJS build and would make consumers
// install a `markdown-it` peer that our bundled runtime never uses.
const markdownItDeps = [
  /^markdown-it(?:-[\w-]+)?$/,
  /^markdown-it-ts(?:\/.*)?$/,
  'entities',
  'get-east-asian-width',
  'linkify-it',
  'mdurl',
  'punycode.js',
]

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  noExternal: markdownItDeps,
})
