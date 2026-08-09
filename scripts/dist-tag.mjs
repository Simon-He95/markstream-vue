#!/usr/bin/env node
// Prints the npm dist-tag for use inside `pnpm release`:
//
//   DIST_TAG="$(node ../../scripts/dist-tag.mjs)" && pnpm publish --tag "${DIST_TAG}"
//
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { resolvePublishedDistTag } from './resolve-dist-tag.mjs'

const packageJsonPath = process.argv[2] ?? 'package.json'
const { name, version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const distTag = resolvePublishedDistTag(name, version)

process.stdout.write(distTag)
