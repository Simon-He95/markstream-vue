#!/usr/bin/env node
// Build the single GitHub Release that represents a Markstream family release.
//
// A coordinated family release tags every package (parser -> core -> vue ->
// adapters) at the same commit. Creating one GitHub Release per tag buries the
// family behind near-identical entries and lets whichever adapter job finishes
// last steal the repository's "Latest" badge. Instead, exactly one tag per
// commit owns the release: `markstream-vue` when it is part of the train,
// otherwise the first package in anchor order. Every release body carries the
// full package matrix, so the Releases page always presents the whole family.
//
// Usage (CI):
//   git ls-remote --tags origin > /tmp/tags
//   node scripts/build-family-release-notes.mjs \
//     --package markstream-vue --version 2.0.23 \
//     --tags-file /tmp/tags --output /tmp/body.md --changelog CHANGELOG.md
//
// Prints JSON: { "anchor": boolean, "title": string, "bodyPath": string }

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Display order doubles as the package matrix in every release body.
export const FAMILY_PACKAGES = [
  { name: 'markstream-vue', dir: '.', framework: 'Vue 3 / Nuxt / VitePress' },
  { name: 'markstream-react', dir: 'packages/markstream-react', framework: 'React / Next.js' },
  { name: 'markstream-octane', dir: 'packages/markstream-octane', framework: 'Octane' },
  { name: 'markstream-solid', dir: 'packages/markstream-solid', framework: 'SolidJS / SolidStart' },
  { name: 'markstream-svelte', dir: 'packages/markstream-svelte', framework: 'Svelte 5' },
  { name: 'markstream-angular', dir: 'packages/markstream-angular', framework: 'Angular' },
  { name: 'markstream-vue2', dir: 'packages/markstream-vue2', framework: 'Vue 2.6 / 2.7' },
  { name: 'markstream-core', dir: 'packages/markstream-core', framework: 'Framework-agnostic core' },
  { name: 'stream-markdown-parser', dir: 'packages/markdown-parser', framework: 'Streaming parser' },
]

// Which tag owns the release when several family tags share a commit.
// `markstream-vue` is the flagship package; parser/core ship independently
// often enough to rank above the adapters.
const ANCHOR_PRIORITY = [
  'markstream-vue',
  'stream-markdown-parser',
  'markstream-core',
  'markstream-react',
  'markstream-octane',
  'markstream-solid',
  'markstream-svelte',
  'markstream-angular',
  'markstream-vue2',
]

const FRAMEWORK_HEADLINE = 'Vue · React · Octane · Solid · Svelte · Angular · Vue 2'
const DEFAULT_REPO_URL = 'https://github.com/Simon-He95/markstream-vue'

function isReleaseVersion(version) {
  // Stable or prerelease semver. Nightly tags (`nightly-YYYYMMDD-sha`) are
  // deliberately excluded: they never create GitHub Releases.
  return /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(version)
}

function splitTag(tagName) {
  const separator = tagName.lastIndexOf('@')
  if (separator <= 0)
    return null
  return { packageName: tagName.slice(0, separator), version: tagName.slice(separator + 1) }
}

export function parseRemoteTags(output) {
  const tags = new Map()

  for (const line of output.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/)
    if (!sha || !ref?.startsWith('refs/tags/'))
      continue

    const name = ref.slice('refs/tags/'.length)
    if (name.endsWith('^{}')) {
      // Peeled annotated tag: this is the commit SHA we care about.
      tags.set(name.slice(0, -3), sha)
    }
    else if (!tags.has(name)) {
      tags.set(name, sha)
    }
  }

  return [...tags.entries()].map(([name, sha]) => ({ name, sha }))
}

export function resolveReleaseAnchor({ packageName, version, headSha, tags }) {
  if (!headSha)
    return false

  const familyTagsAtHead = tags.flatMap((tag) => {
    const parsed = splitTag(tag.name)
    if (!parsed || tag.sha !== headSha || !isReleaseVersion(parsed.version))
      return []
    if (!ANCHOR_PRIORITY.includes(parsed.packageName))
      return []
    return [{ ...parsed, sha: tag.sha }]
  })

  const currentTag = familyTagsAtHead.find(tag => tag.packageName === packageName && tag.version === version)
  if (!currentTag)
    return false

  if (familyTagsAtHead.some(tag => tag.packageName === 'markstream-vue'))
    return packageName === 'markstream-vue'

  const currentPriority = ANCHOR_PRIORITY.indexOf(packageName)
  return familyTagsAtHead.every(tag => ANCHOR_PRIORITY.indexOf(tag.packageName) >= currentPriority)
}

export function familyReleaseTitle({ packageName, version }) {
  const headline = packageName === 'markstream-vue' ? FRAMEWORK_HEADLINE : packageName
  return `Markstream ${version} — ${headline}`
}

