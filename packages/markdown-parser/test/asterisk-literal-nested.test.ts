import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('asterisk literal handling in nested contexts', () => {
  it('keeps escaped single asterisk literal inside blockquotes while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-blockquote')
    const markdown = '> \\*literal *real*'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('blockquote')
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal inside blockquotes in final mode', () => {
    const md = getMarkdown('asterisk-literal-blockquote-final')
    const markdown = '> prefix *real'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('blockquote')
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal inside table cells while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-table')
    const markdown = `| Col |
| --- |
| \\*literal *real* |`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('table')
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal inside table cells in final mode', () => {
    const md = getMarkdown('asterisk-literal-table-final')
    const markdown = `| Col |
| --- |
| prefix *real |`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('table')
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal after custom tag close on the same line', () => {
    const tags = ['thinking']
    const md = getMarkdown('asterisk-literal-custom-inline', { customHtmlTags: tags })
    const markdown = 'Text <thinking>inside</thinking>\\*literal *real*'
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true })

    expect(nodes[0]?.type).toBe('paragraph')
    expect(collect(nodes as any, 'thinking').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal after custom tag close on the same line', () => {
    const tags = ['thinking']
    const md = getMarkdown('asterisk-literal-custom-inline-final', { customHtmlTags: tags })
    const markdown = 'Text <thinking>inside</thinking>prefix *real'
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true })

    expect(nodes[0]?.type).toBe('paragraph')
    expect(collect(nodes as any, 'thinking').length).toBe(1)
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it.each([true, false])('keeps escaped strong delimiters literal at the start of custom tag content (final=%s)', (final) => {
    const tags = ['thinking']
    const md = getMarkdown(`asterisk-literal-custom-tag-start-${final}`, { customHtmlTags: tags })
    const markdown = '<thinking>\\*\\*literal\\*\\* and **real**</thinking>'
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final })

    expect(collect(nodes as any, 'thinking').length).toBe(1)
    expect(textIncludes(nodes, '**literal** and ')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(1)
  })

  it('keeps escaped single asterisk literal after custom tag close inside table cells', () => {
    const tags = ['my_component']
    const md = getMarkdown('asterisk-literal-custom-table', { customHtmlTags: tags })
    const markdown = `| Item | Value |
| --- | --- |
| A | <my_component label="x"></my_component>\\*literal *real* |
| B | ok |`
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true })

    expect(nodes[0]?.type).toBe('table')
    expect(nodes[0]?.rows).toHaveLength(2)
    expect(collect(nodes as any, 'my_component').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal inside blockquote table cells while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-blockquote-table')
    const markdown = `> | Col |
> | --- |
> | \\*literal *real* |`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('blockquote')
    expect(nodes[0]?.children?.[0]?.type).toBe('table')
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal after custom tag close on the same blockquote line', () => {
    const tags = ['thinking']
    const md = getMarkdown('asterisk-literal-custom-blockquote', { customHtmlTags: tags })
    const markdown = '> Text <thinking>inside</thinking>\\*literal *real*'
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true })

    expect(nodes[0]?.type).toBe('blockquote')
    expect(collect(nodes as any, 'thinking').length).toBe(1)
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps escaped single asterisk literal inside headings while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-heading')
    const markdown = '## \\*literal *real*'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('heading')
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal inside headings in final mode', () => {
    const md = getMarkdown('asterisk-literal-heading-final')
    const markdown = '## prefix *real'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('heading')
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal inside footnotes while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-footnote')
    const markdown = `ref[^1]

[^1]: \\*literal *real*`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[1]?.type).toBe('footnote')
    expect(textIncludes(nodes[1], '*literal')).toBe(true)
    expect(textIncludes(nodes[1], 'real')).toBe(true)
    expect(collect([nodes[1]] as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal inside footnotes in final mode', () => {
    const md = getMarkdown('asterisk-literal-footnote-final')
    const markdown = `ref[^1]

[^1]: prefix *real`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[1]?.type).toBe('footnote')
    expect(textIncludes(nodes[1], 'prefix *real')).toBe(true)
    expect(collect([nodes[1]] as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal inside definition list terms and definitions', () => {
    const md = getMarkdown('asterisk-literal-definition-list')
    const markdown = `\\*term *real*  
: \\*definition *more*`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]).toBeDefined()
    expect(textIncludes(nodes, '*term')).toBe(true)
    expect(textIncludes(nodes, '*definition')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(textIncludes(nodes, 'more')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(2)
  })

  it('keeps unmatched single asterisk literal inside definition list terms and definitions in final mode', () => {
    const md = getMarkdown('asterisk-literal-definition-list-final')
    const markdown = `prefix *term  
: prefix *definition`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]).toBeDefined()
    expect(textIncludes(nodes, 'prefix *term')).toBe(true)
    expect(textIncludes(nodes, 'prefix *definition')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps escaped single asterisk literal inside admonition content while parsing later real emphasis', () => {
    const md = getMarkdown('asterisk-literal-admonition')
    const markdown = `::: note
\\*literal *real*
:::`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('admonition')
    expect(textIncludes(nodes, '*literal')).toBe(true)
    expect(textIncludes(nodes, 'real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(1)
  })

  it('keeps unmatched single asterisk literal inside admonition content in final mode', () => {
    const md = getMarkdown('asterisk-literal-admonition-final')
    const markdown = `::: note
prefix *real
:::`
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })

    expect(nodes[0]?.type).toBe('admonition')
    expect(textIncludes(nodes, 'prefix *real')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })
})
