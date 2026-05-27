#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

const workspaceDeps = [
  {
    name: 'markstream-core',
    packageJson: 'packages/markstream-core/package.json',
  },
  {
    name: 'stream-markdown-parser',
    packageJson: 'packages/markdown-parser/package.json',
  },
]

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
  }

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--package-json') {
      args.packageJson = argv[++i]
    }
    else if (current === '--help' || current === '-h') {
      console.log('Usage: node scripts/check-packed-workspace-deps.mjs --package-json <path>')
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  return args
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function readTarString(buffer) {
  const end = buffer.indexOf(0)
  return buffer.subarray(0, end === -1 ? buffer.length : end).toString('utf8').trim()
}

function readTgzEntry(tarball, entryName) {
  const archive = gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0))
      break

    const name = readTarString(header.subarray(0, 100))
    const prefix = readTarString(header.subarray(345, 500))
    const entryPath = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(readTarString(header.subarray(124, 136)) || '0', 8)
    const bodyOffset = offset + 512

    if (entryPath === entryName)
      return archive.subarray(bodyOffset, bodyOffset + size).toString('utf8')

    offset = bodyOffset + Math.ceil(size / 512) * 512
  }
  throw new Error(`Packed tarball entry not found: ${entryName}`)
}

function packPackage(packageDir, destination) {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', destination, '--json'], {
    cwd: packageDir,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

  const parsed = JSON.parse(output)
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed?.filename
  if (!filename)
    throw new Error('pnpm pack did not return a tarball name.')

  const candidates = [
    path.resolve(filename),
    path.resolve(destination, path.basename(filename)),
  ]
  const tarball = candidates.find(existsSync)
  if (!tarball)
    throw new Error(`Packed tarball not found: ${filename}`)

  return tarball
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = path.resolve(repoRoot, args.packageJson)
const packageDir = path.dirname(packageJsonPath)
const packageJson = readJson(packageJsonPath)
const tmp = mkdtempSync(path.join(tmpdir(), 'markstream-packed-deps-'))
let tarball = ''

try {
  tarball = packPackage(packageDir, tmp)
  const packedPackageJson = JSON.parse(readTgzEntry(tarball, 'package/package.json'))

  for (const dep of workspaceDeps) {
    const localPackageJson = readJson(path.resolve(repoRoot, dep.packageJson))
    const expectedVersion = localPackageJson.version
    const packedVersion = packedPackageJson.dependencies?.[dep.name]

    if (packedVersion !== expectedVersion) {
      throw new Error(
        `[check-packed-workspace-deps] Packed ${packageJson.name} dependency ${dep.name} must be exact ${expectedVersion}, got ${packedVersion ?? 'missing'}.`,
      )
    }

    console.log(`[check-packed-workspace-deps] OK: packed ${dep.name}@${packedVersion}.`)
  }
}
finally {
  if (tarball && existsSync(tarball))
    rmSync(tarball)
  rmSync(tmp, { recursive: true, force: true })
}
