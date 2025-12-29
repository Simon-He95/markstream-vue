import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('inline `text_special` tokens', () => {
  it('treats escaped punctuation as plain text', () => {
    const md = getMarkdown('text_special')
    const markdown = 'Before \\[brackets\\] and \\(parens\\).'

    const nodes = parseMarkdownToStructure(markdown, md)
    expect(nodes[0]?.type).toBe('paragraph')

    const children = (nodes[0] as any).children as any[]
    expect(children.map(n => n.type)).not.toContain('text_special')

    const text = children
      .filter(n => n?.type === 'text')
      .map(n => String(n.content ?? ''))
      .join('')

    expect(text).toBe('Before [brackets] and (parens).')
  })
})
