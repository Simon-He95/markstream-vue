<script lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import type { Component, PropType } from 'vue'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { createCommentVNode, defineComponent, h, Transition } from 'vue'
import NodeRenderer from './NodeRenderer.vue'

interface RenderedContentItem {
  node: ParsedNode
  component: unknown
  rendersCustomNode: boolean
  customNodeProps: Record<string, unknown>
  nodeProps: Record<string, unknown>
  hasSlotChildren: boolean
  slotContent: string
  indexKey: string
}

export default defineComponent({
  name: 'NodeRendererContent',
  props: {
    item: { type: Object as PropType<RenderedContentItem>, required: true },
    // Replacing a caller-owned array can mutate raw custom-node data.
    sourceNodes: Array as PropType<NodeRendererProps['nodes']>,
    fade: { type: Boolean, default: undefined },
    final: { type: Boolean, default: undefined },
    nestedRendererProps: Object as PropType<Partial<NodeRendererProps>>,
  },
  setup(props) {
    // Stable item props skip settled transitions. Runtime slots preserve the
    // original v-for's dynamic-slot updates for custom components and raw ASTs.
    return () => h(Transition, {
      name: 'fade',
      css: props.fade !== false,
      appear: props.fade !== false && props.final !== true,
    }, {
      default: () => {
        const item = props.item
        if (!item.rendersCustomNode)
          return h(item.component as Component, { key: 1, ...item.nodeProps })

        return h(item.component as Component, { key: 0, ...item.customNodeProps }, {
          default: () => {
            if (item.hasSlotChildren) {
              return h(NodeRenderer, {
                key: 0,
                ...props.nestedRendererProps,
                nodes: (item.node as any).children,
                indexKey: item.indexKey,
                batchRendering: false,
                deferNodesUntilVisible: false,
                renderAsFragment: true,
              })
            }
            if (item.slotContent) {
              return h(NodeRenderer, {
                key: 1,
                ...props.nestedRendererProps,
                content: item.slotContent,
                final: !item.node.loading,
                indexKey: `${item.indexKey}-content`,
                smoothStreaming: false,
                batchRendering: false,
                deferNodesUntilVisible: false,
                renderAsFragment: true,
              })
            }
            return createCommentVNode('v-if', true)
          },
        })
      },
    })
  },
})
</script>
