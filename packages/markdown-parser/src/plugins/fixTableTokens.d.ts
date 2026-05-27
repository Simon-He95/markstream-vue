import type { MarkdownIt } from '../markdown-it-types';
import type { MarkdownToken } from '../types';
export declare function applyFixTableTokens(md: MarkdownIt): void;
export declare function fixTableTokens(tokens: MarkdownToken[], final?: boolean, source?: string): MarkdownToken[];
