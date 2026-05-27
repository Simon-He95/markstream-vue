#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const workspaceDeps = [
  {
    name: 'markstream-core',
    packageJson: 'packages/markstream-core/package.json',
  },
  {
    name: 'stream-markdown-parser',
    packageJson: 'packages/markdown-parser/package.json',
  },
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const rootPackageJson = readJson(resolve(root, 'package.json'))

for (const dep of workspaceDeps) {
  const dependencyVersion = rootPackageJson.dependencies?.[dep.name]
  if (!dependencyVersion)
    throw new Error(`[check-workspace-deps-local] ${rootPackageJson.name} does not depend on ${dep.name}.`)

  const depPackageJson = readJson(resolve(root, dep.packageJson))
  const targetVersion = depPackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string')
    throw new Error(`[check-workspace-deps-local] Invalid version in ${dep.packageJson}`)

  if (dependencyVersion !== 'workspace:*' && dependencyVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-local] ${dep.name} must use workspace:* or exact local version ${targetVersion}, got ${dependencyVersion}.`,
    )
  }

  console.log(`[check-workspace-deps-local] OK: ${dep.name}@${targetVersion} matches ${dependencyVersion}.`)
}
