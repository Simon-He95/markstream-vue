import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function paragraphChildren(input: string, final: boolean) {
  const md = getMarkdown(`literal-image-bracket-${final ? 'final' : 'stream'}`)
  const nodes = parseMarkdownToStructure(input, md, { final })
  expect(nodes).toHaveLength(1)
  expect(nodes[0]?.type).toBe('paragraph')
  return (nodes[0] as any).children as any[]
}

describe('closed `![...]` that is not an image', () => {
  it.each([
    'Use vec![1, 2, 3] to build it.',
    'Hello![world] there',
    'Click ![icon] to continue.',
    'See ![diagram][fig1] below.',
    '[![alt][a]][b] tail',
  ])('keeps %j as plain text', (input) => {
    for (const final of [false, true]) {
      expect(paragraphChildren(input, final)).toEqual([
        expect.objectContaining({ type: 'text', content: input, raw: input }),
      ])
    }
  })

  it('keeps the bracket as text when the next token is a line break', () => {
    for (const final of [false, true]) {
      const children = paragraphChildren('Use vec![1, 2]\nnext line', final)
      expect(children.some(child => child.type === 'image')).toBe(false)
      expect(children[0]).toMatchObject({ type: 'text' })
      expect(children[0].content.startsWith('Use vec![1, 2]')).toBe(true)
    }
  })

  it('still shows a placeholder for an image that is still streaming after one', () => {
    const children = paragraphChildren('vec![0; n] then ![alt', false)
    expect(children).toEqual([
      expect.objectContaining({ type: 'text', content: 'vec![0; n] then ' }),
      expect.objectContaining({ type: 'image', src: '', alt: 'alt', loading: true }),
    ])
  })

  it.each([
    ['![alt', 'alt'],
    ['![alt]', 'alt'],
    ['![a [b] c](u', 'a [b] c'],
  ])('keeps the streaming placeholder for %j', (input, alt) => {
    expect(paragraphChildren(input, false)).toEqual([
      expect.objectContaining({ type: 'image', src: '', alt, loading: true }),
    ])
  })

  it('still resolves a reference image once its definition arrives', () => {
    const input = 'See ![diagram][fig1] below.\n\n[fig1]: https://example.com/fig.png'
    expect(paragraphChildren(input, true)).toEqual([
      expect.objectContaining({ type: 'text', content: 'See ' }),
      expect.objectContaining({ type: 'image', src: 'https://example.com/fig.png', alt: 'diagram', loading: false }),
      expect.objectContaining({ type: 'text', content: ' below.' }),
    ])
  })
})
