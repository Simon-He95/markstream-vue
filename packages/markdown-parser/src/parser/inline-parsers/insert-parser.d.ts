import type { InsertNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseInsertToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: InsertNode;
    nextIndex: number;
};
