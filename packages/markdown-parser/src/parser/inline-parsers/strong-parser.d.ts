import type { MarkdownToken, ParseOptions, StrongNode } from '../../types';
export declare function parseStrongToken(tokens: MarkdownToken[], startIndex: number, raw?: string, options?: ParseOptions): {
    node: StrongNode;
    nextIndex: number;
};
