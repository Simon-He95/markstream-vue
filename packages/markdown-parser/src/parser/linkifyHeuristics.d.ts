import type { ParseOptions } from '../types';
export interface LinkifyDemotionContext {
    filename?: boolean;
    explicitFilename?: boolean;
    marketTicker?: boolean;
}
export declare function createLinkifyDemotionContextTracker(options?: ParseOptions, sticky?: boolean): {
    options(raw?: string): ParseOptions | undefined;
    remember(raw?: string): void;
    reset(): void;
};
export declare function isDecodedFromRawPunycode(linkText: string, href: string, raw?: string): boolean;
export declare function inferLinkifyDemotionContext(contextText?: string): LinkifyDemotionContext;
export declare function shouldDemoteFilenameLikeLinkify(linkText: string, context?: LinkifyDemotionContext): boolean;
