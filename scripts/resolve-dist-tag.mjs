#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

function parseVersion(version, label) {
  const parsed = semver.parse(version)
  const canonical = parsed
    ? `${parsed.version}${parsed.build.length > 0 ? `+${parsed.build.join('.')}` : ''}`
    : null
  if (!parsed || canonical !== version)
    throw new Error(`[dist-tag] Invalid ${label} version: ${version}`)

  return {
    major: parsed.major,
    prerelease: parsed.prerelease.length > 0,
  }
}

function publishedMajor(distTags, tag) {
  const version = distTags[tag]
  return version === undefined ? null : parseVersion(version, `npm ${tag}`).major
}

export function resolveDistTagPlan(version, distTags = {}) {
  if (!distTags || Array.isArray(distTags) || typeof distTags !== 'object')
    throw new Error('[dist-tag] npm dist-tags response must be an object.')

  const candidate = parseVersion(version, 'candidate')
  const latestMajor = publishedMajor(distTags, 'latest')

  if (!candidate.prerelease) {
    const publishTag = latestMajor !== null && candidate.major < latestMajor ? 'legacy' : 'latest'
    const requiredAliases = latestMajor !== null
      && candidate.major > latestMajor
      && distTags.legacy !== distTags.latest
      ? [{ tag: 'legacy', version: distTags.latest }]
      : []
    return { publishTag, requiredAliases }
  }

  const nextMajor = publishedMajor(distTags, 'next')
  const activeMajor = Math.max(latestMajor ?? -1, nextMajor ?? -1)
  const publishTag = candidate.major < activeMajor ? 'legacy-next' : 'next'
  const requiredAliases = publishTag === 'next'
    && nextMajor !== null
    && candidate.major > nextMajor
    && distTags['legacy-next'] !== distTags.next
    ? [{ tag: 'legacy-next', version: distTags.next }]
    : []
  return { publishTag, requiredAliases }
}

export function resolveDistTag(version, distTags = {}) {
  return resolveDistTagPlan(version, distTags).publishTag
}

function assertCutoverAliases(packageName, requiredAliases) {
  if (requiredAliases.length === 0)
    return

  // npm trusted publishing authorizes `npm publish`, but not dist-tag writes.
  const commands = requiredAliases
    .map(({ tag, version }) => `npm dist-tag add ${packageName}@${version} ${tag}`)
    .join('\n')
  throw new Error(`[dist-tag] Preserve the current release channel before publishing a new major:\n${commands}`)
}

export function readPublishedDistTags(packageName, run = spawnSync) {
  const result = run('npm', ['view', packageName, 'dist-tags', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    if (result.stderr?.includes('E404'))
      return {}
    throw new Error(`[dist-tag] Unable to read npm dist-tags for ${packageName}: ${result.stderr?.trim() || 'npm view failed'}`)
  }

  try {
    return result.stdout.trim() ? JSON.parse(result.stdout) : {}
  }
  catch {
    throw new Error(`[dist-tag] Invalid npm dist-tags response for ${packageName}.`)
  }
}

export function resolvePublishedDistTag(packageName, version, run = spawnSync) {
  const plan = resolveDistTagPlan(version, readPublishedDistTags(packageName, run))
  assertCutoverAliases(packageName, plan.requiredAliases)
  return plan.publishTag
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const [packageName, version] = process.argv.slice(2)
  if (!packageName || !version)
    throw new Error('Usage: node scripts/resolve-dist-tag.mjs <package-name> <version>')
  process.stdout.write(resolvePublishedDistTag(packageName, version))
}
