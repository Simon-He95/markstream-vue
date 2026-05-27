import type { BlockquoteNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseBlockquote(tokens: MarkdownToken[], index: number, options?: ParseOptions): [BlockquoteNode, number];
