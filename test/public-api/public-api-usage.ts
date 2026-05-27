import type {
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MarkdownIt,
  MarkdownPluginRegistration,
  MarkstreamVuePluginOptions,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  SmoothMarkdownStreamOptions,
} from 'markstream-vue'
import { full as markdownItEmojiFull } from 'markdown-it-emoji'
import MarkdownRender, {
  clearGlobalCustomComponents,
  clearRegisteredMarkdownPlugins,
  CodeBlockNode,
  D2BlockNode,
  disableD2,
  disableKatex,
  disableMermaid,
  enableD2,
  enableKatex,
  enableMermaid,
  getCustomNodeComponents,
  getMarkdown,
  InfographicBlockNode,
  isBrokenMermaidSvg,
  isD2Enabled,
  isKatexEnabled,
  isMermaidEnabled,
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
  setKatexLoader,
  setMermaidLoader,
  toSafeMermaidSvgMarkup,
  toSafeSvgElement,
  useSmoothMarkdownStream,
  VueRendererMarkdown,
} from 'markstream-vue'

const component = MarkdownRender
const plugin = VueRendererMarkdown

const props: NodeRendererProps = {
  content: '# Hello',
  final: true,
  typewriter: true,
  smoothStreaming: 'auto',
  parseCoalesceMs: 80,
  maxLiveNodes: 320,
}

const options: SmoothMarkdownStreamOptions = {}
const customComponents: CustomComponents = {}
const pluginOptions: MarkstreamVuePluginOptions = {
  components: customComponents,
}

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

setDefaultMathOptions({})

const markdown = getMarkdown('public-api-test')
const nodes = parseMarkdownToStructure('# API test', markdown, { final: true })
const controller = useSmoothMarkdownStream(options)
const safeMermaidSvg: string | null = sanitizeMermaidSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const safeMermaidSvgMarkup: string = toSafeMermaidSvgMarkup('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const safeMermaidSvgElement: SVGElement | null = toSafeSvgElement<SVGElement>('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
const brokenMermaidSvg: boolean = isBrokenMermaidSvg('<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>')

const codeBlockProps: Partial<CodeBlockNodeProps> = {}
const mermaidProps: Partial<MermaidBlockNodeProps> = {}
const mathProps: Partial<MathBlockNodeProps> = {}
const mathInlineProps: Partial<MathInlineNodeProps> = {}
const imageProps: Partial<ImageNodeProps> = {}
const linkProps: Partial<LinkNodeProps> = {}
const d2Props: Partial<D2BlockNodeProps> = {}
const infographicProps: Partial<InfographicBlockNodeProps> = {}

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
void nodes
void controller
void safeMermaidSvg
void safeMermaidSvgMarkup
void safeMermaidSvgElement
void brokenMermaidSvg
void codeBlockProps
void mermaidProps
void mathProps
void mathInlineProps
void imageProps
void linkProps
void d2Props
void infographicProps
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
