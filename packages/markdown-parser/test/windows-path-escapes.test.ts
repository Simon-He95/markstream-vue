import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function parse(markdown: string, options: Record<string, unknown> = {}) {
  return parseMarkdownToStructure(markdown, getMarkdown(`windows-path-${Math.random()}`), {
    final: true,
    ...options,
  })
}

function firstInline(markdown: string) {
  return (parse(markdown)[0] as any).children[0]
}

describe('windows path normalization', () => {
  it('keeps the separator before an underscore in link destinations', () => {
    const link = firstInline(String.raw`[index.html](G:\Tangula\_lookbook\index.html)`)
    expect(link.type).toBe('link')
    expect(link.href).toBe('G:/Tangula/_lookbook/index.html')
  })

  it('keeps the separator in plain text', () => {
    const text = firstInline(String.raw`open G:\Tangula\_lookbook\index.html now`)
    expect(text.type).toBe('text')
    expect(text.content).toBe('open G:/Tangula/_lookbook/index.html now')
  })

  it('normalizes UNC paths', () => {
    const text = firstInline(String.raw`\\server\share\_site\index.html`)
    expect(text.content).toBe('//server/share/_site/index.html')
  })

  it('leaves fenced code blocks untouched', () => {
    const nodes = parse([
      '```text',
      String.raw`G:\Tangula\_lookbook\index.html`,
      '```',
    ].join('\n'))
    expect((nodes[0] as any).code).toBe('G:\\Tangula\\_lookbook\\index.html\n')
  })

  it('normalizes inline code paths because the parser unescapes them too', () => {
    const paragraph = parse(String.raw`use \`G:\Tangula\_lookbook\index.html\` now`)[0] as any
    expect(paragraph.children[1].type).toBe('inline_code')
    expect(paragraph.children[1].code).toBe('G:/Tangula/_lookbook/index.html')
  })

  it('leaves explicit escapes untouched', () => {
    const text = firstInline(String.raw`G:\\Tangula\\_lookbook\\index.html`)
    expect(text.content).toBe(String.raw`G:\Tangula\_lookbook\index.html`)
  })

  it('leaves escaped Markdown punctuation untouched', () => {
    const paragraph = parse(String.raw`Before \[brackets\] and \*.`)[0] as any
    const text = paragraph.children.map((child: any) => child.content ?? child.raw ?? '').join('')
    expect(text).toBe('Before [brackets] and *.')
  })

  it('can be disabled', () => {
    const link = firstInline(String.raw`[index.html](G:\Tangula\_lookbook\index.html)`)
    const disabled = parse(
      String.raw`[index.html](G:\Tangula\_lookbook\index.html)`,
      { normalizeWindowsPaths: false },
    )
    expect((disabled[0] as any).children[0].href).not.toBe(link.href)
  })
})
