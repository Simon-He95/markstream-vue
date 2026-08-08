import type { ComputedRef } from 'vue'
import type { NodeRendererCodeBlockProps } from '../types/node-renderer-props'
import { inject, provide } from 'vue'

export interface MarkstreamRendererContext {
  customId: ComputedRef<string | undefined>
  isDark: ComputedRef<boolean | undefined>
  themes: ComputedRef<string[] | undefined>
  renderCodeBlocksAsPre: ComputedRef<boolean | undefined>
  codeBlockStream: ComputedRef<boolean | undefined>
  codeBlockDarkTheme: ComputedRef<any | undefined>
  codeBlockLightTheme: ComputedRef<any | undefined>
  codeBlockMinWidth: ComputedRef<string | number | undefined>
  codeBlockMaxWidth: ComputedRef<string | number | undefined>
  codeBlockProps: ComputedRef<NodeRendererCodeBlockProps | undefined>
}

export const MARKSTREAM_RENDERER_CONTEXT = Symbol('MarkstreamRendererContext')

export function provideMarkstreamRendererContext(ctx: MarkstreamRendererContext) {
  provide(MARKSTREAM_RENDERER_CONTEXT, ctx)
}

export function useMarkstreamRendererContext() {
  return inject<MarkstreamRendererContext | null>(MARKSTREAM_RENDERER_CONTEXT, null)
}
