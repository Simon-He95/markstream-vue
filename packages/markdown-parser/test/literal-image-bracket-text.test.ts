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

  it.each([
    '![a]',
    'foo ![]',
    '好的![微笑]',
    'see ![fig] at end',
    'Use vec![1, 2, 3] to build it.',
  ])('keeps %j as text when the bracket closes at the end of a final parse', (input) => {
    expect(paragraphChildren(input, true)).toEqual([
      expect.objectContaining({ type: 'text', content: input }),
    ])
  })

  it('keeps a bracket that closes inside strong as text when the parse is final', () => {
    const final = paragraphChildren('**vec![1, 2]** ok', true)
    expect(final.map(child => child.type)).toEqual(['strong', 'text'])
    expect(final[0].children).toEqual([
      expect.objectContaining({ type: 'text', content: 'vec![1, 2]' }),
    ])

    // While streaming the same input still shows the placeholder: the next
    // character could still be `(`.
    const streaming = paragraphChildren('**vec![1, 2]** ok', false)
    expect(streaming[0].children.map((child: any) => child.type)).toEqual(['text', 'image'])
    expect(streaming[0].children[1]).toMatchObject({ type: 'image', loading: true })
  })

  it('keeps a bracket followed by a line break and a paren as text', () => {
    expect(paragraphChildren('![a]\n(b)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a]\n(b)' }),
    ])
  })

  it('keeps a truncated destination as a loading image when the parse is final', () => {
    expect(paragraphChildren('![alt](https://example.com/x.png', true)).toEqual([
      expect.objectContaining({ type: 'image', alt: 'alt', src: 'https://example.com/x.png', loading: true }),
    ])
  })

  it('keeps the progressive placeholder for every prefix of an inline image', () => {
    const input = 'See ![alt](https://example.com/a.png) below.'
    const imageStart = input.indexOf('![')
    const closeParen = input.indexOf(')', imageStart) + 1

    for (let end = imageStart + 2; end <= input.length; end++) {
      const prefix = input.slice(0, end)
      const children = paragraphChildren(prefix, false)
      const image = children.find(child => child.type === 'image')
      expect(image, `no placeholder while streaming ${JSON.stringify(prefix)}`).toBeTruthy()
      expect(children[0]).toMatchObject({ type: 'text', content: 'See ' })

      const closed = end >= closeParen
      expect(image.loading, prefix).toBe(!closed)
      expect(image.alt.startsWith('alt') || 'alt'.startsWith(image.alt), prefix).toBe(true)
      if (closed)
        expect(image.src).toBe('https://example.com/a.png')

      expect(children.slice(2).every(child => child.type === 'text'), prefix).toBe(true)
      if (end === input.length) {
        expect(children.map(child => child.type), prefix).toEqual(['text', 'image', 'text'])
        expect(children[2]).toMatchObject({ type: 'text', content: ' below.' })
      }
    }
  })
})
