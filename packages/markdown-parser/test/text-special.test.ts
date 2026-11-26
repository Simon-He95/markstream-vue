import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('inline `text_special` tokens', () => {
  it('treats escaped punctuation as plain text', () => {
    const md = getMarkdown('text_special')
    const markdown = 'Before \\[brackets\\] and (parens).'

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

  it('reads an explicit \\(...\\) pair as math', () => {
    // `\(...\)` is a TeX delimiter, not a CommonMark escape (#859). Only a
    // literal `(` stays text.
    const md = getMarkdown('text_special-explicit-paren-math')
    const markdown = 'Before \\[brackets\\] and \\(parens\\).'

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    expect(nodes[0]?.type).toBe('paragraph')

    const children = (nodes[0] as any).children as any[]
    expect(children.map(n => n.type)).toContain('math_inline')
    expect(children.find(n => n.type === 'math_inline')?.content).toBe('parens')

    const text = children
      .filter(n => n?.type === 'text')
      .map(n => String(n.content ?? ''))
      .join('')

    expect(text).toBe('Before [brackets] and .')
  })

  it('preserves a visible backslash before escaped punctuation', () => {
    const md = getMarkdown('text_special-visible-backslash')
    const markdown = 'Before \\\\[brackets\\] and \\\\*.'

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    expect(nodes[0]?.type).toBe('paragraph')

    const children = (nodes[0] as any).children as any[]
    const text = children
      .filter(n => n?.type === 'text')
      .map(n => String(n.content ?? ''))
      .join('')

    expect(text).toBe('Before \\[brackets] and \\*.')
  })
})
