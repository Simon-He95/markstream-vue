import type { EmphasisNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseEmphasisToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: EmphasisNode;
    nextIndex: number;
};
