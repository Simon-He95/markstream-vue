import type { MarkdownToken, ParseOptions, SubscriptNode } from '../../types';
export declare function parseSubscriptToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: SubscriptNode;
    nextIndex: number;
};
