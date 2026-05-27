import type { FootnoteNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseFootnote(tokens: MarkdownToken[], index: number, options?: ParseOptions): [FootnoteNode, number];
