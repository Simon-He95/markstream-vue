import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectText(value: any): string {
  if (!value || typeof value !== 'object')
    return ''
  if (value.type === 'text')
    return String(value.content ?? '')
  if (Array.isArray(value))
    return value.map(collectText).join('')
  return collectText(value.children)
}

function findStrongs(children: any[]) {
  return children.filter((c: any) => c.type === 'strong')
}

const ISSUE_SAMPLE = '动力电池散热失效的核心逻辑可归纳为**"热量产生-传递-分配-排出"四环节的失配**,电芯在大倍率工况下产热功率急剧上升。'
// Rendered text equals the source with the `**` markers consumed
const ISSUE_SAMPLE_RENDERED = '动力电池散热失效的核心逻辑可归纳为"热量产生-传递-分配-排出"四环节的失配,电芯在大倍率工况下产热功率急剧上升。'

describe('issue 646: strong with quote content after Han text', () => {
  it.each([true, false])('parses the issue sample with straight quotes when final=%s', (final) => {
    const nodes = parseMarkdownToStructure(ISSUE_SAMPLE, getMarkdown(`issue-646-${final}`), { final }) as any[]

    // No text is lost (markers consumed, content intact)
    expect(collectText(nodes)).toBe(ISSUE_SAMPLE_RENDERED)
    // The quoted span should be a single strong node, not literal text
    const strongs = findStrongs(nodes[0].children)
    expect(strongs).toHaveLength(1)
    expect(strongs[0].raw).toBe('**"热量产生-传递-分配-排出"四环节的失配**')
    expect(strongs[0].children[0]).toMatchObject({
      type: 'text',
      content: '"热量产生-传递-分配-排出"四环节的失配',
    })
  })

  it('keeps curly-quote content working as before', () => {
    const markdown = '了**\u201C法\u201D**后'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-646-curly'), { final: true }) as any[]

    expect(collectText(nodes)).toBe('了“法”后')
    expect(findStrongs(nodes[0].children)).toHaveLength(1)
  })

  it('parses strong with ASCII single quotes after Han text', () => {
    const markdown = '他说**\'关键\'**内容'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-646-single'), { final: true }) as any[]

    // The markers now delimit a real strong span (CJK-friendly flanking), so the
    // typographer sees a straight quote directly after `说` and directly before
    // `关` — a word-internal quote, which markdown-it reads as an apostrophe.
    // markdown-it + markdown-it-cjk-friendly renders the same `’关键’`.
    expect(collectText(nodes)).toBe('他说’关键’内容')
    const strongs = findStrongs(nodes[0].children)
    expect(strongs).toHaveLength(1)
    expect(strongs[0].children[0]).toMatchObject({ type: 'text', content: '’关键’' })
  })

  it('parses strong when the closing marker directly follows an ASCII closing quote', () => {
    const markdown = '他说**"重点"**是工作'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-646-close-quote'), { final: true }) as any[]

    // Same reason as the single-quote case above: the double quotes are inside
    // the strong span with letters on the outside, so the typographer keeps them
    // straight instead of pairing them. markdown-it + markdown-it-cjk-friendly
    // renders `<strong>&quot;重点&quot;</strong>` for the same input.
    expect(collectText(nodes)).toBe('他说"重点"是工作')
    const strongs = findStrongs(nodes[0].children)
    expect(strongs).toHaveLength(1)
    expect(strongs[0].children[0]).toMatchObject({ type: 'text', content: '"重点"' })
  })
})
