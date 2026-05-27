import type { MarkdownIt } from '../markdown-it-types';
export interface FixHtmlInlineOptions {
    /**
     * Custom HTML-like tag names that should participate in streaming
     * mid-state suppression and complete-tag splitting (e.g. ['thinking']).
     */
    customHtmlTags?: readonly string[];
}
export declare function applyFixHtmlInlineTokens(md: MarkdownIt, options?: FixHtmlInlineOptions): void;
