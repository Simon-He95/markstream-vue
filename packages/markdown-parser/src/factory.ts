import type { MathOptions } from './config'
import type { MarkdownIt as MarkdownItInstance, Token } from './markdown-it-types'
import markdownItCjkFriendly from 'markdown-it-cjk-friendly'
import MarkdownIt from 'markdown-it-ts'
import { getDefaultMathOptions } from './config'
import { isUnsafeHtmlUrl } from './htmlTags'
import { applyContainers } from './plugins/containers'
import {
  applyFixHtmlInlineTokens,
  createInlineHtmlTagSet,
  isInsideReconstructedInlineHtmlTag,
} from './plugins/fixHtmlInline'
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
  mathOptions?: MathOptions
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
  /**
   * CJK-friendly emphasis/strong/strikethrough flanking rules
   * (`markdown-it-cjk-friendly`). Default: true.
   *
   * Chinese/Japanese/Korean prose has no spaces around its punctuation, so markers
   * sit directly next to it (`说明**「A」**。`). CommonMark counts that punctuation as
   * Unicode punctuation and refuses the run, which leaves the markers visible or pairs
   * the wrong ones. Default-on because that is the common case for this renderer;
   * set to `false` for plain CommonMark flanking (markdown-it's own default).
   */
  cjkFriendly?: boolean
}

const HTML_LINK_OPEN_RE = /^<a[>\s]/i
const HTML_LINK_CLOSE_RE = /^<\/a\s*>/i
const LINKIFY_SEED_RE = /[@:]|\/\/|\.\S/

interface LinkifyLike {
  test: (text: string) => boolean
  match?: unknown
  re?: { cache: { link_fuzzy_search?: RegExp }, opts: { schema_names?: string[], tlds?: string[] } }
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
  env?: { __markstreamFinal?: boolean }
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

interface InlineLinkifyStateLike {
  md?: MarkdownItInstance
  src?: string
  pos?: number
  env?: { __markstreamCustomHtmlTags?: readonly unknown[] }
}

interface InlineHtmlTagScan {
  src: string
  cursor: number
  /** Candidate `<` offsets before the current position, nearest last. */
  starts: number[]
  /** Lazily resolved `scanHtmlTag` result per candidate start. */
  closeIndexes: Map<number, number | null>
  exhausted: boolean
}

function isHtmlTagNameStart(source: string, lt: number) {
  let code = source.charCodeAt(lt + 1)
  if (code === 47)
    code = source.charCodeAt(lt + 2)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
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
    // Keep cold streaming initialization spread across frames as in the native path.
    let canScreen = !!nativeMethods && !!nativeBuilder && seedSafe
      && (state.env?.__markstreamFinal !== false || !!re?.cache.link_fuzzy_search)
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

/**
 * markdown-it-ts linkifies absolute URLs while it tokenizes inline text. With
 * raw HTML disabled an inline tag is still text at that point, so the URL in
 * `<a href="https://…">` would be split off as a link and the tag could no
 * longer be reconstructed as `html_inline`. Skip those URLs; the tag itself is
 * emitted as `html_inline` right after inline parsing.
 */
function applyInlineLinkifyHtmlTagGuard(md: MarkdownItInstance, customHtmlTags?: readonly string[]) {
  const ruler = md.inline.ruler as InlineRulerWithNamedRules
  const original = ruler.getNamedRules?.().find(rule => rule.name === 'linkify')?.fn
  if (typeof original !== 'function')
    return

  const configuredTagSet = createInlineHtmlTagSet(customHtmlTags)
  const tagSetsByEnvTags = new WeakMap<readonly unknown[], Set<string>>()
  const scans = new WeakMap<object, InlineHtmlTagScan>()

  const resolveTagSet = (state: InlineLinkifyStateLike) => {
    const envTags = state.env?.__markstreamCustomHtmlTags
    if (!Array.isArray(envTags) || envTags.length === 0)
      return configuredTagSet

    let tagSet = tagSetsByEnvTags.get(envTags)
    if (!tagSet) {
      tagSet = createInlineHtmlTagSet(customHtmlTags, envTags)
      tagSetsByEnvTags.set(envTags, tagSet)
    }
    return tagSet
  }

  ruler.at('linkify', (...args: any[]) => {
    const state = args[0] as InlineLinkifyStateLike | undefined
    const src = state?.src
    const pos = state?.pos
    if (!state || typeof src !== 'string' || typeof pos !== 'number' || state.md?.options?.html !== false)
      return original(...args)

    // Track the `<` candidates before `pos` once per inline token; linkified
    // URLs are visited left to right, so this keeps the scan linear.
    let scan = scans.get(state)
    if (!scan || scan.src !== src) {
      scan = { src, cursor: 0, starts: [], closeIndexes: new Map(), exhausted: false }
      scans.set(state, scan)
    }
    if (pos < scan.cursor) {
      // Defensive: a rewound position invalidates the forward cursor. Linkify
      // itself is never applied inside a link label.
      scan.cursor = 0
      scan.starts = []
      scan.closeIndexes.clear()
      scan.exhausted = false
    }

    while (!scan.exhausted && scan.cursor < pos) {
      const next = src.indexOf('<', scan.cursor)
      if (next === -1) {
        scan.exhausted = true
        break
      }
      if (next >= pos) {
        scan.cursor = pos
        break
      }
      if (isHtmlTagNameStart(src, next)) {
        scan.starts.push(next)
      }
      scan.cursor = next + 1
    }

    if (!scan.starts.length)
      return original(...args)

    if (isInsideReconstructedInlineHtmlTag(src, pos, scan.starts, resolveTagSet(state), scan.closeIndexes))
      return false

    return original(...args)
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

  applyInlineLinkifyHtmlTagGuard(md, opts.customHtmlTags)

  applyLinkifyCandidateFilter(md)

  // CJK text has no spaces around its punctuation, which is exactly where CommonMark's
  // flanking rules drop `**`/`*` pairs (`**快。**Pi`, `说明**「A」**。和**「B」**。`).
  // `markdown-it-cjk-friendly` amends the flanking definitions for emphasis, strong and
  // (through the same `scanDelims` seam) GFM strikethrough; markdown-it-ts exposes
  // `md.inline.State` as of 1.1.3, which is what the plugin subclasses. Install it before
  // anything reads tokens.
  if (opts.cjkFriendly ?? true)
    md.use(markdownItCjkFriendly)

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
