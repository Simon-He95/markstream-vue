import type { MarkdownIt } from '../markdown-it-types';
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types';
import { parseInlineTokens } from './inline-parsers';
export declare function buildAllowedHtmlTagSet(options?: ParseOptions): Set<string>;
export declare function parseMarkdownToStructure(markdown: string, md: MarkdownIt, options?: ParseOptions): ParsedNode[];
export declare function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[];
export { parseInlineTokens };
