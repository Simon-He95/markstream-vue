import type { MathOptions } from './config'
import type { MarkdownIt as MarkdownItInstance } from './markdown-it-types'
import MarkdownIt from 'markdown-it-ts'
import { getDefaultMathOptions } from './config'
import { applyContainers } from './plugins/containers'
import { applyFixHtmlInlineTokens } from './plugins/fixHtmlInline'
import { applyFixIndentedCodeBlock } from './plugins/fixIndentedCodeBlock'
import { applyFixLinkTokens } from './plugins/fixLinkTokens'
import { applyFixListItem } from './plugins/fixListItem'
import { applyFixStrongTokens } from './plugins/fixStrongTokens'
import { applyFixTableTokens } from './plugins/fixTableTokens'
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

export function factory(opts: FactoryOptions = {}): MarkdownItInstance {
  const markdownItOptions = opts.markdownItOptions ?? {}
  const experimental = typeof markdownItOptions.experimental === 'object' && markdownItOptions.experimental !== null
    ? markdownItOptions.experimental as Record<string, unknown>
    : {}
  const stream = Object.prototype.hasOwnProperty.call(markdownItOptions, 'stream')
    ? Boolean(markdownItOptions.stream)
    : true

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    ...markdownItOptions,
    experimental: {
      stream,
      ...experimental,
    },
  } as any) as unknown as MarkdownItInstance

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