export function renderFamilySection({ packageName, versions, tags, repoUrl = DEFAULT_REPO_URL }) {
  const rows = FAMILY_PACKAGES.map((pkg) => {
    const version = versions[pkg.name]
    const tagName = version ? `${pkg.name}@${version}` : null
    const label = pkg.name === packageName ? `**${pkg.name}**` : `\`${pkg.name}\``
    const versionCell = version ? `\`${version}\`` : '—'
    const tagCell = tagName && tags.some(tag => tag.name === tagName)
      ? `[tag](${repoUrl}/releases/tag/${encodeURIComponent(tagName)})`
      : '—'

    return `| ${label} | ${pkg.framework} | ${versionCell} | ${tagCell} |`
  })

  return [
    '## Markstream family',
    '',
    'Markstream is one streaming Markdown engine shipped as a package family. Versions at this tag:',
    '',
    '| Package | Framework | Version | GitHub |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

export function extractChangelogSection(changelog, version) {
  if (!changelog)
    return null

  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex(line => line.startsWith(`## [${version}]`))
  if (start === -1)
    return null

  const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['))
  const body = lines.slice(start + 1, end === -1 ? lines.length : end).join('\n').trim()
  return body || null
}

export function buildFamilyReleaseNotes({
  packageName,
  version,
  headSha,
  tags,
  versions,
  changelog = null,
  repoUrl = DEFAULT_REPO_URL,
}) {
  const anchor = resolveReleaseAnchor({ packageName, version, headSha, tags })
  const parts = []

  const changelogSection = extractChangelogSection(changelog, version)
  if (changelogSection)
    parts.push(changelogSection)

  parts.push(renderFamilySection({ packageName, versions, tags, repoUrl }))

  return {
    anchor,
    title: familyReleaseTitle({ packageName, version }),
    body: `${parts.join('\n\n')}\n`,
  }
}

function parseArgs(argv) {
  const args = {
    packageName: null,
    version: null,
    headSha: null,
    tagsFile: null,
    output: null,
    changelog: null,
    repoUrl: DEFAULT_REPO_URL,
    root: process.cwd(),
  }

  for (let index = 0; index < argv.length; index++) {
    const current = argv[index]
    if (current === '--package')
      args.packageName = argv[++index]
    else if (current === '--version')
      args.version = argv[++index]
    else if (current === '--head-sha')
      args.headSha = argv[++index]
    else if (current === '--tags-file')
      args.tagsFile = argv[++index]
    else if (current === '--output')
      args.output = argv[++index]
    else if (current === '--changelog')
      args.changelog = argv[++index]
    else if (current === '--repo-url')
      args.repoUrl = argv[++index]
    else if (current === '--root')
      args.root = argv[++index]
    else
      throw new Error(`Unknown argument: ${current}`)
  }

  if (!args.packageName || !args.version)
    throw new Error('Usage: node scripts/build-family-release-notes.mjs --package <name> --version <semver> [--tags-file <path>] [--output <path>]')

  return args
}

function readTagList(args, root) {
  if (args.tagsFile === '-')
    return readFileSync(0, 'utf8')
  if (args.tagsFile)
    return readFileSync(path.resolve(root, args.tagsFile), 'utf8')

  return execFileSync('git', ['ls-remote', '--tags', 'origin'], { cwd: root, encoding: 'utf8' })
}

function readHeadSha(args, root) {
  if (args.headSha)
    return args.headSha
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args.root)
  const tags = parseRemoteTags(readTagList(args, root))
  const headSha = readHeadSha(args, root)
  const versions = Object.fromEntries(FAMILY_PACKAGES.map((pkg) => {
    const manifestPath = path.join(root, pkg.dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return [pkg.name, manifest.version]
  }))
  const changelogPath = args.changelog ? path.resolve(root, args.changelog) : null
  const changelog = changelogPath && existsSync(changelogPath)
    ? readFileSync(changelogPath, 'utf8')
    : null

  const notes = buildFamilyReleaseNotes({
    packageName: args.packageName,
    version: args.version,
    headSha,
    tags,
    versions,
    changelog,
    repoUrl: args.repoUrl,
  })

  if (!notes.anchor) {
    process.stdout.write(JSON.stringify({ anchor: false, title: notes.title, bodyPath: '' }))
    return
  }

  const bodyPath = args.output ? path.resolve(root, args.output) : null
  if (!bodyPath)
    throw new Error('--output is required when the tag owns the family release.')
  writeFileSync(bodyPath, notes.body)

  process.stdout.write(JSON.stringify({ anchor: true, title: notes.title, bodyPath }))
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    main()
  }
  catch (error) {
    console.error(error?.message || error)
    process.exit(1)
  }
}
