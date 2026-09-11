import type { MathInlineNodeProps } from '../../types/component-props'
import { defineComponent, h, inject } from 'vue'
import { MATH_BLOCK_MIN_HEIGHT_CACHE } from '../MathBlockNode/minHeightCache'
import TextNode from '../TextNode'

/**
 * Placeholders rendered while the math async chunk (and the optional `katex`
 * peer) is still loading.
 *
 * `MathBlockNodeAsync` / `MathInlineNodeAsync` previously had no
 * `loadingComponent`, so Vue rendered a comment node during the load: a display
 * equation occupied zero height and every node below it jumped down as the
 * equation resolved. Measured CLS ~0.06 on a document with six display
 * equations, over this renderer's own 0.05 budget.
 *
 * Both placeholders render the node's raw source, matching the no-katex
 * fallback (and the loading shells for mermaid / code blocks, which also show
 * the real source). That keeps the box closer to its final size and keeps the
 * text selectable and visible instead of replacing it with a spinner.
 */

const DOLLAR = String.fromCharCode(36)

function rawMathSource(node: unknown, prefix: string, suffix: string) {
  const candidate = node as { raw?: unknown, content?: unknown } | null | undefined
  if (typeof candidate?.raw === 'string' && candidate.raw.length)
    return candidate.raw
  return `${prefix}${String(candidate?.content ?? '')}${suffix}`
}

export const MathBlockNodeLoading = defineComponent({
  name: 'MathBlockNodeLoading',
  // `defineAsyncComponent` forwards the renderer's props (final/fade/…) to the
  // loading component; none of them belong on this placeholder's DOM node.
  inheritAttrs: false,
  props: {
    node: { type: Object, required: true },
    indexKey: { type: [String, Number], default: undefined },
    cacheScope: { type: [String, Number], default: undefined },
  },
  setup(loadingProps) {
    const minHeightCache = inject(MATH_BLOCK_MIN_HEIGHT_CACHE, null)

    // `MathBlockNode` records every height it has measured under
    // `math-block:<indexKey>`; reusing it here means a re-mounted equation
    // reserves its real height instead of the generic floor.
    function reservedHeight() {
      const scope = loadingProps.cacheScope ?? minHeightCache?.scope
      const scopedPrefix = scope != null && String(scope).length > 0 ? `${String(scope)}:` : ''
      const cacheKey = loadingProps.indexKey == null
        ? ''
        : `${scopedPrefix}math-block:${String(loadingProps.indexKey)}`
      const cached = cacheKey ? Number(minHeightCache?.cache.get(cacheKey) ?? 0) : 0
      return Number.isFinite(cached) && cached > 0 ? cached : null
    }

    return () => {
      const reserved = reservedHeight()

      return h('div', {
        'class': 'math-block text-center overflow-x-auto relative',
        'data-markstream-math': 'block',
        // Distinct from the rendered node's `katex`/`fallback`/`loading`
        // markers so consumers can tell the placeholder apart.
        'data-markstream-mode': 'pending',
        'data-markstream-pending': 'true',
        // `MathBlockNode`'s `min-height` lives in a scoped style block, so it
        // does not apply here. Reserve the same floor, upgraded to the measured
        // height when this equation has been rendered before.
        'style': { minHeight: reserved == null ? 'var(--ms-size-math-min-height)' : `${reserved}px` },
      }, [
        h('pre', {
          class: 'math-block__fallback text-left',
          style: {
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            margin: '0',
          },
        }, rawMathSource(loadingProps.node, `${DOLLAR}${DOLLAR}`, `${DOLLAR}${DOLLAR}`)),
      ])
    }
  },
})

export const MathInlineNodeLoading = defineComponent({
  name: 'MathInlineNodeLoading',
  inheritAttrs: false,
  props: {
    node: { type: Object, required: true },
  },
  setup(loadingProps) {
    // Inline math sits inside a paragraph, so a fixed-size box would not reserve
    // the right space — the line would still re-wrap once the formula resolved.
    // Rendering the raw source (exactly what the no-katex fallback shows) yields
    // a close-enough width for the resolved formula.
    const mathProps = loadingProps as unknown as MathInlineNodeProps
    return () => h(TextNode, {
      ...mathProps,
      node: {
        type: 'text',
        content: rawMathSource(mathProps.node, DOLLAR, DOLLAR),
        raw: rawMathSource(mathProps.node, DOLLAR, DOLLAR),
      },
    })
  },
})
