#!/usr/bin/env node
// Bump the markstream family versions, commit, tag (dependency order), push.
//
// Publishing is intentionally NOT part of this script: pushing the
// `<pkg>@<version>` tags triggers the "Release (Stable)" GitHub Actions
// workflow (`.github/workflows/release-stable.yml`), which verifies the
// package, publishes it to npm (`latest` for stable lines, `legacy`
// preservation via resolve-dist-tag) and creates the GitHub Release.
//
// TAG PUSH ORDER MATTERS: the release workflow serializes runs in creation
// order (concurrency group `release-stable`). Tags are therefore pushed
// parser → core → vue → adapters so workspace-dependency checks
// (`check-workspace-deps-published`) never race a not-yet-published
// dependency — the failure mode that killed the first 2.0.0 attempt.
//
// Usage:
//   node scripts/release-stable-family.mjs                          # dry-run against current versions
//   node scripts/release-stable-family.mjs --version 2.0.1          # dry-run plan
//   node scripts/release-stable-family.mjs --version 2.0.1 --apply  # bump, commit, tag, push
//   node scripts/release-stable-family.mjs --version 2.0.1 --parser-version 1.2.9 --apply
//
// `stream-markdown-parser` lives on its own 1.x line: leave it out unless
// --parser-version is passed.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')

function parseArgs(argv) {
  const args = { apply: false, version: null, parserVersion: null }
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--apply') {
      args.apply = true
    }
    else if (current === '--version') {
      args.version = argv[++i]
      if (!args.version || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(args.version))
        throw new Error('[release] --version requires a semver, e.g. --version 2.0.1')
    }
    else if (current === '--parser-version') {
      args.parserVersion = argv[++i]
      if (!args.parserVersion || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(args.parserVersion))
        throw new Error('[release] --parser-version requires a semver, e.g. --parser-version 1.2.9')
    }
    else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }
  return args
}

function run(cmd, args, opts = {}) {
  console.log(`[release] $ ${cmd} ${args.join(' ')}`)
  if (opts.dryRunOnly)
    return
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
}

function fail(message) {
  console.error(`[release] ✗ ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (!args.apply && !args.version) {
  console.log('[release] dry-run (add --version X.Y.Z for a plan, --apply to execute).')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Version matrix — parser on its own 1.x line, everything else on the family
// major. Parser is skipped unless --parser-version is passed explicitly.
// ---------------------------------------------------------------------------
function buildMatrix(version, parserVersion) {
  const adapters = ['markstream-react', 'markstream-octane', 'markstream-svelte', 'markstream-angular', 'markstream-vue2', 'markstream-solid']
  return [
    ...(parserVersion ? [{ name: 'stream-markdown-parser', dir: 'packages/markdown-parser', version: parserVersion }] : []),
    { name: 'markstream-core', dir: 'packages/markstream-core', version },
    { name: 'markstream-vue', dir: '.', version },
    ...adapters.map(name => ({
      name,
      dir: `packages/${name.replace('markstream-', 'markstream-')}`,
      version,
    })),
  ]
}

// Publish/tag dependency order — this is also the release-workflow queue order.
const TAG_ORDER = ['stream-markdown-parser', 'markstream-core', 'markstream-vue', 'markstream-react', 'markstream-octane', 'markstream-svelte', 'markstream-angular', 'markstream-vue2', 'markstream-solid']

const targetVersion = args.version
const matrix = buildMatrix(targetVersion, args.parserVersion)

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
const branch = git(['branch', '--show-current'])
if (branch !== 'main')
  fail(`expected to run on main, current branch is ${branch}`)

const status = git(['status', '--porcelain'])
if (status)
  fail('working tree is not clean. Commit or stash changes first.')

git(['fetch', 'origin'])
const head = git(['rev-parse', 'HEAD'])
const remote = git(['rev-parse', 'origin/main'])
if (head !== remote)
  fail(`local main (${head.slice(0, 9)}) is not in sync with origin/main (${remote.slice(0, 9)}). Pull first.`)

console.log('[release] preflight OK: main in sync, tree clean.')

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
const manifests = matrix.map((pkg) => {
  const jsonPath = path.join(ROOT, pkg.dir, 'package.json')
  if (!existsSync(jsonPath))
    fail(`missing manifest: ${jsonPath}`)
  const manifest = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (manifest.name !== pkg.name)
    fail(`${jsonPath} has name "${manifest.name}", expected "${pkg.name}"`)
  return { ...pkg, jsonPath, manifest }
})

for (const pkg of manifests) {
  const change = pkg.manifest.version === pkg.version ? 'unchanged (idempotent)' : '→'
  console.log(`[release] plan: ${pkg.name} ${pkg.manifest.version} ${change} ${pkg.version}`)
}

if (!args.apply) {
  console.log('[release] dry-run complete. Re-run with --apply to bump, commit, tag and push.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Bump
// ---------------------------------------------------------------------------
let bumped = 0
for (const pkg of manifests) {
  if (pkg.manifest.version === pkg.version)
    continue
  pkg.manifest.version = pkg.version
  writeFileSync(pkg.jsonPath, `${JSON.stringify(pkg.manifest, null, 2)}\n`)
  bumped++
  console.log(`[release] bumped ${pkg.name} → ${pkg.version}`)
}
if (bumped === 0)
  console.log('[release] all manifests already on target versions — nothing to bump.')

run('pnpm', ['install', '--lockfile-only'])
run('pnpm', ['run', 'docs:llms:generate'])
run('pnpm', ['run', 'docs:sync-zh'])
// Full-repo lint before tagging: the Release (Stable) workflow runs
// `pnpm lint` inside release:verify for markstream-vue, so any lint error
// would otherwise kill the publish run at the head of the queue.
run('pnpm', ['run', 'lint'])
run('pnpm', ['run', 'check:peer-deps'])

const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
if (!changelog.startsWith(`## [${targetVersion}]`))
  fail(`CHANGELOG.md does not start with a "## [${targetVersion}]" entry. Add the release notes first.`)

// ---------------------------------------------------------------------------
// Commit + tags (dependency order = release workflow queue order)
// ---------------------------------------------------------------------------
for (const pkg of manifests) {
  const current = JSON.parse(readFileSync(pkg.jsonPath, 'utf8')).version
  if (current !== pkg.version)
    fail(`${pkg.name} is still ${current}, expected ${pkg.version}. Version bump did not materialize.`)
  console.log(`[release] confirmed ${pkg.name}@${pkg.version}`)
}

run('git', ['add', 'package.json', 'pnpm-lock.yaml', 'packages', 'docs', 'CHANGELOG.md', 'README.md'])

let hasChanges = true
try {
  execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT, stdio: 'ignore' })
  hasChanges = false
}
catch {
  hasChanges = true
}

const parserOnly = manifests.every(pkg => pkg.name === 'stream-markdown-parser')
const commitMessage = parserOnly
  ? `chore: release stream-markdown-parser v${args.parserVersion}`
  : `chore: release v${targetVersion}`

if (hasChanges) {
  run('git', ['commit', '-m', commitMessage])
}
else {
  console.log('[release] no staged changes — release commit already exists, skipping commit.')
}

for (const name of TAG_ORDER) {
  const pkg = manifests.find(p => p.name === name)
  if (!pkg)
    continue
  run('pnpm', ['run', `tag:${name === 'stream-markdown-parser' ? 'parser' : name === 'markstream-vue' ? 'vue3' : name.replace('markstream-', '')}:push`])
}

console.log(`[release] tags pushed in dependency order — Release (Stable) CI will verify and publish each package to npm.`)
console.log('[release] Monitor: gh run list --workflow release-stable.yml')
