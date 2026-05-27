import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

export interface MathBlockMinHeightCacheContext {
  scope: string
  cache: Map<string, number>
  clear: () => void
}

export const MATH_BLOCK_MIN_HEIGHT_CACHE = Symbol('MarkstreamMathBlockMinHeightCache') as InjectionKey<MathBlockMinHeightCacheContext>

export function createMathBlockMinHeightCache(scope: string): MathBlockMinHeightCacheContext {
  const cache = new Map<string, number>()
  return {
    scope,
    cache,
    clear: () => cache.clear(),
  }
}

export function provideMathBlockMinHeightCache(ctx: MathBlockMinHeightCacheContext) {
  provide(MATH_BLOCK_MIN_HEIGHT_CACHE, ctx)
}

export function useMathBlockMinHeightCache() {
  return inject(MATH_BLOCK_MIN_HEIGHT_CACHE, null)
}
