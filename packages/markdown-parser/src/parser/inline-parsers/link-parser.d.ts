import type { LinkNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseLinkToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: LinkNode;
    nextIndex: number;
};
