import { defineConfig } from 'tsdown'

// Node 22 warns for every dependency that exposes a deprecated "./" exports pattern.
// Bundling markdown-it, markdown-it-ts, and their helpers prevents Nuxt/Nitro from
// touching those packages directly, eliminating the SSR build flood of DEP0155 logs.
const markdownItDeps = [
  /^markdown-it(?:-[\w-]+)?$/,
  /^markdown-it-ts(?:\/.*)?$/,
  'entities',
  'linkify-it',
  'mdurl',
  'punycode.js',
  'uc.micro',
]

export default defineConfig({
  noExternal: markdownItDeps,
})
