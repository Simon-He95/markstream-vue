import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('parseMarkdownToStructure - streaming strong+math', () => {
  it('does not hang on unclosed strong ending with a closed $...$ span', { timeout: 500 }, () => {
    const md = getMarkdown('stream-strong-math')
    const markdown = '> **给定输入 $ x $'

    expect(() => parseMarkdownToStructure(markdown, md)).not.toThrow()

    // Simulate streaming: repeatedly parse progressive prefixes.
    for (let i = 1; i <= markdown.length; i++) {
      const chunk = markdown.slice(0, i)
      expect(() => parseMarkdownToStructure(chunk, md)).not.toThrow()
    }
  })
})
