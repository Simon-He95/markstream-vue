import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const ISSUE_SAMPLE = '**农村家庭**为儿子娶媳妇：普遍 **60万~100万元**，按2024年收入算，**要不吃不喝工作26~43年**'

describe('issue 679: tilde in Chinese number ranges', () => {
  it.each([true, false])('keeps range tildes as text when final=%s', (final) => {
    const nodes = parseMarkdownToStructure(ISSUE_SAMPLE, getMarkdown(`issue-679-${final}`), { final })
    const children = nodes[0].children as any[]

    expect(JSON.stringify(nodes)).not.toContain('"type":"subscript"')
    expect(children.filter(child => child.type === 'strong')).toMatchObject([
      { raw: '**农村家庭**' },
      { raw: '**60万~100万元**' },
      { raw: '**要不吃不喝工作26~43年**' },
    ])
  })

  it('still parses explicit subscript markup', () => {
    const nodes = parseMarkdownToStructure('Chemical formula H~2~O', getMarkdown('issue-679-subscript'), { final: true })

    expect(nodes[0].children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'subscript', raw: '~2~' }),
    ]))
  })
})
