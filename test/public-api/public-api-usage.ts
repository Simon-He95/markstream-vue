import type {
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  InfographicLoader,
  LanguageIconResolver,
  LinkNodeProps,
  MarkdownIt,
  MarkdownPluginRegistration,
  MarkstreamHeightCacheEntry,
  MarkstreamMeasuredHeightCacheEntry,
  MarkstreamNodeLifecycle,
  MarkstreamOuterVirtualizerAdapter,
  MarkstreamRendererHandle,
  MarkstreamScrollRootLike,
  MarkstreamScrollRootRef,
  MarkstreamScrollRootResolver,
  MarkstreamThreadVirtualState,
  MarkstreamTimelineItem,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollHeightCacheOptions,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualScrollSharedOptions,
  MarkstreamVirtualState,
  MarkstreamVirtualTimelineProps,
  MarkstreamVuePluginOptions,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MathOptions,
  MermaidBlockNodeProps,
  NodeRendererProps,
  ShikiCodeBlockProps,
  SmoothMarkdownStreamOptions,
} from 'markstream-vue'
import type {
  ShikiCodeBlockProps as ReactShikiCodeBlockProps,
} from '../../packages/markstream-react/src/types/component-props'
import type {
  ShikiCodeBlockProps as Vue2ShikiCodeBlockProps,
} from '../../packages/markstream-vue2/src/types/component-props'
import { full as markdownItEmojiFull } from 'markdown-it-emoji'
import MarkdownRender, {
  clearGlobalCustomComponents,
  clearRegisteredMarkdownPlugins,
  CodeBlockNode,
  D2BlockNode,
  disableD2,
  disableInfographic,
  disableKatex,
  disableMermaid,
  enableD2,
  enableInfographic,
  enableKatex,
  enableMermaid,
  getCustomNodeComponents,
  getMarkdown,
  InfographicBlockNode,
  isBrokenMermaidSvg,
  isD2Enabled,
  isInfographicEnabled,
  isKatexEnabled,
  isMermaidEnabled,
  MARKSTREAM_NODE_LIFECYCLE_KEY,
  MarkstreamVirtualTimeline,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  parseMarkdownToStructure,
  registerMarkdownPlugin,
  removeCustomComponents,
  sanitizeMermaidSvg,
  setCustomComponents,
  setD2Loader,
  setDefaultMathOptions,
  setIconTheme,
  setInfographicLoader,
  setKatexLoader,
  setLanguageIconResolver,
  setMermaidLoader,
  toSafeMermaidSvgMarkup,
  toSafeSvgElement,
  useMarkstreamNodeLifecycle,
  useMarkstreamVirtualAdapter,
  useSmoothMarkdownStream,
  VueRendererMarkdown,
} from 'markstream-vue'
import { createApp, ref } from 'vue'

const component = MarkdownRender
const plugin = VueRendererMarkdown

const props: NodeRendererProps = {
  content: '# Hello',
  final: true,
  typewriter: true,
  smoothStreaming: 'auto',
  parseCoalesceMs: 80,
  maxLiveNodes: 320,
  nodeVirtual: 'auto',
  virtualScroll: {
    enabled: true,
    sessionKey: 'public-api-session',
  },
}

const simpleTypewriterProps: NodeRendererProps = {
  content: 'Streaming text',
  typewriter: 'simple',
}
void simpleTypewriterProps

const options: SmoothMarkdownStreamOptions = {}
const customComponents: CustomComponents = {}
const pluginLanguageIconResolver: LanguageIconResolver = lang => `custom-${lang}`
const pluginMathOptions: MathOptions = {}
const pluginIconTheme = 'material'
const infographicLoader: InfographicLoader = async () => ({})
const pluginOptions: MarkstreamVuePluginOptions = {
  components: customComponents,
  getLanguageIcon: pluginLanguageIconResolver,
  iconTheme: pluginIconTheme,
  infographicLoader,
  mathOptions: pluginMathOptions,
}

const pluginApp = createApp({ render: () => null })

pluginApp.use(plugin, pluginOptions)
pluginApp.use(VueRendererMarkdown, pluginOptions)

// @ts-expect-error MarkstreamVuePluginOptions rejects unknown plugin options.
pluginApp.use(plugin, { components: customComponents, unknownOption: true })

setIconTheme(pluginIconTheme)
setLanguageIconResolver(pluginLanguageIconResolver)

setCustomComponents('docs', customComponents)
setCustomComponents(customComponents)

const scopedComponents = getCustomNodeComponents('docs')

removeCustomComponents('docs')
clearGlobalCustomComponents()

enableKatex()
disableKatex()
const katexEnabled = isKatexEnabled()
setKatexLoader(async () => ({}))

enableMermaid()
disableMermaid()
const mermaidEnabled = isMermaidEnabled()
setMermaidLoader(async () => ({}))

enableD2()
disableD2()
const d2Enabled = isD2Enabled()
setD2Loader(async () => ({}))

