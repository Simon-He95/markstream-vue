import type { MarkdownIt } from '../markdown-it-types'

export function applyRenderRules(md: MarkdownIt) {
  // Narrow external loose surface to `unknown` and use local casts where
  // needed to interact with markdown-it runtime objects. This reduces the
  // exported type footprint while preserving runtime behavior.
  const defaultImage
    = md.renderer.rules.image
      || function (tokens: unknown, idx: number, options: unknown, env: unknown, self: unknown) {
        const tokensAny = tokens as unknown as import('../types').MarkdownToken[]
        const selfShape = self as unknown as { renderToken?: (tokens: import('../types').MarkdownToken[], idx: number, options?: unknown) => string }
        return selfShape.renderToken ? selfShape.renderToken(tokensAny, idx, options) : ''
      }

  md.renderer.rules.image = (
    tokens: unknown,
    idx: number,
    options: unknown,
    env: unknown,
    self: unknown,
  ) => {
    const tokensAny = tokens as unknown as import('../types').MarkdownToken[]
    const token = tokensAny[idx]
    // Narrow token shape to only the runtime helpers we need to call.
    const tokenShape = token as unknown as { attrSet?: (name: string, val: string) => void }
    tokenShape.attrSet?.('loading', 'lazy')
    const defaultImageFn = defaultImage as unknown as (tokens: import('../types').MarkdownToken[], idx: number, options: unknown, env?: unknown, self?: unknown) => string
    return defaultImageFn(tokensAny, idx, options, env, self)
  }

  md.renderer.rules.fence
    = md.renderer.rules.fence
      || ((tokens: unknown, idx: number) => {
        const tokensAny = tokens as unknown as import('../types').MarkdownToken[]
        const token = tokensAny[idx]
        const tokenShape = token as unknown as { info?: string, content?: string }
        const info = String(tokenShape.info ?? '').trim()
        const langClass = info
          ? `language-${md.utils.escapeHtml((info as string).split(/\s+/g)[0])}`
          : ''
        const code = md.utils.escapeHtml(String(tokenShape.content ?? ''))
        return `<pre class="${langClass}"><code>${code}</code></pre>`
      })
}
