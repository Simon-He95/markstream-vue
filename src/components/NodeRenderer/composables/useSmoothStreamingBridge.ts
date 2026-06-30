import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { computed, onMounted, ref, watch } from 'vue'
import { useSmoothMarkdownStream } from '../../../composables/useSmoothMarkdownStream'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>

export interface SmoothStreamingBridgeOptions {
  isClient: boolean
  inheritedSmoothStreaming?: { value?: boolean }
}

export interface SmoothStreamingBridge {
  smoothStream: ReturnType<typeof useSmoothMarkdownStream>
  smoothStreamingEligible: ComputedRef<boolean>
  smoothStreamingEnabled: ComputedRef<boolean>
  renderContent: ComputedRef<string>
  requestedFinal: ComputedRef<boolean | undefined>
  effectiveFinal: ComputedRef<boolean | undefined>
}

function isTypewriterEnabled(typewriter: NodeRendererProps['typewriter']) {
  return typewriter === true || typewriter === 'simple' || typewriter === 'precise'
}

export function useSmoothStreamingBridge(
  props: Readonly<NodeRendererProps>,
  options: SmoothStreamingBridgeOptions,
): SmoothStreamingBridge {
  const smoothStream = useSmoothMarkdownStream(props.smoothStreamingOptions)

  const smoothStreamingEligible = computed(() => {
    if (props.smoothStreaming === false)
      return false

    if (props.nodes?.length)
      return false

    // Nested renderers should not double-pace content unless explicitly opted in.
    if (props.smoothStreaming !== true && options.inheritedSmoothStreaming?.value)
      return false

    if (props.smoothStreaming === true)
      return true

    // auto mode: enable only for typewriter or incremental mode.
    return isTypewriterEnabled(props.typewriter) || (props.maxLiveNodes ?? 0) <= 0
  })

  // Prevent pacing initial static content on first client render.
  // This avoids SSR hydration mismatch and blank flash.
  const hasMountedForSmoothStreaming = ref(
    !options.isClient || props.smoothStreaming === true,
  )

  onMounted(() => {
    hasMountedForSmoothStreaming.value = true
  })

  const smoothStreamingEnabled = computed(() => {
    return hasMountedForSmoothStreaming.value && smoothStreamingEligible.value
  })

  const renderContent = computed(() => {
    return smoothStreamingEnabled.value
      ? smoothStream.visible.value
      : (props.content ?? '')
  })

  const requestedFinal = computed<boolean | undefined>(() => {
    const base = (props.parseOptions ?? {}) as RendererParseOptions
    return props.final ?? base.final
  })

  const effectiveFinal = computed<boolean | undefined>(() => {
    const finalRequested = requestedFinal.value

    if (smoothStreamingEnabled.value && finalRequested != null)
      return finalRequested ? smoothStream.caughtUp.value : false

    return finalRequested
  })

  watch(
    [() => props.content, () => props.nodes, smoothStreamingEnabled, requestedFinal],
    ([content, nodes, enabled, finalRequested]) => {
      if (nodes?.length) {
        smoothStream.reset('')
        return
      }

      const nextContent = content ?? ''

      if (!enabled) {
        smoothStream.reset(nextContent)

        if (finalRequested)
          smoothStream.finish({ flush: true })

        return
      }

      const source = smoothStream.source.value

      if (!nextContent) {
        smoothStream.reset('')
      }
      else if (nextContent === source) {
        // no-op
      }
      else if (nextContent.startsWith(source)) {
        smoothStream.enqueue(nextContent.slice(source.length))
      }
      else {
        smoothStream.reset(nextContent)
      }

      if (finalRequested)
        smoothStream.finish()
    },
    { immediate: true },
  )

  return {
    smoothStream,
    smoothStreamingEligible,
    smoothStreamingEnabled,
    renderContent,
    requestedFinal,
    effectiveFinal,
  }
}
