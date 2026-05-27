import type { AdmonitionNode, MarkdownToken, ParseOptions } from '../../types';
export declare function parseAdmonition(tokens: MarkdownToken[], index: number, match: RegExpExecArray, options?: ParseOptions): [AdmonitionNode, number];
