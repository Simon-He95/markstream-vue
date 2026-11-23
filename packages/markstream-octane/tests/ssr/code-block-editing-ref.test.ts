import { renderToStaticMarkup } from 'octane/server'
import { describe, expect, it } from 'vitest'
import { CodeBlockNode } from '../../src/server'

describe('markstream-octane SSR CodeBlockNode refs', () => {
  it('keeps the editing ref inert while rendering the static shell', () => {
    const ref = { current: null as unknown }
    const { html } = renderToStaticMarkup(CodeBlockNode, {
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const answer = 42',
        raw: '```ts\nconst answer = 42\n```',
        loading: false,
      },
      loading: false,
      ref,
    } as any)

    expect(html).toContain('code-block-node code-block-node--ssr')
    expect(html).toContain('const answer = 42')
    expect(ref.current).toBeNull()
  })
})
