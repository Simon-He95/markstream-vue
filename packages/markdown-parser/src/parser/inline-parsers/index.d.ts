import type { MarkdownToken, ParsedNode, ParseOptions } from '../../types';
export declare function isLikelyUrl(href?: string): boolean;
export declare function parseInlineTokens(tokens: MarkdownToken[], raw?: string, pPreToken?: MarkdownToken, options?: ParseOptions): ParsedNode[];
