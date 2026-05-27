#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
    corePackageJson: '',
    corePackageName: 'markstream-core',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--package-json') {
      args.packageJson = argv[index + 1] ?? args.packageJson
      index += 1
      continue
    }
    if (token === '--core-package-json') {
      args.corePackageJson = argv[index + 1] ?? args.corePackageJson
      index += 1
      continue
    }
    if (token === '--core-package-name') {
      args.corePackageName = argv[index + 1] ?? args.corePackageName
      index += 1
    }
  }

  return args
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir)
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')))
      return current
    const parent = path.dirname(current)
    if (parent === current)
      return null
    current = parent
  }
}

function readJson(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8')
  return JSON.parse(raw)
}

function resolvePath(baseDir, targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath)
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

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const repoRoot = findRepoRoot(cwd)

  const packageJsonPath = resolvePath(cwd, args.packageJson)
  const defaultCorePackageJsonPath = repoRoot
    ? path.join(repoRoot, 'packages/markstream-core/package.json')
    : path.resolve(cwd, 'packages/markstream-core/package.json')
  const corePackageJsonPath = resolvePath(cwd, args.corePackageJson || defaultCorePackageJsonPath)

  const packageJson = readJson(packageJsonPath)
  const dependencyVersion = packageJson.dependencies?.[args.corePackageName]

  if (!dependencyVersion) {
    console.log(`[check-core-published] Skip: ${packageJson.name} does not depend on ${args.corePackageName}.`)
    return
  }

  const corePackageJson = readJson(corePackageJsonPath)
  const targetVersion = corePackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string') {
    throw new Error(`[check-core-published] Invalid version in ${corePackageJsonPath}`)
  }

  let publishedVersion = null
  try {
    publishedVersion = npmViewVersion(args.corePackageName, targetVersion)
  }
  catch {
    throw new Error(
      `[check-core-published] ${args.corePackageName}@${targetVersion} is not published yet. Publish ${args.corePackageName} first.`,
    )
  }

  if (publishedVersion !== targetVersion) {
    throw new Error(
      `[check-core-published] Expected ${args.corePackageName}@${targetVersion} on npm, got ${publishedVersion || 'none'}. Publish ${args.corePackageName} first.`,
    )
  }

  console.log(`[check-core-published] OK: ${args.corePackageName}@${targetVersion} is published.`)
}

main()
