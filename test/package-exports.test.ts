import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('package exports', () => {
  it('does not advertise CommonJS require entries for ESM-only builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
    const entries = Object.values(packageJson.exports ?? {})

    for (const entry of entries) {
      if (entry && typeof entry === 'object')
        expect(entry).not.toHaveProperty('require')
    }
  })
})
