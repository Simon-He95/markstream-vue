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
}

let defaultMathOptions: MathOptions | undefined

export function setDefaultMathOptions(opts: MathOptions | undefined) {
  defaultMathOptions = opts
}

export function getDefaultMathOptions(): MathOptions | undefined {
  return defaultMathOptions
}
