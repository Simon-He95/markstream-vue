import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const distDir = join(root, 'dist')

const budgets = {
  maxDistBytes: Number(process.env.MAX_DIST_BYTES || 800 * 1024),
  maxJsChunkBytes: Number(process.env.MAX_JS_CHUNK_BYTES || 300 * 1024),
  maxPackSizeBytes: Number(process.env.MAX_PACK_TGZ_BYTES || 250 * 1024),
  maxPackUnpackedBytes: Number(process.env.MAX_PACK_UNPACKED_BYTES || 800 * 1024),
}

function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function collectFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectFiles(fullPath, files)
    }
    else {
      files.push({
        fullPath,
        relPath: relative(root, fullPath),
        size: stat.size,
      })
    }
  }
  return files
}

const allFiles = collectFiles(distDir)
const distBytes = allFiles.reduce((sum, f) => sum + f.size, 0)
const jsFiles = allFiles.filter(f => f.relPath.endsWith('.js'))
const largestJs = jsFiles.sort((a, b) => b.size - a.size)[0]

const packJson = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: root,
  encoding: 'utf8',
})
const pack = JSON.parse(packJson)?.[0]

if (!pack)
  throw new Error('Failed to read npm pack --dry-run --json output.')

const failures = []
if (distBytes > budgets.maxDistBytes) {
  failures.push(`dist total is ${formatBytes(distBytes)}, exceeds budget ${formatBytes(budgets.maxDistBytes)}`)
}
if (largestJs && largestJs.size > budgets.maxJsChunkBytes) {
  failures.push(`${largestJs.relPath} is ${formatBytes(largestJs.size)}, exceeds JS chunk budget ${formatBytes(budgets.maxJsChunkBytes)}`)
}
if (pack.size > budgets.maxPackSizeBytes) {
  failures.push(`npm tarball is ${formatBytes(pack.size)}, exceeds budget ${formatBytes(budgets.maxPackSizeBytes)}`)
}
if (pack.unpackedSize > budgets.maxPackUnpackedBytes) {
  failures.push(`npm unpacked size is ${formatBytes(pack.unpackedSize)}, exceeds budget ${formatBytes(budgets.maxPackUnpackedBytes)}`)
}

console.log(`[size-check] dist total: ${formatBytes(distBytes)}`)
if (largestJs)
  console.log(`[size-check] largest JS: ${largestJs.relPath} (${formatBytes(largestJs.size)})`)
console.log(`[size-check] pack tarball: ${formatBytes(pack.size)}`)
console.log(`[size-check] pack unpacked: ${formatBytes(pack.unpackedSize)}`)

if (failures.length > 0) {
  console.error('[size-check] Budget check failed:')
  for (const line of failures)
    console.error(`- ${line}`)
  process.exit(1)
}

console.log('[size-check] Budget check passed.')
