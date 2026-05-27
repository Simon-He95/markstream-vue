import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const snapshotPath = join(root, 'test', 'public-api', 'public-api.snapshot.txt')
const distPath = join(root, 'dist', 'index.js')

if (!existsSync(snapshotPath)) {
  console.error(`[public-api-runtime] Missing ${relative(root, snapshotPath)}. Run pnpm test:api:update first.`)
  process.exit(1)
}

if (!existsSync(distPath)) {
  console.error(`[public-api-runtime] Missing ${relative(root, distPath)}. Run pnpm build first.`)
  process.exit(1)
}

const snapshot = readFileSync(snapshotPath, 'utf8')

const valueExports = snapshot
  .split('\n')
  .map(line => line.trim())
  .filter(line => /\[(?:[^\]]*\+)?value(?:\+[^\]]*)?\]$/.test(line))
  .map(line => line.replace(/\s+\[[^\]]+\]$/, ''))

const mod = await import(pathToFileURL(distPath).href)

const missing = []

for (const name of valueExports) {
  if (name === 'default') {
    if (!('default' in mod))
      missing.push('default')
    continue
  }

  if (!(name in mod))
    missing.push(name)
}

if (missing.length > 0) {
  console.error('[public-api-runtime] Missing runtime exports from dist/index.js:')
  for (const name of missing)
    console.error(`  - ${name}`)
  process.exit(1)
}

console.log(`[public-api-runtime] All ${valueExports.length} runtime value exports present in dist/index.js`)
