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
import type { MarkdownIt } from '../markdown-it-types';
export interface FixIndentedCodeBlockOptions {
    /**
     * Whether to enable this fix. Default: true
     */
    enabled?: boolean;
}
export declare function applyFixIndentedCodeBlock(md: MarkdownIt, options?: FixIndentedCodeBlockOptions): void;
