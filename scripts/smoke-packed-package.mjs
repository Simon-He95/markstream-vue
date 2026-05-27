import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./smoke-minimal-install.mjs', import.meta.url))
// The minimal-install smoke packs workspace tarballs before installing them.
const result = spawnSync(process.execPath, [script], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error)
  throw result.error

if (result.status !== 0)
  process.exit(result.status ?? 1)

console.log('[smoke-packed-package] Packed package smoke passed.')
