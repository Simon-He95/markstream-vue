import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

let counter = 0

function parse(markdown: string, final = true) {
  const md = getMarkdown(`final-unclosed-strong-${counter++}`)
  return parseMarkdownToStructure(markdown, md, { final }) as any[]
}

/** Concatenated visible text of the parse result. */
function visibleText(nodes: any[]): string {
  const walk = (node: any): string => {
    if (!node)
      return ''
    if (Array.isArray(node))
      return node.map(walk).join('')
    if (node.type === 'text' || node.type === 'plain')
      return String(node.content ?? '')
    if (node.type === 'inline_code')
      return String(node.code ?? '')
    return [...(node.children ?? []), ...(node.items ?? [])].map(walk).join('')
  }
  return walk(nodes)
}

function countType(nodes: any[], type: string): number {
  let count = 0
  const walk = (node: any) => {
    if (!node)
      return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === type)
      count++
    for (const child of [...(node.children ?? []), ...(node.items ?? [])])
      walk(child)
  }
  walk(nodes)
  return count
}

// CommonMark 0.31.2 section 6.2: a run of `*` only opens emphasis when a
// matching right-flanking closer exists. Without a closer the delimiter run is
// literal text, e.g. `**bold` renders as `**bold`, not as <strong>bold</strong>.
// The streaming parser intentionally treats an unclosed `**` as an in-progress
// strong span, but a final parse is authoritative and must keep the characters.
describe('unclosed strong delimiters stay literal in a final parse', () => {
  it('keeps a trailing triple-asterisk run literal', () => {
    const nodes = parse('text ***')
    expect(visibleText(nodes)).toBe('text ***')
    expect(countType(nodes, 'strong')).toBe(0)
  })

  it('keeps an unclosed triple-asterisk run literal before more text', () => {
    const nodes = parse('text *** more')
    expect(visibleText(nodes)).toBe('text *** more')
    expect(countType(nodes, 'strong')).toBe(0)
  })

  it('keeps an unclosed double-asterisk opener literal', () => {
    const nodes = parse('**bold')
    expect(visibleText(nodes)).toBe('**bold')
    expect(countType(nodes, 'strong')).toBe(0)
  })

  it('still parses a closed strong pair in a final parse', () => {
    const nodes = parse('**bold**')
    expect(visibleText(nodes)).toBe('bold')
    expect(countType(nodes, 'strong')).toBe(1)
  })

  it('still parses a strong pair while keeping its literal trailing asterisk', () => {
    const nodes = parse('**bold***')
    expect(visibleText(nodes)).toBe('bold*')
    expect(countType(nodes, 'strong')).toBe(1)
  })

  it('still treats an unclosed strong opener as mid-state while streaming', () => {
    expect(visibleText(parse('**bold', false))).toBe('bold')
  })
})
