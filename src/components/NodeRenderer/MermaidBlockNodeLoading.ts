import type { ParsedNode } from 'stream-markdown-parser'
import { computed, defineComponent, h } from 'vue'
import { clampMermaidPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'

type RuntimeCodeBlockNode = ParsedNode & {
  type: 'code_block'
  language?: string
  loading?: boolean
  diff?: boolean
  code?: string
  originalCode?: string
  updatedCode?: string
  raw?: string
}

export const MermaidBlockNodeLoading = defineComponent({
  name: 'MermaidBlockNodeLoading',
  props: {
    node: { type: Object, required: true },
    showHeader: { type: Boolean, default: true },
    estimatedPreviewHeightPx: { type: Number, default: undefined },
  },
  setup(loadingProps) {
    const height = computed(() => clampMermaidPreviewHeight(
      parsePositiveNumber(loadingProps.estimatedPreviewHeightPx)
      ?? estimateMermaidPreviewHeight(String((loadingProps.node as RuntimeCodeBlockNode).code ?? '')),
    ))
    return () => h('div', {
      'class': 'mermaid-block-container rounded-lg border overflow-hidden',
      'style': {
        margin: 'var(--ms-flow-diagram-y) 0',
        borderColor: 'var(--diagram-border)',
      },
      'data-markstream-mermaid': '1',
      'data-markstream-mode': 'pending',
    }, [
      loadingProps.showHeader
        ? h('div', {
            class: 'mermaid-block-header flex justify-between items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)]',
            style: {
              background: 'var(--diagram-header-bg)',
              borderColor: 'var(--diagram-border)',
            },
          }, [
            h('div', { class: 'flex items-center gap-x-2 overflow-hidden' }, [
              h('span', {
                class: 'mermaid-label-text text-[length:var(--ms-text-label)] font-medium font-mono truncate',
                style: { color: 'var(--code-action-fg)' },
              }, 'Mermaid'),
            ]),
            h('div', {
              'class': 'mermaid-header-actions flex items-center gap-[var(--ms-gap-header-actions)] opacity-0 pointer-events-none',
              'aria-hidden': 'true',
            }, Array.from({ length: 4 }, () => h('span', {
              class: 'mermaid-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded',
            }, [
              h('span', { class: 'action-icon block' }),
            ]))),
          ])
        : null,
      h('div', {
        class: 'mermaid-preview-area relative overflow-hidden block',
        style: {
          height: `${height.value}px`,
          minHeight: 'var(--ms-size-diagram-min-height)',
          background: 'var(--diagram-bg)',
        },
      }, [
        h('div', {
          class: '_mermaid w-full text-center flex items-center justify-center min-h-full',
          style: {
            fontFamily: 'inherit',
            contentVisibility: 'auto',
            contain: 'content',
            containIntrinsicSize: 'var(--ms-size-diagram-min-height) 240px',
          },
        }),
      ]),
    ])
  },
})
