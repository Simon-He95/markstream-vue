import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = process.cwd()

const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))

const requiredSubpaths = [
  '.',
  './utils',
  './utils/katex-threshold',
  './utils/performance-monitor',
  './utils/safeRaf',
  './index.css',
  './index.px.css',
  './index.tailwind.css',
  './tailwind',
  './workers/katexWorkerClient',
  './workers/mermaidWorkerClient',
  './workers/katexCdnWorker',
  './workers/mermaidCdnWorker',
  './workers/katexRenderer.worker',
  './workers/mermaidParser.worker',
]

const isolatedRootExports = ['MarkdownRender', 'VueRendererMarkdown', 'CodeBlockNode']

const runtimeSubpathChecks = [
  {
    subpath: './utils',
    exports: ['getLanguageIcon', 'normalizeLanguageIdentifier', 'parseMarkdownToStructure', 'safeRaf'],
  },
  {
    subpath: './utils/katex-threshold',
    exports: ['recommendWorkerThreshold'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './utils/performance-monitor',
    exports: ['disablePerfMonitoring', 'enablePerfMonitoring', 'getPerfReport'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './utils/safeRaf',
    exports: ['safeCancelRaf', 'safeRaf'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/katexWorkerClient',
    exports: ['renderKaTeXInWorker'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/mermaidWorkerClient',
    exports: ['findPrefixOffthread'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/katexCdnWorker',
    exports: ['createKaTeXWorkerFromCDN'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/mermaidCdnWorker',
    exports: ['createMermaidWorkerFromCDN'],
    forbiddenExports: isolatedRootExports,
  },
]

const failures = []
const rootImportTarget = typeof pkg.exports?.['.'] === 'object' ? pkg.exports['.'].import : undefined
const rootBackedSubpathsAllowed = new Set([
  './utils',
])

function normalizeTargets(entry) {
  if (typeof entry === 'string')
    return [{ condition: 'default', target: entry }]

  if (!entry || typeof entry !== 'object')
    return []

  return Object.entries(entry)
    .filter(([, value]) => typeof value === 'string')
    .map(([condition, target]) => ({ condition, target }))
}

function assertTargetExists(subpath, condition, target) {
  if (!target.startsWith('./'))
    return

  const fullPath = join(root, target)
  if (!existsSync(fullPath)) {
    failures.push(
      `${subpath} condition "${condition}" points to missing file: ${target}`,
    )
  }
}

function getPackageSpecifier(subpath) {
  if (subpath === '.')
    return pkg.name

  return `${pkg.name}/${subpath.slice(2)}`
}

for (const subpath of requiredSubpaths) {
  const entry = pkg.exports?.[subpath]

  if (!entry) {
    failures.push(`missing package export subpath: ${subpath}`)
    continue
  }

  const targets = normalizeTargets(entry)

  if (targets.length === 0) {
    failures.push(`package export subpath has no string targets: ${subpath}`)
    continue
  }

  for (const { condition, target } of targets)
    assertTargetExists(subpath, condition, target)

  if (
    subpath !== '.'
    && typeof entry === 'object'
    && typeof entry.import === 'string'
    && typeof rootImportTarget === 'string'
    && entry.import === rootImportTarget
    && !rootBackedSubpathsAllowed.has(subpath)
  ) {
    failures.push(`${subpath} should not import the root bundle (${rootImportTarget})`)
  }
}

for (const { subpath, exports: requiredExports, forbiddenExports = [] } of runtimeSubpathChecks) {
  const specifier = getPackageSpecifier(subpath)

  try {
    const mod = await import(specifier)

    for (const exportName of requiredExports) {
      if (!(exportName in mod))
        failures.push(`${subpath} is missing runtime export "${exportName}"`)
    }

    for (const exportName of forbiddenExports) {
      if (exportName in mod)
        failures.push(`${subpath} unexpectedly exposes root export "${exportName}"`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${subpath} failed runtime import check: ${message}`)
  }
}

if (failures.length > 0) {
  console.error('[package-exports] Package export check failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  console.error(`\nIf this was intentional, update the requiredSubpaths list in ${relative(root, fileURLToPath(import.meta.url))}`)
  process.exit(1)
}

console.log(`[package-exports] All ${requiredSubpaths.length} package export subpaths, targets, and runtime imports are valid.`)
