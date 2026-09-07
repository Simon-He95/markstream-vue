import type { MathOptions } from './config'
import type { MarkdownIt as MarkdownItInstance, Token } from './markdown-it-types'
import MarkdownIt from 'markdown-it-ts'
import { getDefaultMathOptions } from './config'
import { isUnsafeHtmlUrl } from './htmlTags'
import { applyContainers } from './plugins/containers'
import { applyFixHtmlInlineTokens } from './plugins/fixHtmlInline'
import { applyFixIndentedCodeBlock } from './plugins/fixIndentedCodeBlock'
import { applyFixLinkTokens } from './plugins/fixLinkTokens'
import { applyFixListItem } from './plugins/fixListItem'
import { applyFixStrongTokens } from './plugins/fixStrongTokens'
import { applyFixTableTokens } from './plugins/fixTableTokens'
import { registerCacheStableLinkValidator } from './plugins/linkTokenMetadata'
import { applyMath } from './plugins/math'
import { applyRenderRules } from './renderers'

export interface FactoryOptions extends Record<string, unknown> {
  markdownItOptions?: Record<string, unknown>
  enableMath?: boolean
  enableContainers?: boolean
  mathOptions?: { commands?: string[], escapeExclamation?: boolean }
  /**
   * Custom HTML-like tag names that should participate in streaming mid-state
   * suppression and be emitted as custom nodes (e.g. ['thinking']).
   */
  customHtmlTags?: readonly string[]
  /**
   * Whether to enable the fix for indented code blocks that should be paragraphs.
   * Default: true
   */
  enableFixIndentedCodeBlock?: boolean
}

const HTML_LINK_OPEN_RE = /^<a[>\s]/i
const HTML_LINK_CLOSE_RE = /^<\/a\s*>/i
const LINKIFY_SEED_RE = /[@:]|\/\/|\.\S/

interface LinkifyLike {
  test: (text: string) => boolean
  match?: unknown
  re?: { cache: object, opts: { schema_names?: string[], tlds?: string[] } }
}

interface CoreRuleRecord {
  name: string
  fn: (state: CoreStateLike) => unknown
}

interface CoreRulerWithNamedRules {
  at: (ruleName: string, fn: (state: CoreStateLike) => unknown) => void
  getNamedRules?: () => CoreRuleRecord[]
}

interface CoreStateLike {
  md?: MarkdownItInstance & { linkify?: LinkifyLike }
  tokens?: Token[]
}

interface InlineRuleRecord {
  name: string
  fn: (...args: any[]) => unknown
}

interface InlineRulerWithNamedRules {
  at: (ruleName: string, fn: (...args: any[]) => unknown) => void
  getNamedRules?: () => InlineRuleRecord[]
}

interface InlineStateLike {
  md?: MarkdownItInstance & { validateLink: (url: string) => boolean }
}

function inlineTokenMayNeedLinkify(token: Token, linkify: LinkifyLike) {
  if (token?.type !== 'inline')
    return false

  const children = token.children
  if (!Array.isArray(children) || children.length === 0)
    return linkify.test(String(token.content ?? ''))

  let htmlLinkLevel = 0
  for (let index = children.length - 1; index >= 0; index--) {
    const currentToken = children[index]

    if (currentToken?.type === 'link_close') {
      index--
      while (index >= 0 && children[index]?.level !== currentToken.level && children[index]?.type !== 'link_open')
        index--
      continue
    }

    if (currentToken?.type === 'html_inline') {
      const content = String(currentToken.content ?? '')
      if (HTML_LINK_OPEN_RE.test(content) && htmlLinkLevel > 0)
        htmlLinkLevel--
      if (HTML_LINK_CLOSE_RE.test(content))
        htmlLinkLevel++
    }

    if (htmlLinkLevel > 0)
      continue

    if (currentToken?.type === 'text' && linkify.test(String(currentToken.content ?? '')))
      return true
  }

  return false
}

function applyLinkifyCandidateFilter(md: MarkdownItInstance) {
  const ruler = md.core?.ruler as CoreRulerWithNamedRules
  const original = ruler.getNamedRules?.().find(rule => rule.name === 'linkify')?.fn
  if (typeof original !== 'function')
    return

  const nativeLinkify = md.options.linkify ? md.linkify as LinkifyLike : undefined
  const nativeTest = nativeLinkify?.test
  const nativeMatch = nativeLinkify?.match
  const nativeBuilderPrototype = nativeLinkify?.re && Object.getPrototypeOf(nativeLinkify.re)
  let screenedCache: object | undefined
  let seedSafe = false

  ruler.at('linkify', (state: CoreStateLike) => {
    if (!state.md?.options?.linkify)
      return

    const tokens = Array.isArray(state.tokens) ? state.tokens : []
    const linkify = state.md.linkify
    if (!linkify)
      return

    if (!tokens.some(token => token?.type === 'inline'))
      return

    const re = linkify.re
    const nativeBuilder = re && Object.getPrototypeOf(re) === nativeBuilderPrototype
      && !Object.values(re).some(value => typeof value === 'function')
    const nativeMethods = linkify.test === nativeTest && linkify.match === nativeMatch
    if (nativeMethods && nativeBuilder && screenedCache !== re.cache) {
      // Configuration methods replace this cache; screening must not compile regexes.
      screenedCache = re.cache
      const { schema_names: schemas = [], tlds = [] } = re.opts
      seedSafe = schemas.every(name => name === '//' || name.endsWith(':'))
        && tlds.every(tld => /^[\p{L}\p{N}-]+$/u.test(tld))
    }
    let canScreen = !!nativeMethods && !!nativeBuilder && seedSafe
    const candidates = tokens.filter((token: Token) => {
      if (canScreen && token?.type === 'inline') {
        const children = token.children
        if (Array.isArray(children) && children.length > 0) {
          if (!children.some(child => child?.type === 'text' && LINKIFY_SEED_RE.test(String(child.content ?? ''))))
            return false
        }
        else if (!LINKIFY_SEED_RE.test(String(token.content ?? ''))) {
          return false
        }
        // Native validators can change schemas or methods during this rule run.
        canScreen = false
      }
      return inlineTokenMayNeedLinkify(token, linkify)
    })
    if (!candidates.length)
      return

    const filteredState = Object.assign(Object.create(Object.getPrototypeOf(state)), state, {
      tokens: candidates,
    })
    return original(filteredState)
  })
}

