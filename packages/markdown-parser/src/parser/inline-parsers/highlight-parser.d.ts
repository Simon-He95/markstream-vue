import type { HighlightNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseHighlightToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: HighlightNode;
    nextIndex: number;
};
