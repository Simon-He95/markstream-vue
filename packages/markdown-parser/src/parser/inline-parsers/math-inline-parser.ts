import type { MarkdownToken, MathInlineNode } from '../../types'

// Parse a math_inline token (inline math expressions)
export function parseMathInlineToken(token: MarkdownToken): MathInlineNode {
  const content = token.content ?? ''
  const raw = token.raw === '$$' ? `$${content}$` : token.raw || ''
  return {
    type: 'math_inline',
    content,
    loading: !!token.loading,
    raw,
  }
}
