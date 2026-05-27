export interface MarkdownItOptions extends Record<string, unknown> {
  [key: string]: unknown
  html?: boolean
  xhtmlOut?: boolean
  breaks?: boolean
  langPrefix?: string
  linkify?: boolean
  typographer?: boolean
  quotes?: string | string[]
  highlight?: ((str: string, lang: string, attrs: string) => string | Promise<string>) | null
  validateLink?: (url: string) => boolean
}

export interface Token {
  type: string
  tag: string
  attrs: [string, string][] | null
  map: [number, number] | null
  nesting: number
  level: number
  children: Token[] | null
  content: string
  markup: string
  info: string
  meta: Record<string, unknown> | null
  block: boolean
  hidden: boolean
  attrIndex: (name: string) => number
  attrPush: (attrData: [string, string]) => void
  attrSet: (name: string, value: string) => void
  attrGet: (name: string) => string | null
  attrJoin: (name: string, value: string) => void
}

export interface RuleOptions {
  alt?: string[]
}

export type RuleHandler = (...args: any[]) => unknown

export interface RuleManager {
  before: (name: string, ruleName: string, fn: RuleHandler, options?: RuleOptions) => void
  after: (name: string, ruleName: string, fn: RuleHandler, options?: RuleOptions) => void
  at: (ruleName: string, fn: RuleHandler, options?: RuleOptions) => void
  push: (ruleName: string, fn: RuleHandler, options?: RuleOptions) => void
  enable: (list: string | string[], ignoreInvalid?: boolean) => void
  disable: (list: string | string[], ignoreInvalid?: boolean) => void
  getRules: (chainName?: string) => RuleHandler[]
}

export interface ParserBlock {
  ruler: RuleManager
  parse: (src: string, md: MarkdownIt, env: Record<string, unknown>, outTokens: Token[]) => void
}

export interface ParserInline {
  ruler: RuleManager
  ruler2: RuleManager
}

export interface RendererRuleRecord {
  [type: string]: ((tokens: Token[], idx: number, options?: unknown, env?: unknown, self?: unknown) => unknown) | undefined
}

export interface Renderer {
  rules: RendererRuleRecord
  render: (tokens: Token[], options?: unknown, env?: unknown) => string
  renderToken: (tokens: Token[], idx: number, options?: unknown) => string
}

export interface MarkdownIt {
  core: { ruler: RuleManager }
  block: ParserBlock
  inline: ParserInline
  renderer: Renderer
  options: MarkdownItOptions
  utils: {
    escapeHtml: (value: string) => string
    [key: string]: unknown
  }
  linkify?: unknown
  helpers?: Record<string, unknown>
  set: (options: MarkdownItOptions) => this
  configure: (preset: string | { options?: MarkdownItOptions, components?: unknown }) => this
  enable: (list: string | string[], ignoreInvalid?: boolean) => this
  disable: (list: string | string[], ignoreInvalid?: boolean) => this
  use: <TParams extends unknown[] = any[]>(plugin: CompatibleMarkdownItPlugin<TParams>, ...params: TParams) => this
  parse: (src: string, env?: Record<string, unknown>) => Token[]
  stream?: {
    enabled?: boolean
    parse?: (src: string, env?: Record<string, unknown>) => Token[]
    reset?: () => void
    peek?: () => Token[]
    stats?: () => unknown
    resetStats?: () => void
  }
  parseInline: (src: string, env?: Record<string, unknown>) => Token[]
  render: (src: string, env?: Record<string, unknown>) => string
  renderInline: (src: string, env?: Record<string, unknown>) => string
}

export type MarkdownItPlugin<TParams extends unknown[] = any[]> = (
  md: MarkdownIt,
  ...params: TParams
) => unknown

export type CompatibleMarkdownItPlugin<TParams extends unknown[] = any[]>
  = | MarkdownItPlugin<TParams>
    | ((md: any, ...params: TParams) => unknown)
