#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--package-json') {
      args.packageJson = argv[++i]
    }
    else if (current === '--dry-run') {
      args.dryRun = true
    }
    else if (current === '--help' || current === '-h') {
      console.log('Usage: node scripts/publish-current-package.mjs --package-json <path> [--dry-run]')
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  return args
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

function packageVersionExists(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0 && result.stdout.trim() === version
}

function gitCommit(ref) {
  const result = spawnSync('git', ['rev-parse', `${ref}^{}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0 ? result.stdout.trim() : null
}

function assertPublishedTagAtHead(packageJson) {
  const tagName = `${packageJson.name}@${packageJson.version}`
  const headCommit = gitCommit('HEAD')
  const tagCommit = gitCommit(tagName)

  if (!headCommit)
    throw new Error('[publish-current] Unable to resolve current HEAD.')
  if (!tagCommit)
    throw new Error(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm, but release tag ${tagName} is missing. Refusing to create a tag for an already-published version.`)
  if (tagCommit !== headCommit)
    throw new Error(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm, but release tag ${tagName} points to ${tagCommit}; current HEAD is ${headCommit}. Refusing to retag an already-published version.`)

  console.log(`[publish-current] Release tag already exists at current HEAD: ${tagName}`)
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = path.resolve(repoRoot, args.packageJson)
const packageDir = path.dirname(packageJsonPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const dryRunPublishArgs = args.dryRun ? ['--dry-run', '--ignore-scripts'] : []
const pnpmDryRunPublishArgs = args.dryRun ? [...dryRunPublishArgs, '--no-git-checks'] : []

console.log(`[publish-current] ${packageJson.name}@${packageJson.version}`)
run('pnpm', ['-C', packageDir, 'run', 'build'])
run('npm', ['config', 'get', 'registry'], packageDir)
const published = !args.dryRun && packageVersionExists(packageJson.name, packageJson.version)
if (published) {
  console.log(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm; skipping publish.`)
  assertPublishedTagAtHead(packageJson)
}
else {
  if (!args.dryRun)
    run('npm', ['whoami'], packageDir)
  if (packageDir === repoRoot)
    run('pnpm', ['publish', '--access', 'public', ...pnpmDryRunPublishArgs], packageDir)
  else
    run('npm', ['publish', '--access', 'public', ...dryRunPublishArgs], packageDir)
  run('node', ['scripts/tag-package.mjs', '--package-json', path.relative(repoRoot, packageJsonPath), ...(args.dryRun ? ['--dry-run', '--allow-dirty'] : ['--push'])])
}
