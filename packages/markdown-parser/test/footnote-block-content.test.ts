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
