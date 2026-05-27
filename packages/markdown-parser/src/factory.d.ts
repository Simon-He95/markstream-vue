export interface FactoryOptions extends Record<string, unknown> {
    markdownItOptions?: Record<string, unknown>;
    enableMath?: boolean;
    enableContainers?: boolean;
    mathOptions?: {
        commands?: string[];
        escapeExclamation?: boolean;
    };
    /**
     * Custom HTML-like tag names that should participate in streaming mid-state
     * suppression and be emitted as custom nodes (e.g. ['thinking']).
     */
    customHtmlTags?: readonly string[];
    /**
     * Whether to enable the fix for indented code blocks that should be paragraphs.
     * Default: true
     */
    enableFixIndentedCodeBlock?: boolean;
}
export declare function factory(opts?: FactoryOptions): import("markdown-it-ts").MarkdownIt;
