import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { createRendererStreamBridge, RENDERER_STREAM_DEFAULTS } from 'markstream-core'
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useSmoothMarkdownStream } from '../../../composables/useSmoothMarkdownStream'
import { isTypewriterEnabled } from '../../../utils/typewriter'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>

export interface SmoothStreamingBridgeOptions {
  isClient: boolean
  inheritedSmoothStreaming?: { value?: boolean }
  measureFinalCommit?: () => void
}

export interface SmoothStreamingBridge {
  smoothStream: ReturnType<typeof useSmoothMarkdownStream>
  smoothStreamingEligible: ComputedRef<boolean>
  smoothStreamingEnabled: ComputedRef<boolean>
  renderContent: ComputedRef<string>
  requestedFinal: ComputedRef<boolean | undefined>
  effectiveFinal: ComputedRef<boolean | undefined>
  scheduleFinalCleanup: (work: () => void) => void
}

export function useSmoothStreamingBridge(
  props: Readonly<NodeRendererProps>,
  options: SmoothStreamingBridgeOptions,
): SmoothStreamingBridge {
  const smoothStream = useSmoothMarkdownStream({
    ...RENDERER_STREAM_DEFAULTS,
    ...props.smoothStreamingOptions,
    // Animated streams must also pace large chunks instead of revealing a
    // whole paragraph in the same animation frame.
    burstInitialContent: props.fade === false && !isTypewriterEnabled(props.typewriter),
  })
  const flush = props.smoothStreamingOptions?.flushOnFinish !== false

  const finalReady = ref(false)
  const bridge = createRendererStreamBridge({
    ...smoothStream,
    getSnapshot: () => ({ source: smoothStream.source.value, pendingChars: smoothStream.pendingChars.value, caughtUp: smoothStream.caughtUp.value }),
  }, {
    flushOnFinish: flush,
    commit: async (work) => {
      work()
      await nextTick()
    },
    measure: options.measureFinalCommit,
    onReady: (value) => { finalReady.value = value },
  })
  onScopeDispose(bridge.dispose)

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
    return isTypewriterEnabled(props.typewriter)
      || (props.maxLiveNodes ?? 0) <= 0
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
      return finalRequested ? finalReady.value && smoothStream.caughtUp.value : false

    return finalRequested
  })

  watch(
    [() => props.content, () => props.nodes, smoothStreamingEnabled, requestedFinal],
    ([content, nodes, enabled, finalRequested]) => {
      bridge.update(content ?? '', !!nodes?.length, enabled, finalRequested, props.fade !== false)
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
    scheduleFinalCleanup: bridge.scheduleCleanup,
  }
}
