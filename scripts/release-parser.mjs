#!/usr/bin/env node
/**
 * MarkStream parser release — 1.x branch edition.
 *
 * Run from the repo root on the `1.x` branch:
 *
 *   node scripts/release-parser.mjs [--patch <version>] [--beta-suffix <s>]
 *       [--parser-only] [--skip-verify] [--dry-run]
 *
 * Release order (same parser fix on both branches):
 *   1. main:  stream-markdown-parser <patch>-beta.1  -> npm `next`   (main edition, FIRST)
 *   2. 1.x:   stream-markdown-parser <patch>         -> npm `latest` (this edition, SECOND)
 *
 * semver orders 1.2.6-beta.1 < 1.2.6, so the beta must exist before the final,
 * otherwise `next` points at a version older than `latest` and the beta line breaks.
 * This script publishes the FINAL patch and must be run AFTER the main edition.
 * Both branches must bump to the same patch base (use the same `--patch`).
 *
 * This script only bumps the parser manifest; downstream packages (core / vue3 /
 * react / svelte / angular) are published via the branch's `release:family` chain
 * unless `--parser-only` is given. (The 1.x branch has no octane/vue2 family.)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PARSER_DIR = path.join(ROOT, 'packages/markdown-parser')
const PACKAGE_NAME = 'stream-markdown-parser'
const EXPECTED_BRANCH = '1.x'
const EXPECTED_DIST_TAG = 'latest'

function run(cmd, args, cwd = ROOT, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `\`${cmd} ${args.join(' ')}\` failed (exit ${result.status}):\n${result.stderr?.trim() || result.stdout?.trim()}`,
    )
  }
  return result.stdout?.trim() ?? ''
}

function git(args, options) {
  return run('git', args, ROOT, options)
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function parseArgs(argv) {
  const args = {
    patch: null,
    parserOnly: false,
    skipVerify: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--patch') {
      args.patch = argv[++i]
      if (!args.patch)
        throw new Error('--patch requires a value')
    }
    else if (arg === '--parser-only')
      args.parserOnly = true
    else if (arg === '--skip-verify')
      args.skipVerify = true
    else if (arg === '--dry-run')
      args.dryRun = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/release-parser.mjs [--patch <version>] [--parser-only] [--skip-verify] [--dry-run]

Release the parser on the ${EXPECTED_BRANCH} branch (final -> ${EXPECTED_DIST_TAG}).
Run the main edition FIRST on main (beta -> next), then this edition on ${EXPECTED_BRANCH}.

Options:
  --patch <v>       Explicit patch base (default: npm latest + 1 patch)
  --parser-only     Skip the downstream release:family chain
  --skip-verify     Skip the light parser gate (typecheck + unit tests)
  --dry-run         Plan only: no bump, no publish, no push`)
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function npmDistTags() {
  const out = run('npm', ['view', PACKAGE_NAME, 'dist-tags', '--json'], ROOT, { allowFailure: true })
  if (!out)
    return {}
  try {
    return JSON.parse(out)
  }
  catch {
    throw new Error(`Invalid npm dist-tags response for ${PACKAGE_NAME}`)
  }
}

function nextPatch(version) {
  const parsed = semver.parse(version)
  if (!parsed)
    throw new Error(`Invalid version: ${version}`)
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function isPublished(version) {
  const result = spawnSync('npm', ['view', `${PACKAGE_NAME}@${version}`, 'version', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0)
    return false // npm 11 prints an error JSON object on E404 but exits 1
  const out = result.stdout.trim()
  return out !== '' && semver.valid(out.replaceAll('"', '')) !== null
}

function plan(args) {
  const distTags = npmDistTags()
  const latest = distTags.latest
  if (!latest)
    throw new Error(`npm has no "latest" tag for ${PACKAGE_NAME}`)

  const target = args.patch ?? nextPatch(latest)
  if (!semver.gt(target, latest))
    throw new Error(`Target ${target} must be > npm latest ${latest}`)

  if (isPublished(target))
    throw new Error(`${PACKAGE_NAME}@${target} is already published on npm`)
  const tag = run('git', ['rev-parse', '--verify', '--quiet', `${PACKAGE_NAME}@${target}^{}`], ROOT, { allowFailure: true })
  if (tag)
    throw new Error(`git tag ${PACKAGE_NAME}@${target} already exists`)

  const localManifest = readJson(path.join(PARSER_DIR, 'package.json'))
  if (localManifest.name !== PACKAGE_NAME)
    throw new Error(`Unexpected parser manifest: ${localManifest.name}`)
  const current = localManifest.version
  if (!semver.lt(current, target))
    throw new Error(`Local parser version ${current} must be lower than target ${target}; pick a higher patch (--patch)`)

  return { latest, target, current }
}

function log(...parts) {
  console.log(`[release-parser:${EXPECTED_BRANCH}]`, ...parts)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const p = plan(args)

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== EXPECTED_BRANCH)
    throw new Error(`This script must run on the ${EXPECTED_BRANCH} branch (current: ${branch}). The main edition lives on the main branch.`)

  log(`npm latest: ${p.latest}`)
  log(`plan: ${PACKAGE_NAME} ${p.current} -> ${p.target} (npm tag: ${EXPECTED_DIST_TAG}) — main edition must have already shipped ${p.target} as -beta on "next"`)
  if (!args.parserOnly)
    log('after parser: run release:family (core -> vue3 -> react -> svelte -> angular)')
  else
    log('parser-only: downstream family chain skipped')

  if (args.dryRun) {
    log('dry-run: no verify, no bump, no publish, no push')
    return
  }

  if (!args.skipVerify) {
    log('light parser gate: typecheck + test:run (1.x has no verify:parser-release)')
    run('pnpm', ['--dir', PARSER_DIR, 'run', 'typecheck'], ROOT, { stdio: 'inherit' })
    run('pnpm', ['--dir', PARSER_DIR, 'run', 'test:run'], ROOT, { stdio: 'inherit' })
  }
  else {
    log('verify skipped (--skip-verify)')
  }

  log(`bumpp ${p.target} in packages/markdown-parser`)
  run('pnpm', ['exec', 'bumpp', p.target, '--commit', '--no-tag', '--no-push'], PARSER_DIR, { stdio: 'inherit' })

  const bumped = readJson(path.join(PARSER_DIR, 'package.json')).version
  if (bumped !== p.target)
    throw new Error(`Version after bump is ${bumped}, expected ${p.target}`)

  const distTag = run('node', ['scripts/resolve-dist-tag.mjs', PACKAGE_NAME, p.target], ROOT)
  if (distTag !== EXPECTED_DIST_TAG)
    throw new Error(`[fail-closed] ${PACKAGE_NAME}@${p.target} resolves to dist-tag "${distTag}", expected "${EXPECTED_DIST_TAG}`)

  log(`npm publish ${PACKAGE_NAME}@${p.target} --tag ${EXPECTED_DIST_TAG}`)
  run('npm', ['publish', '--access', 'public', '--tag', EXPECTED_DIST_TAG], PARSER_DIR, { stdio: 'inherit' })

  log(`push git tag ${PACKAGE_NAME}@${p.target}`)
  run('node', ['../scripts/tag-package.mjs', '--package-json', 'package.json', '--push'], PARSER_DIR, { stdio: 'inherit' })

  if (!args.parserOnly) {
    log('release:family — publish all downstream markstream packages on this branch')
    run('pnpm', ['run', 'release:family'], ROOT, { stdio: 'inherit' })
  }

  log('done.')
}

main()