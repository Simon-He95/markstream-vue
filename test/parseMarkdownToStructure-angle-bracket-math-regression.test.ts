import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('parseMarkdownToStructure regressions (angle bracket in math)', () => {
  function collectText(nodes: any, out: string[] = []) {
    if (!nodes)
      return out
    if (Array.isArray(nodes)) {
      for (const n of nodes)
        collectText(n, out)
      return out
    }
    if (typeof nodes !== 'object')
      return out

    const node = nodes as any
    if (typeof node.content === 'string')
      out.push(node.content)
    if (typeof node.raw === 'string')
      out.push(node.raw)

    if (node.children)
      collectText(node.children, out)
    if (node.rows)
      collectText(node.rows, out)
    if (node.cells)
      collectText(node.cells, out)

    return out
  }

  it('does not drop trailing content when inline math contains `<`', () => {
    const md = getMarkdown('angle-bracket-math')
    const markdown = `> **给定输入 $ x $ 和上下文 $ \\\\gamma $，模型要根据已生成的部分输出 $ y_{<i} $，逐 token 地预测下一个 token $ y_i $，并最大化所有 token 的联合概率。**

这个 markdown 后面这一段不应丢失。`

    expect(() => parseMarkdownToStructure(markdown, md)).not.toThrow()
    const nodes = parseMarkdownToStructure(markdown, md)

    const text = collectText(nodes).join('')
    expect(text).toContain('联合概率')
    expect(text).toContain('这个 markdown 后面这一段不应丢失')
  })
})
