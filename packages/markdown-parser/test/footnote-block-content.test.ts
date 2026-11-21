import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('footnote block content', () => {
  it.each([false, true])('keeps code and the backlink in a footnote with final=%s', (final) => {
    const source = [
      'See[^a].',
      '',
      '[^a]: Example:',
      '',
      '        const first = 1',
      '',
      '    ```js',
      '    const second = 2',
      '    ```',
    ].join('\n')
    const nodes = parseMarkdownToStructure(source, getMarkdown(), { final })
    expect(nodes.find(node => node.type === 'footnote')).toMatchObject({
      id: 'a',
      children: [
        { type: 'paragraph', raw: 'Example:' },
        { type: 'code_block', code: expect.stringContaining('const first = 1') },
        { type: 'code_block', language: 'js', code: expect.stringContaining('const second = 2') },
        { type: 'footnote_anchor', id: 'a' },
      ],
    })
  })

  it('keeps code block types once their content arrives during streaming', () => {
    const md = getMarkdown()
    const indentedCode = 'const first = 1'
    const fencedCode = 'const second = 2'
    const source = [
      'See[^a].',
      '',
      '[^a]: Example:',
      '',
      `        ${indentedCode}`,
      '',
      '    ```js',
      `    ${fencedCode}`,
      '    ```',
      '',
      '## After',
      '',
      'Tail.',
    ].join('\n')
    const codeEnd = (code: string) => source.indexOf(code) + code.length
    const footnoteChildren = (markdown: string, final = false) => parseMarkdownToStructure(markdown, md, { final })
      .find(node => node.type === 'footnote')?.children

    for (let end = codeEnd(indentedCode); end <= source.length; end++) {
      const children = footnoteChildren(source.slice(0, end))
      expect(children?.[1], `prefix ${end}`).toMatchObject({ type: 'code_block', code: expect.stringContaining(indentedCode) })
      if (end >= codeEnd(fencedCode))
        expect(children?.[2], `prefix ${end}`).toMatchObject({ type: 'code_block', code: expect.stringContaining(fencedCode) })
    }
    const expected = ['paragraph', 'code_block', 'code_block', 'footnote_anchor']
    expect(footnoteChildren(source)?.map(node => node.type)).toEqual(expected)
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
    expect(footnoteChildren(source, true)?.map(node => node.type)).toEqual(expected)
  })

  it('does not let code in a footnote change link detection in the following paragraph', () => {
    const source = 'See[^a].\n\n[^a]: Intro.\n\n        File names: notes\n\n    Visit example.ai.'
    const nodes = parseMarkdownToStructure(source, getMarkdown(), { final: true })
    expect(nodes.find(node => node.type === 'footnote')?.children.at(-1)).toMatchObject({
      type: 'paragraph',
      children: expect.arrayContaining([expect.objectContaining({ type: 'link', href: 'http://example.ai' })]),
    })
  })

  it('preserves nested list and quote structure and the backlink in a final paragraph', () => {
    const source = 'See[^a] and again[^a].\n\n[^a]: Intro.\n\n    - item\n\n    > quote\n\n    End.'
    const nodes = parseMarkdownToStructure(source, getMarkdown(), { final: true })
    expect(nodes.find(node => node.type === 'footnote')).toMatchObject({
      children: [
        { type: 'paragraph', raw: 'Intro.' },
        { type: 'list', items: [{ type: 'list_item', raw: 'item' }] },
        { type: 'blockquote', children: [{ type: 'paragraph', raw: 'quote' }] },
        { type: 'paragraph', children: [{ type: 'text', content: 'End.' }, { type: 'footnote_anchor', id: 'a' }] },
      ],
    })
  })

  it('leaves an empty footnote empty', () => {
    const nodes = parseMarkdownToStructure('See[^a].\n\n[^a]:', getMarkdown(), { final: true })
    expect(nodes.find(node => node.type === 'footnote')).toMatchObject({ id: 'a', children: [] })
  })
})
