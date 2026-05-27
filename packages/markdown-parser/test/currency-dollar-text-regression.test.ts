import { describe, expect, it } from 'vitest'
import { collect } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('currency dollar text regression', () => {
  it.each([
    ' ($450,000) or communication preference\u2014governed by organizational schemas that define types (text, number, date, etc.),',
    ' ($450) or communication preference\u2014governed by organizational schemas that define types (text, number, date, etc.),',
    'The limit is $450,000 or communication preference governed by schemas that define types (text, number).',
    'The limit is $450 or communication preference governed by schemas that define types (text, number).',
    'Costs rose to $1,200.50, then stabilized through usage patterns (email, sms).',
  ])('keeps currency text as text while streaming: %s', (markdown) => {
    const md = getMarkdown('currency-dollar-text')
    const nodes = parseMarkdownToStructure(markdown, md)
    const serialized = JSON.stringify(nodes)

    expect(collect(nodes as any, 'math_inline')).toHaveLength(0)
    expect(serialized).toContain(markdown.includes('$450') ? '$450' : '$1,200.50')
  })

  it('still treats numeric math followed by an operator as loading math', () => {
    const md = getMarkdown('currency-dollar-leading-math')
    const nodes = parseMarkdownToStructure('$1,000 + x', md)
    const math = collect(nodes as any, 'math_inline')

    expect(math).toHaveLength(1)
    expect(math[0]).toMatchObject({
      content: '1,000 + x',
      loading: true,
      markup: '$',
    })
  })
})
