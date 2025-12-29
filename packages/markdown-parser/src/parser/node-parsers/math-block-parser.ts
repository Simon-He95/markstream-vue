import type { MarkdownToken, MathBlockNode } from '../../types'

// Parse a math_block token (block/display math expressions)
export function parseMathBlock(token: MarkdownToken): MathBlockNode {
  const content = String(token.content ?? '')
  const raw = token.raw === '$$' ? `$$${content}$$` : String(token.raw ?? '')
  return {
    type: 'math_block',
    content,
    loading: !!token.loading,
    raw,
  }
}
