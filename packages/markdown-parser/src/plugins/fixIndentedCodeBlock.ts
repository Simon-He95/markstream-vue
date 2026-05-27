/**
 * Fix indented code blocks that should be paragraphs or inline HTML.
 *
 * In streaming scenarios, AI-generated content may have lines that are
 * indented with 4+ spaces (which markdown-it treats as code blocks per
 * CommonMark spec) but are actually plain text or HTML entities.
 *
 * This plugin runs at the core stage to convert single-line indented
 * code blocks that don't look like code into paragraphs.
 */

import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

export interface FixIndentedCodeBlockOptions {
  /**
   * Whether to enable this fix. Default: true
   */
  enabled?: boolean
}

/**
 * Check if a line looks like code (vs plain text or HTML entities).
 * Returns true if the line appears to be code.
 */
function looksLikeCode(line: string): boolean {
  const trimmed = line.trim()

  // Empty line
  if (!trimmed)
    return false

  // 1. HTML entities at start (e.g., &#10006;, &nbsp;, &amp;)
  // These are typically plain text with character references, not code
  if (/^&[a-z0-9#]+;/i.test(trimmed))
    return false

  // 2. Common programming keywords and JavaScript literals
  if (/^(?:const|let|var|function|class|import|export|if|for|while|return|await|async|yield|try|catch|throw|new|typeof|instanceof|switch|case|break|continue|def|ruby|perl|print|echo|true|false|null|undefined|NaN|Infinity|this)\b/.test(trimmed))
    return true

  // 3. Function/method calls with parentheses
  if (/[a-z_$][\w$]*(?:\.[a-z_$][\w$]*|\['[^']*'\]|\["[^"]*"\]|\[\d+\])*\s*\(/i.test(trimmed))
    return true

  // 4. Property access with dot or bracket notation
  if (/[a-z_$][\w$]*(?:\.[a-z_$][\w$]*|\['[^']*'\]|\["[^"]*"\]|\[[\d+\]])+/i.test(trimmed))
    return true

  // 5. Comparison and logical operators (but not just symbols alone)
  // Require identifiers around operators for better precision
  // Match: identifier operator identifier OR operator(s) identifier
  if (/\w+\s*(?:===?|!==?|<=?|>=?|\+\+|--|&&|\|\||\?\.)/.test(trimmed))
    return true
  // Double operators before identifier (like !!value) - but avoid matching list items
  if (/^(?:!!|\+\+|--)\s*\w/.test(trimmed))
    return true

  // 6. Assignment operators
  if (/[\w$]+\s*(?:\+=|-=|\*=|\/=|%=|\*\*=|=)/.test(trimmed))
    return true

  // 7. URLs, protocols
  if (/^(?:https?:\/\/|ftp:\/\/|file:\/\/|\/\/|www\.)/i.test(trimmed))
    return true

  // 8. Template strings with interpolation
  if (/`[^`]*\$\{[^}]*\}[^`]*`/.test(trimmed))
    return true

  // 9. JSX/TSX tags (uppercase component names)
  if (/<\/?[A-Z][a-zA-Z0-9]*/.test(trimmed))
    return true

  // 10. HTML-like tags (lowercase with attributes)
  if (/<[a-z][a-z0-9]*\s[^>]+>/.test(trimmed))
    return true

  // 11. Quoted strings (single, double, backtick) - often code statements
  if (/^(["'`]).*\1\s*[;,]?$/.test(trimmed))
    return true

  // 12. Array/object/function patterns with brackets
  // Empty brackets [] {} () are common in code
  if (/^\[[\s\S]*\]$/.test(trimmed) || /^\{[\s\S]*\}$/.test(trimmed) || /^\(\s*\)$/.test(trimmed)) {
    return true
  }

  // 13. Code-like expressions with identifiers and operators
  // e.g., a + b, x > y, count !== 0
  // This also catches property access like foo.bar
  // Must have at least one identifier (letter/digit/underscore) on each side of operator
  if (/[\w$]+(?:\s*[+\-*/%<>=!&|^~:]+\s*[\w$]+|\s*\.\s*[\w$]+)/.test(trimmed))
    return true

  // 14. Arrow functions, fat arrows
  if (/=>|->|::/.test(trimmed))
    return true

  // 15. Decorators and annotations
  if (/^@[\w.$]+$/.test(trimmed))
    return true

  // 16. Numbers (hex, binary, octal, decimal with units)
  if (/^(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d*)?(?:px|em|rem|%|vh|vw|deg|s|ms)?)$/.test(trimmed))
    return true

  // 17. Variable declarations with $ (common in jQuery/shell)
  if (/^\$[\w$]+\s*[=:]/.test(trimmed))
    return true

  // 18. Pipes and special operators
  if (/\|\s*\w+|\w+\s*\|/.test(trimmed))
    return true

  // 19. Command-like patterns (git, npm, etc.)
  if (/^(?:git|npm|yarn|pnpm|bun|pip|cargo|go|rust|python|node|java|mvn|gradle|docker|kubectl)\s+/.test(trimmed))
    return true

  // 20. Console methods and common API calls
  if (/(?:console|window|document|Math|JSON|Date|Array|Object|String|Number|Boolean)\.[a-zA-Z]/.test(trimmed))
    return true

  // 21. Comment patterns
  if (/^(?:\/\/|#|\/\*|\*\/|<!--|-->)/.test(trimmed))
    return true

  // 22. Heredoc patterns
  if (/^(?:<<<|<<\s*['"]?\w+['"]?)/.test(trimmed))
    return true

  // Default: doesn't look like code
  return false
}

export function applyFixIndentedCodeBlock(md: MarkdownIt, options: FixIndentedCodeBlockOptions = {}) {
  if (options.enabled === false)
    return

  // Process at the core stage after tokenization is complete
  md.core.ruler.after('inline', 'fix_indented_code_block', (state: unknown) => {
    const tokens = (state as { tokens?: MarkdownToken[] }).tokens ?? []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      // Look for single-line code_block tokens
      if (token.type !== 'code_block')
        continue

      const content = String(token.content ?? '').trim()
      if (!content)
        continue

      const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)

      // Only convert single-line code blocks that don't look like code
      if (lines.length === 1 && !looksLikeCode(lines[0] ?? '')) {
        // Convert code_block to paragraph
        const textContent = lines[0] ?? ''
        const level = token.level ?? 0

        // Replace code_block token with paragraph tokens
        tokens.splice(i, 1, { type: 'paragraph_open', tag: 'p', nesting: 1, level }, {
          type: 'inline',
          tag: '',
          nesting: 0,
          level,
          content: textContent,
          children: [{ type: 'text', content: textContent, level: level + 1, raw: textContent }],
          block: true,
        }, { type: 'paragraph_close', tag: 'p', nesting: -1, level })
        // Skip the newly inserted tokens
        i += 2
      }
    }
  })
}
