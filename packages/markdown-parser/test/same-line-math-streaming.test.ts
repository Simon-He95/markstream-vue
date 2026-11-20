import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectMathBlocks(nodes: any, out: any[] = []) {
  if (!nodes)
    return out
  if (Array.isArray(nodes)) {
    for (const node of nodes)
      collectMathBlocks(node, out)
    return out
  }
  if (typeof nodes === 'object') {
    if (nodes.type === 'math_block')
      out.push(nodes)
    for (const value of Object.values(nodes))
      collectMathBlocks(value, out)
  }
  return out
}

// A display-math rule emits a math block and, from the same source line, the
// trailing text as a paragraph. Streaming used to reparse that line and emit the
// math block again on top of the cached copy.
const DOC = 'Intro\n\n$$E=mc^2$$, where E is energy.\n\nEnd'

describe('same-line display math stays a single block while streaming', () => {
  it('has at most one math block at every prefix', () => {
    const md = getMarkdown('same-line-math-prefix')
    for (let end = 1; end <= DOC.length; end++) {
      const prefix = DOC.slice(0, end)
      const nodes = parseMarkdownToStructure(prefix, md, { final: false })
      expect(collectMathBlocks(nodes as any[]).length, `prefix ${JSON.stringify(prefix)}`).toBeLessThanOrEqual(1)
    }
  })

  it('keeps streamed nodes equal to a cold parse at every prefix', () => {
    const md = getMarkdown('same-line-math-compare')
    for (let end = 1; end <= DOC.length; end++) {
      const prefix = DOC.slice(0, end)
      const streamed = parseMarkdownToStructure(prefix, md, { final: false, streamParse: true })
      const cold = parseMarkdownToStructure(prefix, getMarkdown(`same-line-math-cold-${end}`), { final: false, streamParse: false })
      expect(streamed, `prefix ${JSON.stringify(prefix)}`).toEqual(cold)
    }
  })

  it('stays single when the document arrives in chunks', () => {
    const md = getMarkdown('same-line-math-chunks')
    const chunks = ['Intro\n\n$$E=mc^2$$, where ', 'E is energy.\n\n', 'End\n']
    let source = ''
    for (const chunk of chunks) {
      source += chunk
      const streamed = parseMarkdownToStructure(source, md, { final: false, streamParse: true })
      expect(collectMathBlocks(streamed as any[]), `source ${JSON.stringify(source)}`).toHaveLength(1)
    }
  })
})
