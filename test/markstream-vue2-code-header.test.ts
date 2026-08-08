import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getLanguageIcon,
  normalizeLanguageIdentifier,
} from '../packages/markstream-vue2/src/utils/languageIcon'

const componentPaths = [
  'packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue',
]

describe('markstream-vue2 React code header parity', () => {
  it('uses the Material TypeScript language icon and canonical label', () => {
    expect(normalizeLanguageIdentifier('ts:example.ts')).toBe('typescript')
    expect(getLanguageIcon('ts')).toContain('fill="#0288d1"')
    expect(getLanguageIcon('ts')).toContain('viewBox="0 0 16 16"')
  })

  it.each(componentPaths)('uses the shared semantic header structure in %s', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8')

    expect(source).toContain('class="code-block-header')
    expect(source).toContain('class="code-header-main"')
    expect(source).toContain('class="code-header-copy"')
    expect(source).toContain('class="code-header-title"')
    expect(source).toContain('class="code-header-actions"')
    expect(source).toContain('class="action-icon"')
    expect(source).not.toContain('px-4 py-2.5')
    expect(source).not.toContain('space-x-2')
    expect(source).not.toContain('font-mono')
  })

  it('keeps the enhanced pre code element on the fallback font metrics', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/markstream-vue2/src/components/PreCodeNode/PreCodeNode.vue'), 'utf8')
    const selector = '.markstream-vue2 pre.code-pre-fallback > .markstream-pre__code'
    const start = source.indexOf(selector)
    const end = source.indexOf('}', start)
    const rule = source.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(rule).toContain('font-size: inherit')
    expect(rule).toContain('line-height: inherit')
    expect(rule).toContain('font-family: inherit')
    expect(rule).toContain('font-weight: inherit')
  })
})
