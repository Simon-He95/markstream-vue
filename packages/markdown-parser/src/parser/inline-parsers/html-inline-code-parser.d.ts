import type { MarkdownToken, ParsedNode } from '../../types';
type ParseInlineTokensFn = (tokens: MarkdownToken[], raw?: string, pPreToken?: MarkdownToken, options?: {
    requireClosingStrong?: boolean;
    customHtmlTags?: readonly string[];
}) => ParsedNode[];
export declare function parseHtmlInlineCodeToken(token: MarkdownToken, tokens: MarkdownToken[], i: number, parseInlineTokens: ParseInlineTokensFn, raw?: string, pPreToken?: MarkdownToken, options?: {
    requireClosingStrong?: boolean;
    customHtmlTags?: readonly string[];
}): [ParsedNode, number];
export {};
