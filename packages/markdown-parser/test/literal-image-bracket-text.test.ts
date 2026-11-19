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

describe('`![...](...)` whose target can never be an image', () => {
  // markdown-it renders each of these as plain text, so recovery must not build
  // an image that loads forever (`![a](b c)` used to swallow the rest of the line).
  it.each([
    '![a](b c)',
    '![a](b c) tail',
    '![a]( b c )',
    '![a](b\tc)',
    '![a](b c',
    'see ![a](b c) end',
  ])('keeps %j as plain text', (input) => {
    for (const final of [false, true]) {
      expect(paragraphChildren(input, final)).toEqual([
        expect.objectContaining({ type: 'text', content: input }),
      ])
    }
  })

  it('keeps a dead destination followed by a title as text', () => {
    // The typographer turns the quotes, so only the node type is compared.
    for (const final of [false, true]) {
      const children = paragraphChildren('![a](b c "t")', final)
      expect(children.map(child => child.type)).toEqual(['text'])
      expect(children[0].content.startsWith('![a](b c')).toBe(true)
    }
  })

  it('keeps a link with the same dead destination as text', () => {
    for (const final of [false, true]) {
      expect(paragraphChildren('[a](b c)', final)).toEqual([
        expect.objectContaining({ type: 'text', content: '[a](b c)' }),
      ])
    }
  })

  it('keeps a dead destination inside strong as text', () => {
    const children = paragraphChildren('**![a](b c)** ok', true)
    expect(children.map(child => child.type)).toEqual(['strong', 'text'])
    expect(children[0].children).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](b c)' }),
    ])
  })

  it('still builds images for every target markdown-it accepts', () => {
    const valid: Array<[string, string]> = [
      ['![a](<b c>)', 'b%20c'],
      ['![a](b "t")', 'b'],
      ['![a](b(c))', 'b(c)'],
      ['![a]("t")', '%22t%22'],
      ['![a](b"t")', 'b%22t%22'],
    ]
    for (const [input, src] of valid) {
      for (const final of [false, true]) {
        expect(paragraphChildren(input, final), input).toEqual([
          expect.objectContaining({ type: 'image', alt: 'a', src, loading: false }),
        ])
      }
    }
  })

  it('still builds an image for an empty destination', () => {
    for (const input of ['![a]()', '![a]( )']) {
      expect(paragraphChildren(input, true), input).toEqual([
        expect.objectContaining({ type: 'image', alt: 'a', src: '', loading: false }),
      ])
    }
  })

  it.each([
    '![a](<b)',
    '![a](b "t)',
    '![a](b(c)',
    '![a](b',
    '![a](b "t',
    '![a](b(c',
  ])('keeps the unfinished target %j as a placeholder while streaming', (input) => {
    expect(paragraphChildren(input, false)).toEqual([
      expect.objectContaining({ type: 'image', alt: 'a', loading: true }),
    ])
  })

  it.each([
    '![a](<b)',
    '![a](b "t)',
    '![a](b(c)',
    '![a](b',
    '![a](b "t',
    '![a](b(c',
  ])('keeps the unfinished target %j as text when the parse is final', (input) => {
    // Nothing can arrive any more, so a target that never closed can't resolve.
    // ImageNode renders only a shimmer while `loading` is true, so a final
    // placeholder would shimmer forever.
    expect(paragraphChildren(input, true)).toEqual([
      expect.objectContaining({ type: 'text' }),
    ])
  })

  it('does not turn a linkified destination containing a space into an image', () => {
    // `https://e.com/a b.png` is grabbed by linkify, so this never reaches the
    // image path with a `(b c)`-style destination. The image recovery correctly
    // declines it; what remains is the tolerant linkify tail (`!` plus a
    // loading link), which is the same shape this repo already produces for
    // `[a](https://e.com/a b.png)`. Pinned here so it cannot silently turn back
    // into an image with a space and a stray `)` in its src.
    const children = paragraphChildren('![a](https://e.com/a b.png)', true)
    expect(children.some(child => child.type === 'image')).toBe(false)
    expect(children[0]).toMatchObject({ type: 'text', content: '!' })
    expect(children[1]).toMatchObject({
      type: 'link',
      href: 'https://e.com/a b.png)',
      loading: true,
    })
  })

  it.each([
    '![a](b`x`',
    '![a](b*x*',
    '![a](<b`x`',
    '![a](b$x$',
  ])('keeps %j as text when an inline token ends a target that cannot continue', (input) => {
    // A destination can continue through more text or through the link tokens a
    // mid-state `](` produces, but never through inline code, emphasis or math.
    // A loading link would keep its spinner forever at final, so this is text.
    const children = paragraphChildren(input, true)
    expect(children[0]).toMatchObject({ type: 'text' })
    expect(children[0].content.startsWith('![a](b') || children[0].content.startsWith('![a](<b')).toBe(true)
    expect(children.some(child => child.type === 'image')).toBe(false)
    expect(children.some(child => child.type === 'link')).toBe(false)
  })

  it('keeps images that follow a dead destination', () => {
    expect(paragraphChildren('![a](b c) ![b](https://e.com/b.png)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](b c) ' }),
      expect.objectContaining({ type: 'image', alt: 'b', src: 'https://e.com/b.png', loading: false }),
    ])
  })
})
