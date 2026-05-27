/**
 * Sanitizes Mermaid SVG with DOMParser and returns a detached SVG element.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export declare function toSafeSvgElement<TElement = unknown>(svg: string | null | undefined): TElement | null;
/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export declare function sanitizeMermaidSvg(svg: string | null | undefined): string | null;
/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns an empty string in non-DOM runtimes such as plain Node.js.
 */
export declare function toSafeMermaidSvgMarkup(svg: string | null | undefined): string;
export declare function isBrokenMermaidSvg(svg: string | null | undefined): boolean;
