import { parseFenceToken } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('fence parser trailing fence cleanup', () => {
  it('removes a trailing fence-marker line from UNCLOSED (streaming) fence content', () => {
    const token: any = {
      type: 'fence',
      info: 'ts',
      content: 'const a = 1\n```',
      markup: '```',
      map: [0, 2],
      meta: { closed: false },
    }

    const node = parseFenceToken(token as any)
    expect(node).toBeDefined()
    expect((node as any).code).toBe('const a = 1')
    expect((node as any).raw).toBe('const a = 1')
  })

  it('keeps a trailing backtick-only line in CLOSED fence content', () => {
    // A closed fence's content is authoritative: a nested fence inside a
    // 4-backtick outer block, or code whose last line is a backtick-only
    // line, legitimately ends with one. Only the streaming/unclosed case is
    // ambiguous (a misplaced closing line), and only for the fence's OWN
    // marker character.
    const token: any = {
      type: 'fence',
      info: 'ts',
      content: 'const a = 1\n```',
      markup: '```',
      map: [0, 2],
    }
    const node = parseFenceToken(token as any)
    expect((node as any).code).toBe('const a = 1\n```')
    expect((node as any).raw).toBe('const a = 1\n```')
  })

  it('does not strip a backtick line when the fence marker is a tilde', () => {
    const token: any = {
      type: 'fence',
      info: 'text',
      content: 'a\n```',
      markup: '~~~',
      map: [0, 2],
      meta: { closed: false },
    }
    const node = parseFenceToken(token as any)
    expect((node as any).code).toBe('a\n```')
  })

  it('withholds a shorter marker run until a longer opening fence is resolved', () => {
    const token: any = {
      type: 'fence',
      info: 'text',
      content: '```\nline\n```',
      markup: '````',
      map: [0, 3],
      meta: { closed: false },
    }
    const pendingNode = parseFenceToken(token as any)
    expect((pendingNode as any).code).toBe('```\nline')

    token.meta.closed = true
    const finalNode = parseFenceToken(token as any)
    expect((finalNode as any).code).toBe('```\nline\n```')
  })

  it('keeps legitimate content that contains backticks not on their own line', () => {
    const token: any = {
      type: 'fence',
      info: 'text',
      content: 'console.log(\'`inline`)\n', // backtick inside code, not a fence line
      map: [0, 2],
    }
    const node = parseFenceToken(token as any)
    expect((node as any).code).toBe('console.log(\'`inline`)\n')
    expect((node as any).raw).toBe('console.log(\'`inline`)\n')
  })
})
