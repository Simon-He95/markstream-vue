import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function parse(markdown: string, id: string, final = true) {
  const md = getMarkdown(id)
  return parseMarkdownToStructure(markdown, md, { final }) as any[]
}

describe('triple-underscore strong emphasis', () => {
  it('parses `___text___` as emphasis around strong instead of literal underscores', () => {
    const nodes = parse('___bold italic___', 'triple-underscore-plain')

    const paragraph = nodes[0] as any
    expect(paragraph.type).toBe('paragraph')
    expect(collect(nodes, 'emphasis').length).toBe(1)
    expect(collect(nodes, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'bold italic')).toBe(true)
    expect(collect(nodes, 'text').map((node: any) => node.content)).not.toContain('___bold italic___')
  })

  it('keeps surrounding text when a triple-underscore run is embedded in a paragraph', () => {
    const nodes = parse('a ___inner___ b', 'triple-underscore-embedded')

    const paragraph = nodes[0] as any
    const emphasis = paragraph.children.find((child: any) => child.type === 'emphasis')
    expect(emphasis).toBeDefined()
    expect(collect(nodes, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'a ')).toBe(true)
    expect(textIncludes(nodes, ' b')).toBe(true)
    expect(textIncludes(nodes, 'inner')).toBe(true)
    expect(collect(nodes, 'text').map((node: any) => node.content).join('')).not.toContain('___')
  })

  it('parses `____text____` as nested strong', () => {
    const nodes = parse('____nested____', 'quadruple-underscore')

    expect(collect(nodes, 'strong').length).toBe(2)
    expect(textIncludes(nodes, 'nested')).toBe(true)
  })

  it('parses a triple-underscore run nested inside double-asterisk strong', () => {
    const nodes = parse('**___inner___**', 'triple-underscore-in-strong')

    expect(collect(nodes, 'strong').length).toBe(2)
    expect(collect(nodes, 'emphasis').length).toBe(1)
    expect(textIncludes(nodes, 'inner')).toBe(true)
  })

  it('parses a triple-underscore run in streaming mid-state too', () => {
    const nodes = parse('___inner___', 'triple-underscore-midstate', false)

    expect(collect(nodes, 'emphasis').length).toBe(1)
    expect(collect(nodes, 'strong').length).toBe(1)
  })

  it('still renders a standalone `___` line as a thematic break', () => {
    const nodes = parse('before\n\n___\n\nafter', 'triple-underscore-thematic-break')

    expect(collect(nodes, 'thematic_break').length).toBe(1)
    expect(collect(nodes, 'emphasis').length).toBe(0)
    expect(collect(nodes, 'strong').length).toBe(0)
    expect(textIncludes(nodes, 'before')).toBe(true)
    expect(textIncludes(nodes, 'after')).toBe(true)
  })

  it('still keeps intraword underscores in identifiers literal', () => {
    const nodes = parse('角色共21个:\n- HR_负责人\n- 信息中心_管理员\n- 部件_IT项目_报价申请', 'triple-underscore-identifiers')

    expect(collect(nodes, 'list').length).toBe(1)
    expect(collect(nodes, 'strong').length).toBe(0)
    expect(collect(nodes, 'emphasis').length).toBe(0)
    expect(textIncludes(nodes, 'HR_负责人')).toBe(true)
    expect(textIncludes(nodes, '信息中心_管理员')).toBe(true)
    expect(textIncludes(nodes, '部件_IT项目_报价申请')).toBe(true)
  })
})
