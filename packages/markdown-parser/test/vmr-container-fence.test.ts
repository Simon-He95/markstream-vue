import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('vmr_container fallback', () => {
  it('parses fenced code blocks inside ::: containers', () => {
    const md = getMarkdown('vmr_container_fence')
    const markdown = [
      '::: viewcode:topo-test-001 {"devId":"f318206374eb4ac7a3fb3b4b042fd01d"}',
      '```ts',
      'console.log("hello")',
      '```',
      ':::',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:topo-test-001')
    expect(nodes[0]?.attrs?.devId).toBe('f318206374eb4ac7a3fb3b4b042fd01d')

    const children = nodes[0]?.children as any[]
    expect(Array.isArray(children)).toBe(true)

    const code = children.find(n => n?.type === 'code_block')
    expect(code).toBeDefined()
    expect(code.language).toBe('ts')
    expect(String(code.code ?? '')).toContain('console.log')
  })

  it('parses plain text inside ::: containers', () => {
    const md = getMarkdown('vmr_container_text')
    const cases = ['::: viewcode:plain-text', ':::viewcode:plain-text']

    for (const openLine of cases) {
      const markdown = [
        openLine,
        'just some plain text',
        ':::',
      ].join('\n')
      const nodes = parseMarkdownToStructure(markdown, md) as any[]
      expect(nodes[0]?.type).toBe('vmr_container')
      expect(nodes[0]?.name).toBe('viewcode:plain-text')
      const children = nodes[0]?.children as any[]
      expect(children.length).toBe(1)
      expect(children[0]?.type).toBe('paragraph')
      expect(String(children[0]?.children?.[0]?.content ?? '')).toContain('plain text')
    }
  })

  it('parses multiple blocks inside ::: containers', () => {
    const md = getMarkdown('vmr_container_blocks')
    const markdown = [
      '::: viewcode:multi-block',
      'First paragraph.',
      '',
      '```js',
      'alert(123)',
      '```',
      '',
      '- list item',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    // debug output

    console.log('multi-block AST:', JSON.stringify(nodes, null, 2))
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:multi-block')
    const children = nodes[0]?.children as any[]
    expect(children.some(n => n.type === 'paragraph')).toBe(true)
    expect(children.some(n => n.type === 'code_block')).toBe(true)
    expect(children.some(n => n.type === 'list')).toBe(true)
  })

  it('parses empty or whitespace-only containers', () => {
    const md = getMarkdown('vmr_container_empty')
    const markdown = [
      '::: viewcode:empty',
      '   ',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:empty')
    expect(Array.isArray(nodes[0]?.children)).toBe(true)
    expect(nodes[0]?.children.length).toBe(0)
  })

  it('parses empty or whitespace-only containers -1', () => {
    const md = getMarkdown('vmr_container_empty')
    const markdown = [
      ':::viewcode:empty',
      '   ',
      ':::',
    ].join('\n')
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(nodes[0]?.type).toBe('vmr_container')
    expect(nodes[0]?.name).toBe('viewcode:empty')
    expect(Array.isArray(nodes[0]?.children)).toBe(true)
    expect(nodes[0]?.children.length).toBe(0)
  })
})
