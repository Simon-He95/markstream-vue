export declare const VOID_HTML_TAG_NAMES: readonly ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
export declare const INLINE_HTML_TAG_NAMES: readonly ["a", "abbr", "b", "bdi", "bdo", "button", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var"];
export declare const BLOCK_HTML_TAG_NAMES: readonly ["article", "aside", "blockquote", "details", "div", "figcaption", "figure", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"];
export declare const SVG_HTML_TAG_NAMES: readonly ["svg", "g", "path"];
export declare const EXTENDED_STANDARD_HTML_TAG_NAMES: readonly ["address", "audio", "body", "canvas", "caption", "colgroup", "datalist", "dd", "dialog", "dl", "dt", "fieldset", "form", "head", "hgroup", "html", "iframe", "legend", "map", "menu", "meter", "noscript", "object", "optgroup", "option", "output", "picture", "progress", "rp", "rt", "ruby", "script", "select", "style", "template", "textarea", "tfoot", "title", "video"];
export declare const DANGEROUS_HTML_ATTR_NAMES: readonly ["onclick", "onerror", "onload", "onmouseover", "onmouseout", "onmousedown", "onmouseup", "onkeydown", "onkeyup", "onfocus", "onblur", "onsubmit", "onreset", "onchange", "onselect", "ondblclick", "ontouchstart", "ontouchend", "ontouchmove", "ontouchcancel", "onwheel", "onscroll", "oncopy", "oncut", "onpaste", "oninput", "oninvalid", "onsearch", "srcdoc", "ping"];
export declare const URL_HTML_ATTR_NAMES: readonly ["action", "data", "href", "src", "srcset", "poster", "xlink:href", "formaction"];
export declare const BLOCKED_HTML_TAG_NAMES: readonly ["script"];
export declare const NON_STRUCTURING_HTML_TAG_NAMES: readonly ["pre", "script", "style", "textarea", "title"];
export declare const VOID_HTML_TAGS: Set<string>;
export declare const STANDARD_BLOCK_HTML_TAGS: Set<string>;
export declare const STANDARD_HTML_TAGS: Set<string>;
export declare const EXTENDED_STANDARD_HTML_TAGS: Set<string>;
export declare const DANGEROUS_HTML_ATTRS: Set<string>;
export declare const URL_HTML_ATTRS: Set<string>;
export declare const BLOCKED_HTML_TAGS: Set<string>;
export declare const NON_STRUCTURING_HTML_TAGS: Set<string>;
export declare function stripHtmlControlAndWhitespace(value: string): string;
interface HtmlUrlContext {
    tagName?: string;
    attrName?: string;
}
export declare function isUnsafeHtmlUrl(value: string, context?: HtmlUrlContext): boolean;
export declare function shouldOpenLinkInNewTab(href: string | null | undefined): boolean;
export declare function sanitizeImageSrc(value: unknown): string;
export {};
