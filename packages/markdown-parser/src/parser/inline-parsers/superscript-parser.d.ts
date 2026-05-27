import type { MarkdownToken, ParseOptions, SuperscriptNode } from '../../types';
export declare function parseSuperscriptToken(tokens: MarkdownToken[], startIndex: number, options?: ParseOptions): {
    node: SuperscriptNode;
    nextIndex: number;
};
