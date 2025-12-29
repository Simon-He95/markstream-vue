import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('parseMarkdownToStructure - duplicate question rendering', () => {
  it('does not duplicate the question text when parsing mixed math/ce commands', () => {
    const md = getMarkdown()

    const markdown = `**当堂检测**：  
1. 下列物质属于酚的是（ ）  
   A. $\ce{CH3CH2OH}$  B. $\ce{C6H5CH2OH}$  C. $\ce{}$  D. $\ce{HO-CH2-CH2OH}$  
   **答案**：C`

    const nodes = parseMarkdownToStructure(markdown, md)
    // collect all textual content from the parsed nodes
    function collectTexts(n: any): string[] {
      if (!n)
        return []
      if (Array.isArray(n))
        return n.flatMap(collectTexts)
      if (typeof n === 'string')
        return [n]
      const texts: string[] = []
      if (n.type === 'text' && typeof n.content === 'string')
        texts.push(n.content)
      if (n.children && Array.isArray(n.children))
        texts.push(...n.children.flatMap(collectTexts))
      if (n.items && Array.isArray(n.items))
        texts.push(...n.items.flatMap(collectTexts))
      return texts
    }

    const allTexts = collectTexts(nodes).join('\n')
    // Count occurrences of the core question string
    const needle = '下列物质属于酚的是'
    const occurrences = (allTexts.match(new RegExp(needle, 'g')) || []).length

    expect(occurrences).toBe(1)
  })
})
