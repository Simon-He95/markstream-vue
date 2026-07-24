#!/usr/bin/env node
// Prints `--tag next` when the package being published is a prerelease version,
// otherwise prints nothing. Intended for shell expansion inside `pnpm release`:
//
//   pnpm publish --access public $(node ../../scripts/dist-tag.mjs)
//
// npm 11+ refuses to publish a prerelease version (e.g. `1.0.8-beta.0`) without
// an explicit non-`latest` dist-tag, so prereleases are routed to `next` while
// stable versions keep the default `latest` tag.
import { readFileSync } from 'node:fs'
import process from 'node:process'

const packageJsonPath = process.argv[2] ?? 'package.json'
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (typeof version === 'string' && version.includes('-'))
  process.stdout.write('--tag next')
