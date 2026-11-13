import type { ParseContext } from '../parse-context'
import type { ParserRuntime } from '../runtime'
import {
  createLatexSplitMathScanner,
  getStreamingAdmonitionOpenTailReplacement,
  stripPendingExplicitMathTail,
} from './boundary-state'
import { normalizeStreamingCustomHtmlSource } from './custom-html-preprocess'

const SAFE_MARKDOWN_WINDOW_MARGIN = 1024
const SAFE_MARKDOWN_WINDOW_OVERLAP = 16
/**
 * Cached streaming safe-markdown transform, owned by the parser runtime.
 *
 * Fragment parses bypass this top-level cache and use a full transform.
 */
function transformStreamingSafeMarkdown(
  source: string,
  isFinal: boolean,
  options: ParseContext,
) {
  // Reconstruct transport-split LaTeX commands ONLY inside open math contexts
  // ($...$ / $$...$$ / \[...\]). The previous version rewrote every soft line
  // break followed by `abla|eq|ot|exists`, which corrupted ordinary prose
  // ("First.\nother things" gained a literal backslash-n and merged
  // paragraphs). A bare CR (the \rho/\right split) cannot occur in prose, so
  // that reconstruction stays ungated.
  let safeMarkdown = source.replace(/([^\\])\r(ight|ho)/g, '$1\\r$2')
  const latexSplitMathScanner = createLatexSplitMathScanner(safeMarkdown)
  safeMarkdown = safeMarkdown.replace(/([^\\])\r?\n(abla|eq|ot|exists)/g, (full, before, cmd, offset) => {
    // Consume up to (not including) the newline at offset+1: the $ that opens
    // math may sit anywhere on this line, including as its last char.
    latexSplitMathScanner.scanTo(offset + 1)
    const shouldReconstruct = latexSplitMathScanner.inMath()
    // Consume the newline itself: single-$ math is line-scoped and resets.
    latexSplitMathScanner.scanTo(offset + full.length)
    return shouldReconstruct ? `${before}\\n${cmd}` : full
  })

  // Marker recovery only applies when the last non-whitespace character is a digit or punctuation.
  if (!isFinal && !/[a-z]$/i.test(safeMarkdown.trimEnd())) {
    if (safeMarkdown.endsWith('- *')) {
      // 放置markdown 解析 - * 会被处理成多个 ul >li 嵌套列表
      safeMarkdown = safeMarkdown.replace(/- \*$/, '- \\*')
    }
    if (/(?:^|\n)\s*-\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "-" 行（或以换行结尾的 "-\n"）会被渲染成文本/列表前缀，
      // 也会导致输入 "---" 时第一个 "-" 先闪出来再跳成 hr。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*-\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*--\s*$/.test(safeMarkdown)) {
      // streaming 中间态：输入 "---" 时的 "--" 前缀也不应该作为文本渲染，避免跳动。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*--\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/(?:^|\n)\s*>\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 ">" 行会先被识别成 blockquote，导致 UI 闪烁/跳动。
      // 只裁剪末尾这一个 marker，等后续内容到齐再正常解析。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*>\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/\n\s*[*+]\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "*"/"+" 行会被识别成空的 list item，导致 UI 闪出一个圆点
      safeMarkdown = safeMarkdown.replace(/\n\s*[*+]\s*$/, '\n')
    }
    else if (/(?:^|\n)\s*\d+\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "2" / "10" 行常是有序列表 marker 的前缀（下一字符才到 "." / ")"）。
      // 在此状态下 markdown-it 会把它解析成 paragraph/text，导致先撑开一段空白再被下一次解析替换，形成抖动。
      // 只裁剪末尾这一行，等 marker 完整或有内容后再正常解析。
      // 但当整个文档本身就是纯数字（例如 "1234567"）时，这不是列表前缀，而是正常文本内容，
      // 不应被裁剪为空，否则会导致 parse 结果一直为空。
      if (!/^\d+$/.test(safeMarkdown.trim())) {
        safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+\s*$/, (m) => {
          return m.startsWith('\n') ? '\n' : ''
        })
      }
    }
    else if (/(?:^|\n)\s*\d+[.)]\s+\*{1,3}\s*$/.test(safeMarkdown)) {
      // streaming 中间态：有序列表项刚开始输出 "**"（粗体）时，常会经历 "1. *" / "1. **" 等尾部状态。
      // markdown-it 在这些状态下可能把 "*" 当作空的 bullet list marker（嵌套列表），导致 UI 先闪一个圆点/空块再恢复。
      // 将尾部孤立的星号临时转义，避免被当作列表 marker。
      safeMarkdown = safeMarkdown.replace(
        /((?:^|\n)\s*\d+[.)]\s+)(\*{1,3})\s*$/,
        (_, prefix: string, stars: string) => `${prefix}${stars.split('').map(() => '\\*').join('')}`,
      )
    }
    else if (/(?:^|\n)\s*\d+[.)]\s*$/.test(safeMarkdown)) {
      // streaming 中间态：单独的 "2." / "3)" 行会先被渲染成列表/段落占位，随后合并成真正的 list item，导致抖动。
      // 裁剪末尾这一个 marker，等后续内容到齐再正常解析。
      safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+[.)]\s*$/, (m) => {
        return m.startsWith('\n') ? '\n' : ''
      })
    }
    else if (/\n[[(]\n*$/.test(safeMarkdown)) {
      // 此时 markdown 解析会出错要跳过
      safeMarkdown = safeMarkdown.replace(/(\n\[|\n\()+\n*$/g, '\n')
    }
  }

  if (!isFinal) {
    // The tolerant-math boundary scan is applied by the caller to the full
    // document (it carries incremental fence/math state across commits).
    safeMarkdown = getStreamingAdmonitionOpenTailReplacement(safeMarkdown, options.customHtmlTags) ?? safeMarkdown
  }

  safeMarkdown = normalizeStreamingCustomHtmlSource(safeMarkdown, options.customHtmlTags, isFinal)

  return safeMarkdown
}

export function getSafeMarkdown(runtime: ParserRuntime, sourceMarkdown: string, isFinal: boolean, options: ParseContext) {
  const mode = `${isFinal ? 'final' : 'stream'}:${(options.customHtmlTags ?? []).join(',')}`
  const previous = options.isFragment ? undefined : runtime.safeMarkdown

  const update = !isFinal && !options.isFragment && runtime.chunkUpdate?.source === sourceMarkdown
    ? runtime.chunkUpdate
    : undefined
  const tailLength = SAFE_MARKDOWN_WINDOW_MARGIN + SAFE_MARKDOWN_WINDOW_OVERLAP
  // A cached tail exists only while preprocessing leaves the raw source intact.
  let rawTail: string | undefined
  let noMathBoundaryOpener = false
  let safeMarkdown: string
  let extendsPreviousSafeMarkdown = false
  if (
    // Append-only streaming fast path: only the appended tail can introduce
    // new mid-state markers, and the prefix of the previous safe markdown was
    // already transformed identically. Transform a tail window of the RAW
    // source (old tail margin + appended chunk) and stitch it onto the cached
    // prefix, avoiding O(doc) regex scans on every commit (quadratic total
    // for long streaming documents).
    !isFinal
    && !options.customHtmlTags?.length
    && previous
    && previous.mode === mode
    && sourceMarkdown.length >= previous.source.length
    && runtime.sourceExtends(previous.source, sourceMarkdown)
  ) {
    // The window cut MUST be a raw-source index. The previous implementation
    // cut `previous.safeMarkdown` at a safeMarkdown index but sliced the raw
    // source with it: any char-inserting fix earlier in the document (e.g.
    // `\n(abla|eq|ot|exists)` / `\r(ight|ho)`) made the two index spaces
    // diverge and silently dropped/repeated chars at the seam.
    const windowStart = Math.max(0, previous.source.length - tailLength)
    const cachedTail = update?.previous === previous.source ? previous.unchangedRawTail : undefined
    const window = update && cachedTail !== undefined
      ? cachedTail + update.chunk
      : sourceMarkdown.slice(windowStart)
    const transformed = transformStreamingSafeMarkdown(window, isFinal, options)
    // Overlap verification: the part of the window that overlaps the previous
    // source (its first `previous.source.length - windowStart` chars) must be
    // byte-identical to the previous safe markdown tail. A re-transform of
    // unchanged source is deterministic, so equality proves the overlap region
    // had no char-inserting fixes (which would shift the seam) AND that the
    // appended chunk did not complete a cross-boundary fix (e.g. a trailing
    // `\r` followed by an appended `ight`). Any divergence falls back to a
    // full-document transform, which is always correct.
    const overlapLength = previous.source.length - windowStart
    const overlapOk = transformed.length >= overlapLength
      && transformed.slice(0, overlapLength) === (cachedTail ?? previous.safeMarkdown.slice(-overlapLength))
    if (overlapOk) {
      extendsPreviousSafeMarkdown = true
      if (transformed === window && (cachedTail !== undefined || previous.safeMarkdown === previous.source)) {
        safeMarkdown = sourceMarkdown
        if (update) {
          rawTail = window.slice(-tailLength)
          if (previous.noMathBoundaryOpener !== false) {
            const mathWindow = previous.noMathBoundaryOpener ? window : sourceMarkdown
            noMathBoundaryOpener = !mathWindow.includes('$$') && !mathWindow.includes('\\[')
          }
          if (update.previous === previous.source)
            update.safeChunk = update.chunk
        }
      }
      else {
        safeMarkdown = previous.safeMarkdown.slice(0, previous.safeMarkdown.length - overlapLength) + transformed
      }
    }
    else {
      safeMarkdown = transformStreamingSafeMarkdown(sourceMarkdown, isFinal, options)
    }
  }
  else {
    safeMarkdown = transformStreamingSafeMarkdown(sourceMarkdown, isFinal, options)
  }

  // The tolerant-math boundary scan carries incremental fence/math state in
  // its own cache keyed by md, so it must always run on the full document
  // (not a tail window) — otherwise pre-window math openers would be
  // invisible and ambiguous tails would not be hidden.
  if (!isFinal) {
    // A verified overlap proves the transformed prefix is unchanged. A math
    // truncation can preserve that proof only if it leaves the entire prefix.
    if (extendsPreviousSafeMarkdown && previous)
      runtime.rememberSourceExtension(previous.safeMarkdown, safeMarkdown)
    const unstrippedLength = safeMarkdown.length
    safeMarkdown = stripPendingExplicitMathTail(safeMarkdown, runtime, !options.isFragment)
    if (safeMarkdown.length < unstrippedLength) {
      rawTail = undefined
      if (update)
        update.safeChunk = undefined
    }
    if (extendsPreviousSafeMarkdown && previous
      && safeMarkdown.length < unstrippedLength && safeMarkdown.length >= previous.safeMarkdown.length) {
      runtime.rememberSourceExtension(previous.safeMarkdown, safeMarkdown)
    }
  }

  if (!options.isFragment) {
    runtime.safeMarkdown = {
      source: sourceMarkdown,
      safeMarkdown,
      mode,
      unchangedRawTail: rawTail,
      noMathBoundaryOpener: rawTail === undefined ? undefined : noMathBoundaryOpener,
      cannotBeStandaloneHtml: rawTail !== undefined && (
        (extendsPreviousSafeMarkdown && previous?.cannotBeStandaloneHtml)
        || (!previous?.cannotBeStandaloneHtml && /^\s*[^<\s]/.test(safeMarkdown))
      ),
    }
  }
  return safeMarkdown
}
