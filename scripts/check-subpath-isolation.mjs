import { readFileSync } from 'node:fs'
import process from 'node:process'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const rootTypes = pkg.exports?.['.']?.types
const rootImport = pkg.exports?.['.']?.import

const isolatedSubpaths = [
  './utils/katex-threshold',
  './utils/performance-monitor',
  './utils/safeRaf',
  './workers/katexWorkerClient',
  './workers/mermaidWorkerClient',
  './workers/katexCdnWorker',
  './workers/mermaidCdnWorker',
]

const failures = []

for (const subpath of isolatedSubpaths) {
  const entry = pkg.exports?.[subpath]

  if (!entry || typeof entry !== 'object') {
    failures.push(`${subpath} is missing object export entry`)
    continue
  }

  if (entry.import === rootImport)
    failures.push(`${subpath} imports root bundle: ${rootImport}`)

  if (entry.types === rootTypes)
    failures.push(`${subpath} uses root declaration bundle: ${rootTypes}`)
}

if (failures.length > 0) {
  console.error('[subpath-isolation] Failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[subpath-isolation] Dedicated subpath entries look isolated.')
