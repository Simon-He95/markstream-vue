import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

export function applyFixListItem(md: MarkdownIt) {
  // Normalize list-item related inline tokens after inline tokenization
  // so downstream parsers see corrected children.
  md.core.ruler.after('inline', 'fix_list_item_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: MarkdownToken[] }
    const toks = s.tokens ?? []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      if (t && t.type === 'inline' && Array.isArray(t.children)) {
        try {
          t.children = fixListItem(t.children)
        }
        catch (e) {
          // Keep original children on error to avoid breaking parsing

          console.error('[applyFixListItem] failed to fix inline children', e)
        }
      }
    }
  })
}

function fixListItem(tokens: MarkdownToken[]): MarkdownToken[] {
  const last = tokens[tokens.length - 1]
  const lastContent = String(last?.content ?? '')

  if (last?.type === 'text' && (/^\s*\d+\.\s*$/.test(lastContent) && tokens[tokens.length - 2]?.tag === 'br')) {
    tokens.splice(tokens.length - 1, 1)
  }

  return tokens
}
