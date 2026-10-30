#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePublishedDistTag } from './resolve-dist-tag.mjs'

const packageJsonPaths = [
  'package.json',
  'packages/markdown-parser/package.json',
  'packages/markstream-core/package.json',
  'packages/markstream-react/package.json',
  'packages/markstream-octane/package.json',
  'packages/markstream-svelte/package.json',
  'packages/markstream-angular/package.json',
  'packages/markstream-vue2/package.json',
  'packages/markstream-solid/package.json',
]

for (const packageJsonPath of packageJsonPaths) {
  const packageJson = JSON.parse(readFileSync(resolve(packageJsonPath), 'utf8'))
  const distTag = resolvePublishedDistTag(packageJson.name, packageJson.version)
  console.log(`[release-family-preflight] ${packageJson.name}@${packageJson.version} -> ${distTag}`)
}
