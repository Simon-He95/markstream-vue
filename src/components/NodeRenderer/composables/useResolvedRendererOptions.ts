import type { HtmlPolicy } from 'stream-markdown-parser'
import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { computed, inject, useAttrs } from 'vue'

type RendererAttrs = Record<string, unknown> & {
  'showTooltips'?: unknown
  'show-tooltips'?: unknown
}

export interface ResolvedRendererOptions {
  isClient: boolean
  renderAsFragment: ComputedRef<boolean>
  debugPerformanceEnabled: ComputedRef<boolean>
  resolvedShowTooltips: ComputedRef<boolean | undefined>
  resolvedHtmlPolicy: ComputedRef<HtmlPolicy>
  inheritedSmoothStreaming: { value?: boolean } | undefined
  inheritedTypewriterCursor: { value?: boolean } | undefined
  ownsTypewriterCursor: ComputedRef<boolean>
}

export function useResolvedRendererOptions(
  props: Readonly<NodeRendererProps>,
): ResolvedRendererOptions {
  const isClient = typeof window !== 'undefined'
  const attrs = useAttrs() as RendererAttrs

  const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>(
    'markstreamHtmlPolicy',
    undefined,
  )

  const inheritedTypewriterCursor = inject<{ value?: boolean } | undefined>(
    'markstreamTypewriterCursor',
    undefined,
  )

  const inheritedSmoothStreaming = inject<{ value?: boolean } | undefined>(
    'markstreamSmoothStreaming',
    undefined,
  )

  const renderAsFragment = computed(() => props.renderAsFragment === true)

  const debugPerformanceEnabled = computed(() => {
    return Boolean(
      props.debugPerformance
      && isClient
      && typeof console !== 'undefined',
    )
  })

  const resolvedShowTooltips = computed<boolean | undefined>(() => {
    if (typeof props.showTooltips === 'boolean')
      return props.showTooltips

    const raw = attrs.showTooltips ?? attrs['show-tooltips']

    if (raw === '' || raw === true || raw === 'true')
      return true

    if (raw === false || raw === 'false')
      return false

    return undefined
  })

  const resolvedHtmlPolicy = computed<HtmlPolicy>(() => {
    return props.htmlPolicy ?? inheritedHtmlPolicy?.value ?? 'safe'
  })

  const ownsTypewriterCursor = computed(() => {
    return inheritedTypewriterCursor?.value !== true
  })

  return {
    isClient,
    renderAsFragment,
    debugPerformanceEnabled,
    resolvedShowTooltips,
    resolvedHtmlPolicy,
    inheritedSmoothStreaming,
    inheritedTypewriterCursor,
    ownsTypewriterCursor,
  }
}
