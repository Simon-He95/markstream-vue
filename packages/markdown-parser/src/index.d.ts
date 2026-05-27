import type { CompatibleMarkdownItPlugin, MarkdownIt } from './markdown-it-types';
import type { FactoryOptions } from './factory';
import { parseInlineTokens, parseMarkdownToStructure, processTokens } from './parser';
export type MarkdownPluginRegistration<TParams extends unknown[] = any[]>
  = | CompatibleMarkdownItPlugin<TParams>
    | readonly [CompatibleMarkdownItPlugin<TParams>, ...TParams];
export declare function registerMarkdownPlugin(plugin: MarkdownPluginRegistration): void;
export declare function clearRegisteredMarkdownPlugins(): void;
export { setDefaultMathOptions } from './config';
export { parseInlineTokens, parseMarkdownToStructure, processTokens };
export type { MathOptions } from './config';
export type { MarkdownIt };
export * from './customHtmlTags';
export { findMatchingClose } from './findMatchingClose';
export * from './htmlRenderUtils';
export * from './htmlTags';
export { parseFenceToken } from './parser/inline-parsers/fence-parser';
export { applyContainers } from './plugins/containers';
export { ESCAPED_TEX_BRACE_COMMANDS, isMathLike, TEX_BRACE_COMMANDS } from './plugins/isMathLike';
export { applyMath, KATEX_COMMANDS, normalizeStandaloneBackslashT } from './plugins/math';
export * from './types';
export interface GetMarkdownOptions extends FactoryOptions {
    plugin?: MarkdownPluginRegistration[];
    apply?: Array<(md: MarkdownIt) => void>;
    /**
     * Custom translation function or translation map for UI texts
     * @default { 'common.copy': 'Copy' }
     */
    i18n?: ((key: string) => string) | Record<string, string>;
}
export declare function getMarkdown(msgId?: string, options?: GetMarkdownOptions): MarkdownIt;
