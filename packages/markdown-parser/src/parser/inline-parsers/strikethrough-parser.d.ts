import type { MarkdownToken, ParseOptions, StrikethroughNode } from '../../types';
export declare function parseStrikethroughToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: StrikethroughNode;
    nextIndex: number;
};
