import type { MathOptions } from '../config';
import type { MarkdownIt } from '../markdown-it-types';
export declare const KATEX_COMMANDS: string[];
export declare const ESCAPED_KATEX_COMMANDS: string;
export declare const ESCAPED_MKATWX_COMMANDS: RegExp;
export declare function normalizeStandaloneBackslashT(s: string, opts?: MathOptions): string;
export declare function applyMath(md: MarkdownIt, mathOpts?: MathOptions): void;
