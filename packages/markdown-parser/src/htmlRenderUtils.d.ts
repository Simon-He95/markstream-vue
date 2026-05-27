export type HtmlPolicy = 'escape' | 'safe' | 'trusted';
export type HtmlPropValue = string | number | boolean;
export interface HtmlToken {
    type: 'text' | 'tag_open' | 'tag_close' | 'self_closing';
    tagName?: string;
    attrs?: Record<string, string>;
    content?: string;
}
export declare const SAFE_ALLOWED_HTML_TAGS: Set<string>;
export declare function isHtmlTagBlocked(tagName: string | undefined, policy?: HtmlPolicy): boolean;
export declare function isHtmlTagHardBlocked(tagName: string | undefined, policy?: HtmlPolicy): boolean;
export declare function isCustomHtmlComponentTag(tagName: string, customComponents: Record<string, unknown>): any;
export declare function sanitizeHtmlAttrs(attrs: Record<string, string>, policy?: HtmlPolicy, tagName?: string): Record<string, string>;
export declare function tokenAttrsToRecord(attrs?: Array<[string, string | null]> | null): Record<string, string>;
export declare function sanitizeHtmlTokenAttrs(attrs?: Array<[string, string | null]> | null, policy?: HtmlPolicy, tagName?: string): [string, string][];
export declare function convertHtmlPropValue(value: string, key: string): HtmlPropValue;
export declare function convertHtmlAttrsToProps(attrs: Record<string, string>): Record<string, HtmlPropValue>;
export declare function tokenizeHtml(html: string): HtmlToken[];
export declare function hasCustomHtmlComponents(content: string, customComponents: Record<string, unknown>): boolean;
export declare function sanitizeHtmlContent(content: string, policy?: HtmlPolicy): string;
