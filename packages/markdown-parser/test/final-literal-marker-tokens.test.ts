import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

let counter = 0

function parse(markdown: string, final = true) {
  const md = getMarkdown(`final-literal-markers-${counter++}`)
  return parseMarkdownToStructure(markdown, md, { final }) as any[]
}

/** Concatenated visible text of the first paragraph (text + inline code). */
function paragraphText(markdown: string, final = true) {
  const nodes = parse(markdown, final)
  const paragraph = nodes[0] as any
  const walk = (n: any): string => {
    if (!n)
      return ''
    if (Array.isArray(n))
      return n.map(walk).join('')
    if (n.type === 'text' || n.type === 'plain')
      return String(n.content ?? '')
    if (n.type === 'inline_code')
      return String(n.code ?? '')
    return [...(n.children ?? []), ...(n.items ?? [])].map(walk).join('')
  }
  return walk(paragraph)
}

describe('literal marker-only text tokens survive a final parse', () => {
  it('keeps a literal trailing asterisk after emphasis', () => {
    // CommonMark: `*italic**` -> <em>italic</em>*
    expect(paragraphText('*italic**')).toBe('italic*')
  })

  it('keeps a literal trailing asterisk after strong', () => {
    // CommonMark: `**bold***` -> <strong>bold</strong>*
    expect(paragraphText('**bold***')).toBe('bold*')
  })

  it('keeps a literal pipe-only paragraph', () => {
    expect(paragraphText('|')).toBe('|')
  })

  it('still drops the mid-state asterisk tail while streaming', () => {
    // While streaming, a trailing `*` that never opened anything is the user
    // still typing a delimiter, so the mid-state artifact is still removed.
    expect(paragraphText('*italic**', false)).toBe('italic')
  })
})
