import type { Component, ComponentPublicInstance } from 'vue'
import type {
  MathBlockNodeProps,
  MathInlineNodeProps,
} from '../../types/component-props'
import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { getKatex } from '../MathInlineNode/katex'
import PreCodeNode from '../PreCodeNode'
import TextNode from '../TextNode'
import CodeBlockNodeLoadingContent from './CodeBlockNodeLoading'
import { MathBlockNodeLoading, MathInlineNodeLoading } from './MathNodeLoading'

interface ProcessLike {
  env?: {
    NODE_ENV?: string
  }
}

type MathInlineFallbackProps = MathInlineNodeProps & Record<string, unknown>
type MathBlockFallbackProps = MathBlockNodeProps & Record<string, unknown>

function getProcessEnv() {
  const processValue = Reflect.get(globalThis, 'process') as ProcessLike | undefined
  return processValue?.env
}

function renderInlineFallback(props: MathInlineFallbackProps) {
  const raw = props.node.raw ?? `$${props.node.content ?? ''}$`
  return h(TextNode, {
    ...props,
    node: {
      type: 'text',
      content: raw,
      raw,
    },
  })
}

function renderBlockFallback(props: MathBlockFallbackProps) {
  const raw = props.node.raw ?? `$$${props.node.content ?? ''}$$`
  return h(TextNode, {
    ...props,
    node: {
      type: 'text',
      content: raw,
      raw,
    },
  })
}

/**
 * Load the KaTeX runtime and the math component together.
 *
 * These used to be awaited in sequence, so every equation waited for two chunk
 * requests back-to-back before anything could paint. Both are needed before the
 * component can render, so they are fetched concurrently.
 */
async function loadMathDeps<T>(importer: () => Promise<T>): Promise<{ mod: T | null, error?: unknown }> {
  try {
    const [, mod] = await Promise.all([getKatex(), importer()])
    return { mod }
  }
  catch (error) {
    return { mod: null, error }
  }
}

export function withViewportDeferredLoading(name: string, component: Component, loadingComponent: Component) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      const registerViewport = useViewportPriority()
      const viewportPriorityOptions = useViewportPriorityOptions()
      const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
      const hydratedFromServer = typeof window !== 'undefined' && getCurrentInstance()?.vnode.el?.nodeType === 1
      const viewportReady = ref(
        typeof window === 'undefined'
        || hydratedFromServer
        || !offscreenHeavyNodeDeferral.value,
      )
      const target = shallowRef<HTMLElement | null>(null)
      let viewportHandle: ReturnType<typeof registerViewport> | null = null

      function setTarget(value: Element | ComponentPublicInstance | null) {
        const element = value && '$el' in value ? value.$el : value
        target.value = element instanceof HTMLElement ? element : null
      }

      if (typeof window !== 'undefined') {
        watch(
          [target, offscreenHeavyNodeDeferral],
          ([element, shouldDefer], _previous, onCleanup) => {
            viewportHandle?.destroy()
            viewportHandle = null

            if (!shouldDefer || viewportReady.value) {
              viewportReady.value = true
              return
            }
            if (!element)
              return

            let active = true
            const handle = registerViewport(element, {
              rootMargin: viewportPriorityOptions?.value.heavyBlockMargin,
              allowIdle: false,
            })
            viewportHandle = handle
            viewportReady.value = handle.isVisible.value
            handle.whenVisible.then(() => {
              if (active && viewportHandle === handle)
                viewportReady.value = true
            })

            onCleanup(() => {
              active = false
              handle.destroy()
              if (viewportHandle === handle)
                viewportHandle = null
            })
          },
          { immediate: true },
        )
      }

      onBeforeUnmount(() => {
        viewportHandle?.destroy()
        viewportHandle = null
      })

      return () => h(
        viewportReady.value ? component : loadingComponent,
        { ...attrs, ref: setTarget },
        slots,
      )
    },
  })
}

export const CodeBlockNodeLoading: Component = CodeBlockNodeLoadingContent

export const PreCodeBlockAsync: Component = defineAsyncComponent({
  loader: () => import('../PreCodeNode/PreCodeBlock.vue'),
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: true,
})

const CodeBlockNodeInnerAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/CodeBlockNode/CodeBlockNode.vue')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Failed to load the enhanced CodeBlockNode chunk; falling back to preformatted code rendering. Enhanced code blocks require the optional "stream-diffs" peer.',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: false,
})

export const CodeBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredCodeBlockNode',
  CodeBlockNodeInnerAsync,
  CodeBlockNodeLoading,
)

export const MathInlineNodeAsync = defineAsyncComponent({
  loader: async () => {
    // In test environment prefer the simple text fallback to avoid
    // race conditions with workers/KaTeX rendering.
    const isTestEnv = getProcessEnv()?.NODE_ENV === 'test'
    if (isTestEnv && typeof window !== 'undefined') {
      // test fallback should be deterministic and minimal
      return renderInlineFallback
    }

    const { mod, error } = await loadMathDeps(() => import('../../components/MathInlineNode'))
    if (mod)
      return mod.default

    console.warn(
      '[markstream-vue] Optional peer dependencies for MathInlineNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      error,
    )
    return renderInlineFallback
  },
  // Without a placeholder the inline formula collapsed to a 1rem spinner and
  // then re-wrapped its line once KaTeX arrived.
  loadingComponent: MathInlineNodeLoading,
  delay: 0,
  // `suspensible` is deliberately left at its default (true): inside a
  // `<Suspense>` boundary the component must keep suspending exactly as it did
  // before. `loadingComponent` still applies on the client outside Suspense,
  // which is where the shift was observable.
})

export const MathBlockNodeAsync = defineAsyncComponent({
  loader: async () => {
    const { mod, error } = await loadMathDeps(() => import('../../components/MathBlockNode'))
    if (mod)
      return mod.default

    console.warn(
      '[markstream-vue] Optional peer dependencies for MathBlockNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      error,
    )
    return renderBlockFallback
  },
  // Without a placeholder a display equation occupied zero height while the
  // chunk loaded, so every node below it jumped when the equation appeared.
  loadingComponent: MathBlockNodeLoading,
  delay: 0,
  // See the note on MathInlineNodeAsync: keep the default Suspense semantics.
})
