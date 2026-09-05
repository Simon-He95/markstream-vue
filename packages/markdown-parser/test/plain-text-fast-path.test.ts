import type { MarkdownToken } from '../src'
import { describe, expect, it } from 'vitest'
import { parseInlineTokens } from '../src'

describe('plain text node conversion', () => {
  it.each([false, true])('preserves text shape and the slow-path result with final=%s', (final) => {
    for (const content of ['Hello world', '中文 English 123', 'file.md', 'a: b', '1', 'text undefined suffix', '\n\ttext']) {
      const token = Object.freeze({ type: 'text', content }) as MarkdownToken
      const single = parseInlineTokens([token], content, undefined, { final })
      const followed = parseInlineTokens([token, { type: 'code_inline', content: 'sentinel' } as MarkdownToken], content, undefined, { final })
      expect(single).toStrictEqual([followed[0]])
      expect(single).toStrictEqual([{ type: 'text', content, raw: content, center: false }])
    }
  })

  it('keeps recovery and empty-text cases on their existing paths', () => {
    expect(parseInlineTokens([{ type: 'text', content: '' } as MarkdownToken])).toEqual([])
    expect(parseInlineTokens([{ type: 'text', content: '<' } as MarkdownToken])).toEqual([])
    expect(parseInlineTokens([{ type: 'text', content: 'hello(' } as MarkdownToken], 'hello(')).toMatchObject([{ content: 'hello' }])
    expect(parseInlineTokens([{ type: 'text', content: 'hello(' } as MarkdownToken], 'hello(', undefined, { final: true })).toMatchObject([{ content: 'hello(' }])
    expect(parseInlineTokens([{ type: 'text', content: 'helloundefined' } as MarkdownToken], 'hello')).toMatchObject([{ content: 'hello' }])
  })
})
