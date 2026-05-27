import type { AdmonitionNode, MarkdownToken, ParseOptions } from '../../types';
declare function handleContainerOpen(tokens: MarkdownToken[], index: number, options?: ParseOptions): [AdmonitionNode, number] | null;
export declare const containerTokenHandlers: {
    parseContainer: (tokens: MarkdownToken[], index: number, options?: ParseOptions) => [AdmonitionNode, number];
    matchAdmonition: typeof handleContainerOpen;
};
export {};
