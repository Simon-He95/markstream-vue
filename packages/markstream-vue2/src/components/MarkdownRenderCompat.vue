<script lang="ts">
import type { BaseNode, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemes } from '../types/component-props'
import type { NodeRendererProps } from './NodeRenderer/NodeRenderer.vue'
import { createRendererStreamBridge, createSmoothMarkdownStream, createStreamingTextScope, RENDERER_STREAM_DEFAULTS } from 'markstream-core'
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
  inject: {
    inheritedSmooth: { from: 'markstreamSmoothStreaming', default: undefined },
  },
  provide() {
    if (!this.legacyVue26)
      return {}
    const pacing = () => this.legacyPacing
    return {
      markstreamTextScope: this.legacyTextScope,
      markstreamSmoothStreaming: { get value() { return pacing() } },
    }
  },
  props: {
    content: String,
    nodes: Array as unknown as () => BaseNode[] | undefined,
    final: { type: Boolean, default: undefined },
    parseOptions: Object as unknown as () => ParseOptions | undefined,
    customMarkdownIt: Function as unknown as () => ((md: MarkdownIt) => MarkdownIt) | undefined,
    debugPerformance: Boolean,
    customHtmlTags: Array as unknown as () => readonly string[] | undefined,
    viewportPriority: Boolean,
    codeBlockStream: {
      type: Boolean,
      default: true,
    },
    codeBlockDarkTheme: String as unknown as () => CodeBlockTheme | undefined,
    codeBlockLightTheme: String as unknown as () => CodeBlockTheme | undefined,
    renderCodeBlocksAsPre: Boolean,
    codeBlockMinWidth: [String, Number],
    codeBlockMaxWidth: [String, Number],
    codeBlockOptions: Object as unknown as () => CodeBlockOptions | undefined,
    codeBlockProps: Object as unknown as () => NodeRendererProps['codeBlockProps'],
    showTooltips: Boolean,
    themes: Array as unknown as () => CodeBlockThemes | undefined,
    isDark: Boolean,
    customId: [String, Number],
    indexKey: [String, Number],
    typewriter: Boolean,
    fade: {
      type: Boolean,
      default: true,
    },
    smoothStreaming: { type: [Boolean, String], default: 'auto' },
    smoothStreamingOptions: Object as unknown as () => NodeRendererProps['smoothStreamingOptions'],
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
      legacyVisible: '',
      legacyReady: false,
      legacyStream: null as ReturnType<typeof createSmoothMarkdownStream> | null,
      legacyBridge: null as ReturnType<typeof createRendererStreamBridge> | null,
      legacyTextScope: createStreamingTextScope(work => this.legacyBridge?.scheduleCleanup(work)),
      instanceMsgId: this.customId
        ? `renderer-${this.customId}`
        : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
  },
  computed: {
    legacyPacing(): boolean {
      return this.smoothStreaming !== false && !this.nodes?.length
        && (this.smoothStreaming === true || (!(this as any).inheritedSmooth?.value && (this.typewriter || (this.maxLiveNodes ?? 0) <= 0)))
    },
    legacyVue26(): boolean {
      return isLegacyVue26Vm(this)
    },
    mergedParseOptions(): ParseOptions | undefined {
      const base = this.parseOptions ?? {}
      const requestedFinal = this.final ?? (base as any).final
      const resolvedFinal = this.legacyVue26 && this.legacyPacing && requestedFinal === true
        ? this.legacyReady && this.legacyVisible === (this.content ?? '')
        : requestedFinal
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
      const content = this.legacyPacing ? this.legacyVisible : this.content
      if (!content)
        return []
      const { key, tags } = resolveCustomHtmlTags((this.mergedParseOptions as any)?.customHtmlTags)
      const markdown = getMarkdown(key ? `${this.instanceMsgId}:${key}` : this.instanceMsgId, {
        customHtmlTags: tags,
      })
      const md = this.customMarkdownIt ? this.customMarkdownIt(markdown) : markdown
      return parseMarkdownToStructure(content, md, this.mergedParseOptions)
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
        renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
        codeBlockMinWidth: this.codeBlockMinWidth,
        codeBlockMaxWidth: this.codeBlockMaxWidth,
        codeBlockOptions: this.codeBlockOptions as NodeRendererProps['codeBlockOptions'],
        codeBlockProps: this.codeBlockProps,
        showTooltips: this.showTooltips,
        themes: this.themes,
        isDark: this.isDark,
        customId: this.customId as string | undefined,
        indexKey: this.indexKey,
        typewriter: this.typewriter,
        fade: this.fade,
        smoothStreaming: this.smoothStreaming as NodeRendererProps['smoothStreaming'],
        smoothStreamingOptions: this.smoothStreamingOptions,
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
  watch: {
    content: 'syncLegacyStream',
    nodes: 'syncLegacyStream',
    final: 'syncLegacyStream',
    parseOptions: 'syncLegacyStream',
    smoothStreaming: 'syncLegacyStream',
  },
  created() {
    if (!this.legacyVue26)
      return
    const stream = createSmoothMarkdownStream({ ...RENDERER_STREAM_DEFAULTS, ...this.smoothStreamingOptions })
    this.legacyStream = stream
    stream.subscribe(() => {
      this.legacyVisible = stream.getSnapshot().visible
    })
    this.legacyBridge = createRendererStreamBridge(stream, {
      flushOnFinish: this.smoothStreamingOptions?.flushOnFinish,
      commit: async (work) => {
        work()
        await this.$nextTick()
      },
      measure: () => { void (this.$el as HTMLElement)?.offsetHeight },
      onReady: (ready) => { this.legacyReady = ready },
    })
    this.syncLegacyStream()
  },
  beforeUnmount() {
    this.legacyBridge?.dispose()
    this.legacyStream?.destroy()
  },
  methods: {
    syncLegacyStream() {
      if (!this.legacyBridge)
        return
      const final = this.final ?? this.parseOptions?.final
      this.legacyTextScope.setFinal(final === true)
      this.legacyBridge.update(this.content ?? '', !!this.nodes?.length, this.legacyPacing, final, this.fade !== false)
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
          renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
          codeBlockMinWidth: this.codeBlockMinWidth,
          codeBlockMaxWidth: this.codeBlockMaxWidth,
          codeBlockOptions: this.codeBlockOptions,
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
