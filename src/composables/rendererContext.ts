import type { ComputedRef } from 'vue'
import { inject, provide } from 'vue'

export interface MarkstreamRendererContext {
  customId: ComputedRef<string | undefined>
  isDark: ComputedRef<boolean | undefined>
  themes: ComputedRef<string[] | undefined>
  renderCodeBlocksAsPre: ComputedRef<boolean | undefined>
  codeBlockStream: ComputedRef<boolean | undefined>
  codeBlockDarkTheme: ComputedRef<any | undefined>
  codeBlockLightTheme: ComputedRef<any | undefined>
  codeBlockMonacoOptions: ComputedRef<Record<string, any> | undefined>
  codeBlockMinWidth: ComputedRef<string | number | undefined>
  codeBlockMaxWidth: ComputedRef<string | number | undefined>
  codeBlockProps: ComputedRef<Record<string, any> | undefined>
}

export const MARKSTREAM_RENDERER_CONTEXT = Symbol('MarkstreamRendererContext')

export function provideMarkstreamRendererContext(ctx: MarkstreamRendererContext) {
  provide(MARKSTREAM_RENDERER_CONTEXT, ctx)
}

export function useMarkstreamRendererContext() {
  return inject<MarkstreamRendererContext | null>(MARKSTREAM_RENDERER_CONTEXT, null)
}