function applyInlineUrlValidation(md: MarkdownItInstance) {
  const ruler = md.inline.ruler as InlineRulerWithNamedRules
  const rules = ruler.getNamedRules?.()
  const originalLink = rules?.find(rule => rule.name === 'link')?.fn
  const originalImage = rules?.find(rule => rule.name === 'image')?.fn
  if (typeof originalLink !== 'function' || typeof originalImage !== 'function')
    return

  const markdownIt = md as MarkdownItInstance & { validateLink: (url: string) => boolean }
  const imageValidateLink = markdownIt.validateLink
  const markstreamMd = md as MarkdownItInstance & { __markstreamOriginalValidateLink?: (url: string) => boolean }
  markstreamMd.__markstreamOriginalValidateLink = imageValidateLink

  ruler.at('link', (...args: any[]) => {
    const state = args[0] as InlineStateLike
    const activeMd = state.md
    const validateLink = activeMd?.validateLink === imageValidateLink
      ? activeMd.options?.validateLink
      : activeMd?.validateLink
    if (!activeMd || typeof validateLink !== 'function')
      return originalLink(...args)

    const originalValidateLink = activeMd.validateLink
    activeMd.validateLink = validateLink
    try {
      return originalLink(...args)
    }
    finally {
      activeMd.validateLink = originalValidateLink
    }
  })

  ruler.at('image', (...args: any[]) => {
    const state = args[0] as InlineStateLike
    const activeMd = state.md
    if (!activeMd)
      return originalImage(...args)

    const originalValidateLink = activeMd.validateLink
    activeMd.validateLink = imageValidateLink
    try {
      return originalImage(...args)
    }
    finally {
      activeMd.validateLink = originalValidateLink
    }
  })
}

export function factory(opts: FactoryOptions = {}): MarkdownItInstance {
  const markdownItOptions = opts.markdownItOptions ?? {}
  const experimental = typeof markdownItOptions.experimental === 'object' && markdownItOptions.experimental !== null
    ? markdownItOptions.experimental as Record<string, unknown>
    : {}
  const stream = Object.prototype.hasOwnProperty.call(markdownItOptions, 'stream')
    ? Boolean(markdownItOptions.stream)
    : true
  const hasCustomValidateLink = Object.prototype.hasOwnProperty.call(markdownItOptions, 'validateLink')
  const experimentalOptions = {
    stream,
    ...experimental,
  }

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    ...markdownItOptions,
    experimental: experimentalOptions,
  }) as unknown as MarkdownItInstance

  const tailLocalOption = 'streamTailLocalPostBlockRules'
  const hasTailLocalSetting = Object.prototype.hasOwnProperty.call(markdownItOptions, tailLocalOption)
    || Object.prototype.hasOwnProperty.call(experimental, tailLocalOption)
  if (!hasTailLocalSetting && Object.prototype.hasOwnProperty.call(md.options, tailLocalOption)) {
    (md.options as Record<string, unknown>)[tailLocalOption] = true
  }

  if (!hasCustomValidateLink) {
    const validateLink = (url: string) => !isUnsafeHtmlUrl(url, { tagName: 'a', attrName: 'href' })
    registerCacheStableLinkValidator(validateLink)
    md.set({ validateLink })
  }

  applyInlineUrlValidation(md)

  applyLinkifyCandidateFilter(md)

  if (opts.enableMath ?? true) {
    const mergedMathOptions: MathOptions = { ...(getDefaultMathOptions() ?? {}), ...(opts.mathOptions ?? {}) }
    applyMath(md, mergedMathOptions)
  }
  if (opts.enableContainers ?? true)
    applyContainers(md)
  // Fix indented code blocks that should be paragraphs (streaming scenario)
  if (opts.enableFixIndentedCodeBlock !== false)
    applyFixIndentedCodeBlock(md)
  // Retain the core-stage fix as a fallback for cases the inline
  // tokenizer does not handle.
  applyFixLinkTokens(md)
  // Also apply strong-token normalization at the same stage.
  applyFixStrongTokens(md)
  // Apply list-item inline normalization as well.
  applyFixListItem(md)
  // Apply table token normalization at block stage.
  applyFixTableTokens(md)
  applyRenderRules(md)
  applyFixHtmlInlineTokens(md, {
    customHtmlTags: opts.customHtmlTags,
  })

  return md
}
