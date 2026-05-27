<script lang="ts">
import type { BaseNode, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import type { NodeRendererProps } from './NodeRenderer/NodeRenderer.vue'
import { getMarkdown, mergeCustomHtmlTags, parseMarkdownToStructure, resolveCustomHtmlTags } from 'stream-markdown-parser'
import { defineComponent } from 'vue-demi'
import { isLegacyVue26Vm, resolveVueListeners } from '../utils/vue26'
import NodeRenderer from './NodeRenderer'
import LegacyNodesRenderer from './NodeRenderer/LegacyNodesRenderer.vue'

export default defineComponent({
  name: 'MarkdownRender',
  components: {
    LegacyNodesRenderer,
    NodeRenderer,
  },
  props: {
    content: String,
    nodes: Array as unknown as () => BaseNode[] | undefined,
    final: Boolean,
    parseOptions: Object as unknown as () => ParseOptions | undefined,
    customMarkdownIt: Function as unknown as () => ((md: MarkdownIt) => MarkdownIt) | undefined,
    debugPerformance: Boolean,
    customHtmlTags: Array as unknown as () => readonly string[] | undefined,
    viewportPriority: Boolean,
    codeBlockStream: {
      type: Boolean,
      default: true,
    },
    codeBlockDarkTheme: null,
    codeBlockLightTheme: null,
    codeBlockMonacoOptions: Object as unknown as () => Record<string, any> | undefined,
    renderCodeBlocksAsPre: Boolean,
    codeBlockMinWidth: [String, Number],
    codeBlockMaxWidth: [String, Number],
    codeBlockProps: Object as unknown as () => Record<string, any> | undefined,
    showTooltips: Boolean,
    themes: Array as unknown as () => string[] | undefined,
    isDark: Boolean,
    customId: [String, Number],
    indexKey: [String, Number],
    typewriter: Boolean,
    fade: {
      type: Boolean,
      default: true,
    },
    batchRendering: Boolean,
    initialRenderBatchSize: Number,
    renderBatchSize: Number,
    renderBatchDelay: Number,
    renderBatchBudgetMs: Number,
    renderBatchIdleTimeoutMs: Number,
    deferNodesUntilVisible: Boolean,
    maxLiveNodes: Number,
    liveNodeBuffer: Number,
  },
  data() {
    return {
      instanceMsgId: this.customId
        ? `renderer-${this.customId}`
        : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
  },
  computed: {
    legacyVue26(): boolean {
      return isLegacyVue26Vm(this)
    },
    mergedParseOptions(): ParseOptions | undefined {
      const base = this.parseOptions ?? {}
      const resolvedFinal = this.final ?? (base as any).final
      const merged = mergeCustomHtmlTags(this.customHtmlTags, (base as any).customHtmlTags)
      const hasFinal = resolvedFinal != null
      const hasCustom = merged.length > 0
      if (!hasFinal && !hasCustom)
        return base
      return {
        ...(base as any),
        ...(hasFinal ? { final: resolvedFinal } : {}),
        ...(hasCustom ? { customHtmlTags: merged } : {}),
      } as ParseOptions
    },
    parsedLegacyNodes(): BaseNode[] {
      if (Array.isArray(this.nodes) && this.nodes.length > 0)
        return this.nodes
      if (!this.content)
        return []
      const { key, tags } = resolveCustomHtmlTags((this.mergedParseOptions as any)?.customHtmlTags)
      const markdown = getMarkdown(key ? `${this.instanceMsgId}:${key}` : this.instanceMsgId, {
        customHtmlTags: tags,
      })
      const md = this.customMarkdownIt ? this.customMarkdownIt(markdown) : markdown
      return parseMarkdownToStructure(this.content, md, this.mergedParseOptions)
    },
    forwardedProps(): NodeRendererProps {
      return {
        content: this.content,
        nodes: this.nodes,
        final: this.final,
        parseOptions: this.parseOptions,
        customMarkdownIt: this.customMarkdownIt,
        debugPerformance: this.debugPerformance,
        customHtmlTags: this.customHtmlTags,
        viewportPriority: this.viewportPriority,
        codeBlockStream: this.codeBlockStream,
        codeBlockDarkTheme: this.codeBlockDarkTheme,
        codeBlockLightTheme: this.codeBlockLightTheme,
        codeBlockMonacoOptions: this.codeBlockMonacoOptions,
        renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
        codeBlockMinWidth: this.codeBlockMinWidth,
        codeBlockMaxWidth: this.codeBlockMaxWidth,
        codeBlockProps: this.codeBlockProps,
        showTooltips: this.showTooltips,
        themes: this.themes,
        isDark: this.isDark,
        customId: this.customId as string | undefined,
        indexKey: this.indexKey,
        typewriter: this.typewriter,
        fade: this.fade,
        batchRendering: this.batchRendering,
        initialRenderBatchSize: this.initialRenderBatchSize,
        renderBatchSize: this.renderBatchSize,
        renderBatchDelay: this.renderBatchDelay,
        renderBatchBudgetMs: this.renderBatchBudgetMs,
        renderBatchIdleTimeoutMs: this.renderBatchIdleTimeoutMs,
        deferNodesUntilVisible: this.deferNodesUntilVisible,
        maxLiveNodes: this.maxLiveNodes,
        liveNodeBuffer: this.liveNodeBuffer,
      }
    },
  },
  render(h) {
    const listeners = resolveVueListeners(this)

    if (this.legacyVue26) {
      return h(LegacyNodesRenderer, {
        props: {
          nodes: this.parsedLegacyNodes,
          customId: this.customId,
          indexKey: this.indexKey,
          typewriter: this.typewriter,
          fade: this.fade,
          showTooltips: this.showTooltips,
          codeBlockStream: this.codeBlockStream,
          codeBlockDarkTheme: this.codeBlockDarkTheme,
          codeBlockLightTheme: this.codeBlockLightTheme,
          codeBlockMonacoOptions: this.codeBlockMonacoOptions,
          renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
          codeBlockMinWidth: this.codeBlockMinWidth,
          codeBlockMaxWidth: this.codeBlockMaxWidth,
          codeBlockProps: this.codeBlockProps,
          themes: this.themes,
          isDark: this.isDark,
        },
        ...(Object.keys(listeners).length > 0 ? { on: listeners } : {}),
      })
    }

    return h(NodeRenderer, {
      props: this.forwardedProps,
      ...(Object.keys(listeners).length > 0 ? { on: listeners } : {}),
    })
  },
})
</script>
