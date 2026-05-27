#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const npmViewAttempts = 30
const npmViewDelayMs = 2000

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

function npmViewVersion(packageName, version) {
  const output = execFileSync(
    'npm',
    ['view', `${packageName}@${version}`, 'version', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()

  if (!output)
    return null

  const parsed = JSON.parse(output)
  if (typeof parsed === 'string')
    return parsed
  if (Array.isArray(parsed))
    return parsed[parsed.length - 1] ?? null
  return null
}

async function waitForPublishedVersion(packageName, version) {
  let publishedVersion = null
  let sawNpmViewError = false

  for (let attempt = 1; attempt <= npmViewAttempts; attempt++) {
    try {
      publishedVersion = npmViewVersion(packageName, version)
      if (publishedVersion === version)
        return publishedVersion
    }
    catch {
      sawNpmViewError = true
    }

    if (attempt < npmViewAttempts)
      await new Promise(resolve => setTimeout(resolve, npmViewDelayMs))
  }

  if (sawNpmViewError && !publishedVersion) {
    throw new Error(
      `[check-workspace-deps-published] ${packageName}@${version} is not visible on npm after ${npmViewAttempts} attempts. Publish ${packageName} first.`,
    )
  }

  throw new Error(
    `[check-workspace-deps-published] Expected ${packageName}@${version} on npm, got ${publishedVersion || 'none'} after ${npmViewAttempts} attempts. Publish ${packageName} first.`,
  )
}

const rootPackageJson = readJson(resolve(root, 'package.json'))

for (const dep of workspaceDeps) {
  const dependencyVersion = rootPackageJson.dependencies?.[dep.name]
  if (!dependencyVersion)
    throw new Error(`[check-workspace-deps-published] ${rootPackageJson.name} does not depend on ${dep.name}.`)

  const depPackageJson = readJson(resolve(root, dep.packageJson))
  const targetVersion = depPackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string')
    throw new Error(`[check-workspace-deps-published] Invalid version in ${dep.packageJson}`)

  if (dependencyVersion !== 'workspace:*' && dependencyVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-published] ${dep.name} must use workspace:* or exact local version ${targetVersion}, got ${dependencyVersion}.`,
    )
  }

  await waitForPublishedVersion(dep.name, targetVersion)

  console.log(`[check-workspace-deps-published] OK: ${dep.name}@${targetVersion} is published.`)
}
