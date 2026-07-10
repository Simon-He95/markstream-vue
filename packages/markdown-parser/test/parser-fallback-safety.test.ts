import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectText(value: any): string {
  if (!value || typeof value !== 'object')
    return ''
  if (value.type === 'text')
    return String(value.content ?? '')
  if (Array.isArray(value))
    return value.map(collectText).join('')
  return collectText(value.children)
}

function collectNodes(value: any, type: string, result: any[] = []) {
  if (!value || typeof value !== 'object')
    return result
  if (Array.isArray(value)) {
    for (const item of value)
      collectNodes(item, type, result)
    return result
  }
  if (value.type === type)
    result.push(value)
  collectNodes(value.children, type, result)
  return result
}

describe('inline parser fallback safety', () => {
  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])('does not pair a later strong span after an invalid strong opener (final=%s, streamParse=%s)', (final, streamParse) => {
    const markdown = '前缀a**(abc)**：后缀**ok**：'
    const md = getMarkdown('parser-fallback-invalid-strong')
    const nodes = parseMarkdownToStructure(markdown, md, { final, streamParse })

    expect(collectText(nodes)).toBe('前缀a**(abc)**：后缀ok：')
    expect(collectNodes(nodes, 'strong')).toHaveLength(1)
    expect(collectNodes(nodes, 'strong')[0]).toMatchObject({ raw: '**ok**' })
  })

  it('keeps a punctuation-delimited strong opener valid', () => {
    const markdown = '(**(abc)**'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('parser-fallback-punctuation-strong'), { final: true })

    expect(collectText(nodes)).toBe('((abc)')
    expect(collectNodes(nodes, 'strong')).toHaveLength(1)
  })

  it('recognizes strong text after a supplementary Han character', () => {
    const markdown = '𠀀**《法》**：'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('parser-fallback-supplementary-han'), { final: true })

    expect(collectText(nodes)).toBe('𠀀《法》：')
    expect(collectNodes(nodes, 'strong')).toHaveLength(1)
  })

  it('keeps a link nested inside strong text', () => {
    const markdown = '了：**[《法》](https://example.com)**：'
    const md = getMarkdown('parser-fallback-strong-link')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(collectText(nodes)).toBe('了：《法》：')
    expect(collectNodes(nodes, 'strong')).toHaveLength(1)
    expect(collectNodes(nodes, 'link')).toHaveLength(1)
  })

  it('does not create strong text for non-flanking link markers', () => {
    const markdown = 'a**[法](https://example.com)**b'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('parser-fallback-nonflanking-link'), { final: true })

    expect(collectText(nodes)).toBe('a**法**b')
    expect(collectNodes(nodes, 'strong')).toHaveLength(0)
  })

  it('keeps escaped link markers literal', () => {
    const markdown = '\\*\\*[法](https://example.com)\\*\\*'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('parser-fallback-escaped-link'), { final: true })

    expect(collectText(nodes)).toBe('**法**')
    expect(collectNodes(nodes, 'strong')).toHaveLength(0)
  })

  it('keeps delimiter recovery stable when streaming splits around inline markers', () => {
    const markdown = '了：**[《法》](https://example.com)**：'
    const splitPoints = [2, 5, 7, markdown.indexOf('](') + 1, markdown.length - 2]

    for (const splitPoint of splitPoints) {
      const md = getMarkdown(`parser-fallback-stream-${splitPoint}`)
      parseMarkdownToStructure(markdown.slice(0, splitPoint), md, { final: false, streamParse: true })
      const streamed = parseMarkdownToStructure(markdown, md, { final: true, streamParse: true })
      const sync = parseMarkdownToStructure(markdown, getMarkdown(`parser-fallback-sync-${splitPoint}`), { final: true, streamParse: false })

      expect(collectText(streamed)).toBe(collectText(sync))
      expect(collectNodes(streamed, 'strong')).toHaveLength(1)
      expect(collectNodes(streamed, 'link')).toHaveLength(1)
    }
  })
})
