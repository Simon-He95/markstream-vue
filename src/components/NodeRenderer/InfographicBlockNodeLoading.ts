import type { ParsedNode } from 'stream-markdown-parser'
import { computed, defineComponent, h } from 'vue'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'

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

export const InfographicBlockNodeLoading = defineComponent({
  name: 'InfographicBlockNodeLoading',
  props: {
    node: { type: Object, required: true },
    showHeader: { type: Boolean, default: true },
    estimatedPreviewHeightPx: { type: Number, default: undefined },
  },
  setup(loadingProps) {
    const height = computed(() => clampInfographicPreviewHeight(
      parsePositiveNumber(loadingProps.estimatedPreviewHeightPx)
      ?? estimateInfographicPreviewHeight(String((loadingProps.node as RuntimeCodeBlockNode).code ?? '')),
    ))
    return () => h('div', {
      'class': 'infographic-block-container rounded-lg border overflow-hidden',
      'style': {
        margin: 'var(--ms-flow-diagram-y) 0',
        background: 'var(--diagram-bg)',
        borderColor: 'var(--diagram-border)',
        color: 'hsl(var(--ms-foreground))',
      },
      'data-markstream-infographic': '1',
      'data-markstream-mode': 'pending',
    }, [
      loadingProps.showHeader
        ? h('div', {
            class: 'infographic-block-header flex justify-between items-center border-b',
            style: {
              padding: 'var(--ms-inset-panel-y) var(--ms-inset-panel-x)',
              background: 'var(--diagram-header-bg)',
              borderColor: 'var(--diagram-border)',
              minHeight: 'calc(var(--ms-action-btn-icon) + var(--ms-action-btn-padding) + var(--ms-action-btn-padding) + var(--ms-inset-panel-y) + var(--ms-inset-panel-y) + 1px)',
            },
          }, [
            h('div', { class: 'flex items-center gap-x-2 overflow-hidden' }, [
              h('span', {
                class: 'icon-slot action-icon shrink-0',
                style: {
                  display: 'inline-flex',
                  width: 'var(--ms-action-btn-icon)',
                  height: 'var(--ms-action-btn-icon)',
                },
              }),
              h('span', {
                class: 'infographic-label font-medium font-mono truncate',
                style: {
                  fontSize: 'var(--ms-text-label)',
                  color: 'hsl(var(--ms-muted-foreground))',
                },
              }, 'Infographic'),
            ]),
            h('div', {
              'class': 'infographic-header-actions flex items-center opacity-0 pointer-events-none',
              'style': { gap: 'var(--ms-gap-header-actions)' },
              'aria-hidden': 'true',
            }, Array.from({ length: 4 }, () => h('span', {
              class: 'infographic-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded',
              style: {
                width: 'calc(var(--ms-action-btn-icon) + var(--ms-action-btn-padding) + var(--ms-action-btn-padding))',
                height: 'calc(var(--ms-action-btn-icon) + var(--ms-action-btn-padding) + var(--ms-action-btn-padding))',
              },
            }))),
          ])
        : null,
      h('div', {
        class: 'infographic-preview relative overflow-hidden block',
        style: {
          height: `${height.value}px`,
          minHeight: 'var(--ms-size-diagram-min-height)',
          background: 'var(--diagram-bg)',
        },
      }, [
        h('div', { class: 'absolute inset-0' }, [
          h('div', { class: 'w-full text-center flex items-center justify-center min-h-full' }),
        ]),
      ]),
    ])
  },
})
