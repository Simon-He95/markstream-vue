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
    commands?: readonly string[];
    /** Whether to escape standalone '!' (default: true). */
    escapeExclamation?: boolean;
    /**
     * Strict delimiter mode.
     * - When true, only explicit TeX delimiters are recognized as math:
     *   inline: `$...$` and `\\(...\\)`; block: `$$...$$` and `\\[...\\]`.
     *
     * Important: authors should write explicit TeX delimiters with escaped
     * backslashes in source (for example, write `\\(...\\)` rather than
     * an unescaped `\(...\)`). Unescaped `\(...\)` cannot be reliably
     * distinguished from ordinary parentheses and may not be parsed as math.
     * - Heuristics and mid-state (unclosed) math detection are disabled.
     */
    strictDelimiters?: boolean;
}
export declare function setDefaultMathOptions(opts: MathOptions | undefined): void;
export declare function getDefaultMathOptions(): MathOptions | undefined;