setInfographicLoader(infographicLoader)
setInfographicLoader()
enableInfographic(infographicLoader)
disableInfographic()
const infographicEnabled = isInfographicEnabled()

setDefaultMathOptions({})

const markdown = getMarkdown('public-api-test')
const nodes = parseMarkdownToStructure('# API test', markdown, { final: true })
const controller = useSmoothMarkdownStream(options)
const safeMermaidSvg: string | null = sanitizeMermaidSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const safeMermaidSvgMarkup: string = toSafeMermaidSvgMarkup('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const safeMermaidSvgElement: SVGElement | null = toSafeSvgElement<SVGElement>('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const brokenMermaidSvg: boolean = isBrokenMermaidSvg('<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>')

const codeBlockProps: Partial<CodeBlockNodeProps> = {}
const vueShikiCodeBlockPropsAcceptsLangs = {
  langs: ['typescript', 'vue'] as const,
} satisfies ShikiCodeBlockProps
const reactShikiCodeBlockPropsAcceptsLangs = {
  langs: ['typescript', 'tsx'] as const,
} satisfies ReactShikiCodeBlockProps
const vue2ShikiCodeBlockPropsAcceptsLangs = {
  langs: ['javascript', 'vue'] as const,
} satisfies Vue2ShikiCodeBlockProps
const nodeRendererCodeBlockPropsWithMonacoThemeObject: NodeRendererProps = {
  content: '```ts\nconsole.log(1)\n```',
  codeBlockProps: {
    themes: [
      {
        name: 'public-api-custom-dark',
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {},
      },
    ],
  },
}
const nodeRendererCodeBlockPropsWithShikiOptions: NodeRendererProps = {
  content: '```ts\nconsole.log(1)\n```',
  codeRenderer: 'shiki',
  codeBlockProps: {
    themes: ['vitesse-light', 'vitesse-dark'],
    langs: ['ts', 'vue'],
  },
}
const mermaidProps: Partial<MermaidBlockNodeProps> = {}
const mathProps: Partial<MathBlockNodeProps> = {}
const mathInlineProps: Partial<MathInlineNodeProps> = {}
const imageProps: Partial<ImageNodeProps> = {}
const linkProps: Partial<LinkNodeProps> = {}
const d2Props: Partial<D2BlockNodeProps> = {}
const infographicProps: Partial<InfographicBlockNodeProps> = {}
const virtualScrollOptions: MarkstreamVirtualScrollOptions = {
  enabled: true,
  sessionKey: 'public-api-session',
}
const virtualScrollHeightCacheOptions: MarkstreamVirtualScrollHeightCacheOptions = {
  heightCache: [{ index: 0, height: 120, nodeType: 'paragraph', signature: 'public-api-signature' }],
  heightCacheWidth: 600,
}
const heightCacheEntry: MarkstreamHeightCacheEntry = {
  index: 0,
  height: 120,
  nodeType: 'paragraph',
  signature: 'public-api-signature',
}
const measuredHeightCacheEntry: MarkstreamMeasuredHeightCacheEntry = {
  index: 0,
  height: 120,
}
const virtualScrollSharedOptions: MarkstreamVirtualScrollSharedOptions = {
  measurementKey: 'public-api-measurement',
  heightCache: null,
}
const virtualScrollOptionsWithoutSessionKey: MarkstreamVirtualScrollOptions = {
  enabled: false,
}
const virtualMetrics: MarkstreamVirtualMetrics | null = null
const virtualState: MarkstreamVirtualState | null = null
const rendererHandle: MarkstreamRendererHandle | null = null
const nodeLifecycle: MarkstreamNodeLifecycle | null = null
const timelineItem: MarkstreamTimelineItem = {
  id: 'a1',
  kind: 'assistant-markdown',
  content: '# Public API',
  final: true,
}
const virtualTimelineProps: MarkstreamVirtualTimelineProps = {
  items: [timelineItem],
  threadKey: 'public-api-thread',
  layoutRevision: 1,
}
const virtualScrollRootRef = ref<HTMLElement | null>(null) satisfies MarkstreamScrollRootRef
const virtualScrollRootLike: MarkstreamScrollRootLike = virtualScrollRootRef
const virtualScrollRootResolver: MarkstreamScrollRootResolver = () => virtualScrollRootRef
const rendererRefs = new Map<string, MarkstreamRendererHandle>()
const savedVirtualStates = new Map<string, MarkstreamVirtualState>()
const logicalHeights = new Map<string, number>()
const outerVirtualizer = {
  resizeItem(_messageId: string, _height: number) {},
}
const outerVirtualizerAdapter: MarkstreamOuterVirtualizerAdapter = {
  getScrollElement: () => virtualScrollRootRef.value,
  getScrollTop: () => virtualScrollRootRef.value?.scrollTop ?? 0,
  setScrollTop: (top) => {
    if (virtualScrollRootRef.value)
      virtualScrollRootRef.value.scrollTop = top
  },
  getViewportHeight: () => virtualScrollRootRef.value?.clientHeight ?? 0,
  getTotalHeight: () => 0,
  getItemOffset: () => 0,
  getItemSize: () => 0,
  setItemSize: (_key, _height) => {},
  getVisibleRange: () => ({ start: 0, end: 1 }),
  scrollToOffset: (_offset) => {},
  scrollToIndex: (_index, _align) => {},
}
const virtualAdapter = useMarkstreamVirtualAdapter({
  items: [timelineItem],
  threadKey: 'public-api-thread',
  layoutRevision: 1,
  virtualizer: outerVirtualizerAdapter,
})
const threadVirtualState: MarkstreamThreadVirtualState = virtualAdapter.captureThreadState()

function onVirtualHeightChange(messageId: string, metrics: MarkstreamVirtualMetrics) {
  logicalHeights.set(messageId, metrics.totalHeight)
  outerVirtualizer.resizeItem(messageId, metrics.totalHeight)
}

function onVirtualStateChange(messageId: string, state: MarkstreamVirtualState) {
  savedVirtualStates.set(messageId, state)
}

function captureVirtualStatesBeforeThreadSwitch() {
  for (const [messageId, renderer] of rendererRefs) {
    const state = renderer.captureVirtualState({
      requireViewport: true,
      includeEmptyState: true,
    })

    if (state)
      savedVirtualStates.set(messageId, state)
  }
}

function restoreVirtualStateAfterThreadSwitch(messageId: string, restoreToken: number) {
  const renderer = rendererRefs.get(messageId)
  const state = savedVirtualStates.get(messageId)

  if (!renderer || !state)
    return

  renderer.restoreVirtualState(state, {
    restoreAnchor: true,
    restoreToken,
  })
}
void MARKSTREAM_NODE_LIFECYCLE_KEY
void useMarkstreamNodeLifecycle
void MarkstreamVirtualTimeline
void useMarkstreamVirtualAdapter

// Verify named async components retain their concrete types
// (not erased to generic Component)
const codeNode = {
  type: 'code_block',
  language: 'ts',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies CodeBlockNodeProps['node']

const mathNode = {
  type: 'math_block',
  content: 'x^2',
  raw: '$$x^2$$',
} satisfies MathBlockNodeProps['node']

// Verify MarkdownIt plugin registration types are usable
const mdPlugin: MarkdownPluginRegistration = (md: MarkdownIt) => {
  md.inline.ruler.before('escape', 'public_api_rule', () => false)
  md.renderer.rules.text = (tokens, idx) => tokens[idx]?.content ?? ''
  return md
}

// Verify MarkdownIt tuple plugin registration type is usable
const tuplePlugin: MarkdownPluginRegistration = [
  (md: MarkdownIt, opts?: { name?: string }) => {
    md.core.ruler.push(opts?.name ?? 'public_api_core_rule', () => false)
  },
  { name: 'public_api_core_rule' },
]

const markdownForUse = getMarkdown('public-api-use-plugin')
markdownForUse.use(markdownItEmojiFull)

registerMarkdownPlugin(mdPlugin)
registerMarkdownPlugin(tuplePlugin)
registerMarkdownPlugin(markdownItEmojiFull)
clearRegisteredMarkdownPlugins()

void component
void plugin
void pluginOptions
void plugin
void props
void scopedComponents
void katexEnabled
void mermaidEnabled
void d2Enabled
void infographicEnabled
void nodes
void controller
void safeMermaidSvg
void safeMermaidSvgMarkup
void safeMermaidSvgElement
void brokenMermaidSvg
void codeBlockProps
void vueShikiCodeBlockPropsAcceptsLangs
void reactShikiCodeBlockPropsAcceptsLangs
void vue2ShikiCodeBlockPropsAcceptsLangs
void nodeRendererCodeBlockPropsWithMonacoThemeObject
void nodeRendererCodeBlockPropsWithShikiOptions
void mermaidProps
void mathProps
void mathInlineProps
void imageProps
void linkProps
void d2Props
void infographicProps
void virtualScrollOptions
void virtualScrollHeightCacheOptions
void heightCacheEntry
void measuredHeightCacheEntry
void virtualScrollSharedOptions
void virtualScrollOptionsWithoutSessionKey
void virtualMetrics
void virtualState
void rendererHandle
void nodeLifecycle
void timelineItem
void virtualTimelineProps
void virtualScrollRootRef
void virtualScrollRootLike
void virtualScrollRootResolver
void rendererRefs
void savedVirtualStates
void logicalHeights
void outerVirtualizer
void outerVirtualizerAdapter
void virtualAdapter
void threadVirtualState
void onVirtualHeightChange
void onVirtualStateChange
void captureVirtualStatesBeforeThreadSwitch
void restoreVirtualStateAfterThreadSwitch
void infographicLoader
void CodeBlockNode
void D2BlockNode
void MathBlockNode
void MathInlineNode
void MermaidBlockNode
void InfographicBlockNode
void codeNode
void mathNode
void mdPlugin
void tuplePlugin
void markdownForUse
void markdownItEmojiFull
void registerMarkdownPlugin
void clearRegisteredMarkdownPlugins
