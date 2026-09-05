import { describe, expect, it } from 'vitest'
import { inferLinkifyDemotionContext } from '../src/parser/linkifyHeuristics'

describe('linkify context cache', () => {
  it('preserves context inference across repeated hits and eviction', () => {
    const texts = [
      'Ordinary text',
      '文件名：README.md',
      '附件：report.pdf',
      '路径：src/index.ts',
      '股票代码：600000.SH',
      'Files: notes.md',
      'Exchange: NYSE',
      '文件名：'.repeat(5000),
    ]
    const expected = texts.map(text => ({ ...inferLinkifyDemotionContext(text) }))
    for (let i = 0; i < 2100; i++) {
      inferLinkifyDemotionContext(`unique context ${i}`)
      expect(inferLinkifyDemotionContext(texts[0])).toEqual(expected[0])
    }
    expect(texts.map(text => inferLinkifyDemotionContext(text))).toEqual(expected)
  })
})
