import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

let paragraphTextCounter = 0

function paragraphText(markdown: string, options: { final?: boolean, streamParse?: boolean } = {}) {
  const md = getMarkdown(`trailing-marker-${paragraphTextCounter++}`)
  const nodes = parseMarkdownToStructure(markdown, md, {
    final: options.final ?? true,
    streamParse: options.streamParse ?? false,
  })
  const first = nodes[0] as { type?: string, children?: Array<{ content?: string, raw?: string }>, raw?: string } | undefined
  if (first?.type === 'paragraph') {
    return (first.children ?? []).map(child => child.content ?? child.raw ?? '').join('|')
  }
  return first?.raw ?? ''
}

describe('trailing mid-state marker stripping', () => {
  it('preserves real trailing characters in final parses', () => {
    expect(paragraphText('plain text(')).toBe('plain text(')
    expect(paragraphText('value *')).toBe('value *')
    expect(paragraphText('2 * 3 *')).toBe('2 * 3 *')
    expect(paragraphText('trail\\')).toBe('trail\\')
    expect(paragraphText('a\nb\\')).toBe('a\nb\\')
    expect(paragraphText('hello (')).toBe('hello (')
    expect(paragraphText('**bold** text *')).toBe('**bold**| text *')
  })

  it('keeps a punctuation tail after a long run of blank lines', () => {
    const source = `Intro\n${'\n'.repeat(32768)}!`
    const nodes = parseMarkdownToStructure(source, getMarkdown('blank-tail'), { final: false, streamParse: true })
    expect(nodes).toMatchObject([
      { type: 'paragraph', raw: 'Intro' },
      { type: 'paragraph', raw: '!' },
    ])
  })

  it.each([['~', 'strikethrough'], ['*', 'strong']])('recovers long %s runs without exhausting the stack', (marker, type) => {
    const source = `Intro ${marker.repeat(8192)}!`
    const nodes = parseMarkdownToStructure(source, getMarkdown('long-markers'), { final: true, streamParse: false })
    expect(nodes[0]).toMatchObject({ type: 'paragraph', raw: source })
    const children = (nodes[0] as { children: Array<{ type: string, raw?: string }> }).children
    expect(children.filter(child => child.type === type)).toHaveLength(2048)
    expect(children.map(child => child.raw).join('')).toBe(source)
  })

  it('still strips streaming mid-state markers in non-final parses', () => {
    // In streaming mode the trailing marker is a mid-state artifact and is
    // dropped so the UI does not flash a dangling `(` / `*`.
    const md = getMarkdown(`trailing-marker-stream-${paragraphTextCounter++}`)
    const nodes = parseMarkdownToStructure('plain text(', md, {
      final: false,
      streamParse: true,
    })
    const first = nodes[0] as { type?: string, children?: Array<{ content?: string }> } | undefined
    const text = first?.type === 'paragraph'
      ? (first.children ?? []).map(child => child.content ?? '').join('|')
      : ''
    expect(text).toBe('plain text')
  })
})
