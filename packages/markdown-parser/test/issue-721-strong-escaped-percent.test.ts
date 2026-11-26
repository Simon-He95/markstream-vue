import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('issue #721 - strong followed by escaped-paren percent', () => {
  it.each([true, false])('does not overflow the stack for strong A followed by \\(0.0002\\%\\) (final=%s)', { timeout: 1000 }, (final) => {
    const md = getMarkdown('issue-721-strong-escaped-percent')
    const input = String.raw`**A** \(0.0002\%\)`

    let nodes: any[] | undefined
    expect(() => {
      nodes = parseMarkdownToStructure(input, md, { final }) as any[]
    }).not.toThrow()

    const paragraph = nodes![0]
    expect(paragraph.type).toBe('paragraph')
    expect(paragraph.children).toHaveLength(3)
    expect(paragraph.children[0]).toMatchObject({
      type: 'strong',
      children: [{ type: 'text', content: 'A' }],
    })
    expect(paragraph.children[1]).toMatchObject({
      type: 'text',
      content: ' ',
    })
    // `\(...\)` is an explicit TeX delimiter, so it is math regardless of the
    // content (see #859). `\%` stays escaped inside the formula; the stack
    // overflow this test guards is unrelated to how the pair is classified.
    expect(paragraph.children[2]).toMatchObject({
      type: 'math_inline',
      content: '0.0002\\%',
    })
  })
})
