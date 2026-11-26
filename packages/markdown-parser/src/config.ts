/**
 * MathOptions control how the math plugin normalizes content before
 * handing it to KaTeX (or other math renderers).
 *
 * - commands: list of command words that should be auto-prefixed with a
 *   backslash if not already escaped (e.g. 'infty' -> '\\infty'). Use a
 *   conservative list to avoid false positives in prose.
 * - escapeExclamation: whether to escape standalone '!' to '\\!' (default true).
 */
export interface MathOptions {
  /** List of command words to auto-escape. */
  commands?: readonly string[]
  /** Whether to escape standalone '!' (default: true). */
  escapeExclamation?: boolean
  /**
   * Strict delimiter mode.
   * - When true, only explicit TeX delimiters are recognized as math:
   *   inline: `$...$` and `\(...\)`; block: `$$...$$` and `\[...\]`.
   * - Heuristics and mid-state (unclosed) math detection are disabled.
   */
  strictDelimiters?: boolean
  /**
   * How an inline `\(...\)` pair is read.
   * - `'math'` (default): an explicit TeX delimiter, math in every mode. The
   *   delimiter decides, not the content, so `\(3\)`, `\(dx\)` and `\(n!\)`
   *   are all math and an unclosed `\(` is predicted as math while streaming.
   * - `'escape'`: a CommonMark escape that renders literal parentheses. `\(`
   *   never opens a formula, so streaming stays stable in this mode too.
   */
  inlineParenDelimiter?: 'math' | 'escape'
}

let defaultMathOptions: MathOptions | undefined

export function setDefaultMathOptions(opts: MathOptions | undefined) {
  defaultMathOptions = opts
}

export function getDefaultMathOptions(): MathOptions | undefined {
  return defaultMathOptions
}
