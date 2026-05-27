export declare function isHtmlLikeTagName(tag: string): boolean;
export declare function normalizeCustomHtmlTagName(value: unknown): string;
export declare function normalizeCustomHtmlTags(tags?: readonly string[]): string[];
export declare function mergeCustomHtmlTags(...lists: Array<readonly string[] | undefined>): string[];
export declare function resolveCustomHtmlTags(tags?: readonly string[]): {
    key: string;
    tags: string[];
};
export declare function getHtmlTagFromContent(html: unknown): string;
export declare function hasCompleteHtmlTagContent(html: unknown, tag: string): boolean;
export declare function shouldRenderUnknownHtmlTagAsText(html: unknown, tag: string): boolean;
export declare function stripCustomHtmlWrapper(html: unknown, tag: string): string;
