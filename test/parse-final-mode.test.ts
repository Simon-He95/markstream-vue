import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function walk(value: unknown, visit: (node: any) => void, seen = new WeakSet<object>()) {
  if (!value)
    return
  if (typeof value !== 'object')
    return
  if (seen.has(value))
    return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value)
      walk(item, visit, seen)
    return
  }

  const node = value as any
  if (typeof node.type === 'string')
    visit(node)

  for (const child of Object.values(node))
    walk(child as any, visit, seen)
}

function hasLoadingNode(nodes: unknown, type: string) {
  let found = false
  walk(nodes, (node) => {
    if (node.type === type && node.loading === true)
      found = true
  })
  return found
}

describe('parseMarkdownToStructure - final/end-of-stream mode', () => {
  const md = getMarkdown('final-mode')

  it('avoids leaving unclosed block math in loading state when final', () => {
    const input = '$$E=mc^2'
    const mid = parseMarkdownToStructure(input, md)
    expect(hasLoadingNode(mid, 'math_block')).toBe(true)

    const fin = parseMarkdownToStructure(input, md, { final: true })
    expect(hasLoadingNode(fin, 'math_block')).toBe(false)
    expect(JSON.stringify(fin)).toContain('$$')
  })

  it('treats EOF as a closing fence when final', () => {
    const input = '```js\nconsole.log(1)'
    const mid = parseMarkdownToStructure(input, md)
    expect(hasLoadingNode(mid, 'code_block')).toBe(true)

    const fin = parseMarkdownToStructure(input, md, { final: true })
    expect(hasLoadingNode(fin, 'code_block')).toBe(false)
  })
})
