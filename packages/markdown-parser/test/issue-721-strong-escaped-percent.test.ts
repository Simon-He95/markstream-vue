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
    expect(paragraph.children).toHaveLength(2)
    expect(paragraph.children[0]).toMatchObject({
      type: 'strong',
      children: [{ type: 'text', content: 'A' }],
    })
    expect(paragraph.children[1]).toMatchObject({
      type: 'text',
      // CommonMark: an escaped punctuation character renders without its
      // backslash. This used to keep the `\` because the `\(` opener swallowed
      // the following text through the math rule; now `\(...\)` is one formula
      // boundary and `\%` reaches the normal escape rule.
      content: String.raw` (0.0002%)`,
    })
  })
})
