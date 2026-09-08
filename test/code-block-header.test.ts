import { describe, expect, it } from 'vitest'
import { estimateDiffStats, resolveDiffInlineLayout } from '../src/components/CodeBlockNode/codeBlockHeader'

describe('code block lazy header layout', () => {
  it('uses only the public diffStyle option and defaults to split', () => {
    expect(resolveDiffInlineLayout({})).toBe(false)
    expect(resolveDiffInlineLayout({ diffStyle: 'unified' })).toBe(true)
    expect(resolveDiffInlineLayout({
      renderSideBySide: false,
      useInlineViewWhenSpaceIsLimited: true,
      renderSideBySideInlineBreakpoint: 1200,
    })).toBe(false)
  })

  it('computes added/removed counts from a line diff', () => {
    const original = ['a', 'b', 'c', 'keep', 'x'].join('\n')
    const modified = ['a', 'b', 'd', 'keep', 'y', 'z'].join('\n')
    const stats = estimateDiffStats(original, modified)
    expect(stats.removed).toBe(2) // c, x
    expect(stats.added).toBe(3) // d, y, z
  })

  it.each(['\n', '\r\n', '\r'])('distinguishes repeated, empty, and Unicode lines (%j)', (newline) => {
    const original = ['old', '重复', '', '重复', 'end-old', ''].join(newline)
    const modified = ['new', '重复', '重复', '', 'end-new', ''].join(newline)
    expect(estimateDiffStats(original, modified)).toEqual({ removed: 3, added: 3 })
  })

  it('returns a stable result for the same input pair (memo)', () => {
    const original = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n')
    const modified = `${original}\ntail added`
    const first = estimateDiffStats(original, modified)
    const second = estimateDiffStats(original, modified)
    expect(second).toBe(first)
  })

  it('recomputes when the pair changes', () => {
    const original = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n')
    const modifiedA = `${original}\ntail added`
    const modifiedB = `${original}\ntail changed`
    const statsA = estimateDiffStats(original, modifiedA)
    const statsB = estimateDiffStats(original, modifiedB)
    expect(statsA.added).toBe(1)
    expect(statsB.added).toBe(1)
    expect(statsA).not.toBe(statsB)
  })
})
