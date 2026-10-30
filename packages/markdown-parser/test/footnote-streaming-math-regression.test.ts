import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collect(nodes: any[], type: string): any[] {
  return nodes.flatMap(node => [
    ...(node.type === type ? [node] : []),
    ...collect(node.children ?? [], type),
    ...collect(node.items ?? [], type),
  ])
}

describe('footnote prefixes and bracket math', () => {
  it.each(['1', 'note_1', 'note-with-dash', '引用'])('does not treat the unfinished definition [^%s] as math', (label) => {
    const md = getMarkdown(`footnote-prefix-${label}`)
    for (const final of [false, true]) {
      const source = `Reference[^${label}].\n\n[^${label}]`
      const nodes = parseMarkdownToStructure(source, md, { final })
      expect(collect(nodes, 'math_block')).toHaveLength(0)
      if (final)
        expect(nodes.at(-1)?.raw).toBe(`[^${label}]`)
      else
        expect(nodes).toHaveLength(1)
    }
  })

  it.each(['[^', '[^1', '[^1]', '[^1]:', '[^1]: '])('defers an ambiguous trailing definition %s until its content arrives', (suffix) => {
    const source = `Reference[^1].\n\n${suffix}`
    const md = getMarkdown(`footnote-pending-${suffix}`)
    const pending = parseMarkdownToStructure(source, md, { final: false })
    expect(pending).toHaveLength(1)
    expect(collect(pending, 'footnote')).toHaveLength(0)
    expect(collect(pending, 'math_block')).toHaveLength(0)
    const completed = parseMarkdownToStructure('Reference[^1].\n\n[^1]: Note.', md, { final: false })
    expect(collect(completed, 'footnote')).toHaveLength(1)
    expect(collect(completed, 'footnote_reference')).toHaveLength(1)
  })

  it('preserves known references, completed lines, inline literals, code and final empty definitions', () => {
    const md = getMarkdown('footnote-pending-boundaries')
    const known = parseMarkdownToStructure('[^1]: Existing note.\n\n[^1]', md, { final: false })
    expect(collect(known, 'footnote_reference')).toHaveLength(1)
    expect(collect(known, 'footnote')).toHaveLength(1)
    for (const source of ['[^unknown]\n', 'Text [^unknown]', '[^unknown] followed by text']) {
      const nodes = parseMarkdownToStructure(source, md, { final: false })
      expect(nodes[0]?.raw).toContain('[^unknown]')
    }
    const code = parseMarkdownToStructure('```text\n[^1]\n```', md, { final: false })
    expect(code[0]?.type).toBe('code_block')
    const empty = parseMarkdownToStructure('Reference[^1].\n\n[^1]:', md, { final: true })
    expect(collect(empty, 'footnote')).toHaveLength(1)
    expect(collect(empty, 'footnote_reference')).toHaveLength(1)
    expect(md.render('[^unknown]')).toContain('[^unknown]')
  })

  it.each([false, true])('preserves footnotes across every prefix with streamParse=%s', (streamParse) => {
    const source = 'The design token system[^1] enables full theme customization.\n\n[^1]: See `design/architecture.md` for the complete token specification.\n\n## Next\n\nRestored tail.'
    const md = getMarkdown(`footnote-prefix-stream-${streamParse}`)
    const cold = getMarkdown(`footnote-prefix-cold-${streamParse}`)
    for (let end = 1; end <= source.length; end++) {
      const nodes = parseMarkdownToStructure(source.slice(0, end), md, { final: false, streamParse })
      expect(collect(nodes, 'math_block'), `prefix ${end}`).toHaveLength(0)
      if (end > source.indexOf('See `'))
        expect(collect(nodes, 'footnote'), `definition prefix ${end}`).toHaveLength(1)
      if (streamParse)
        expect(nodes, `cold prefix ${end}`).toEqual(parseMarkdownToStructure(source.slice(0, end), cold, { final: false, streamParse: false }))
    }
    const final = parseMarkdownToStructure(source, md, { final: true, streamParse })
    const direct = parseMarkdownToStructure(source, getMarkdown(`footnote-prefix-direct-${streamParse}`), { final: true })
    expect(final).toEqual(direct)
    expect(collect(final, 'footnote')).toHaveLength(1)
    expect(collect(final, 'footnote_reference')).toHaveLength(1)
  })

  it.each(['> ', '- '])('does not promote a nested %sfootnote prefix to math', (prefix) => {
    const nodes = parseMarkdownToStructure(`${prefix}[^note_1]`, getMarkdown(`footnote-nested-${prefix}`), { final: false })
    expect(collect(nodes, 'math_block')).toHaveLength(0)
  })

  it.each(['[x^2 + y^2]', '[\\alpha^2]', '\\[^1\\]', '$$^1$$', '[\n^1\n]'])('preserves supported display math %s', (source) => {
    const nodes = parseMarkdownToStructure(source, getMarkdown(`footnote-math-control-${source}`), { final: true })
    expect(collect(nodes, 'math_block')).toHaveLength(1)
  })
})
