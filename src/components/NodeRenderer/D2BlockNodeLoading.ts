import type { ParsedNode } from 'stream-markdown-parser'
import { computed, defineComponent, h } from 'vue'
import { clampD2PreviewHeight, estimateD2PreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'

type RuntimeCodeBlockNode = ParsedNode & {
  type: 'code_block'
  language?: string
  loading?: boolean
  code?: string
  raw?: string
}

/**
 * Placeholder shown while the D2 renderer chunk loads. It reserves the same
 * estimated preview height the finished block uses so the diagram's first paint
 * does not push the content below it down.
 */
export const D2BlockNodeLoading = defineComponent({
  name: 'D2BlockNodeLoading',
  props: {
    node: { type: Object, required: true },
    showHeader: { type: Boolean, default: true },
    estimatedPreviewHeightPx: { type: Number, default: undefined },
  },
  setup(loadingProps) {
    const height = computed(() => clampD2PreviewHeight(
      parsePositiveNumber(loadingProps.estimatedPreviewHeightPx)
      ?? estimateD2PreviewHeight(String((loadingProps.node as RuntimeCodeBlockNode).code ?? '')),
    ))
    return () => h('div', {
      'class': 'd2-block-container rounded-lg border overflow-hidden',
      'style': {
        margin: 'var(--ms-flow-diagram-y) 0',
        borderColor: 'var(--diagram-border)',
      },
      'data-markstream-d2': '1',
      'data-markstream-mode': 'pending',
    }, [
      loadingProps.showHeader
        ? h('div', {
            class: 'd2-block-header flex justify-between items-center border-b',
            style: {
              padding: 'var(--ms-inset-panel-y) var(--ms-inset-panel-x)',
              background: 'var(--diagram-header-bg)',
              borderColor: 'var(--diagram-border)',
            },
          }, [
            h('div', { class: 'flex items-center gap-x-2' }, [
              h('span', {
                class: 'd2-label font-medium font-mono',
                style: { color: 'var(--code-action-fg)' },
              }, 'D2'),
            ]),
            h('div', {
              'class': 'd2-header-actions flex items-center',
              'aria-hidden': 'true',
            }),
          ])
        : null,
      h('div', {
        class: 'd2-block-body',
        style: {
          minHeight: `${height.value}px`,
        },
      }),
    ])
  },
})
