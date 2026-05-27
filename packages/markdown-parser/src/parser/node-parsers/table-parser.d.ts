import type { MarkdownToken, ParseOptions, TableNode } from '../../types';
export declare function parseTable(tokens: MarkdownToken[], index: number, options?: ParseOptions): [TableNode, number];
