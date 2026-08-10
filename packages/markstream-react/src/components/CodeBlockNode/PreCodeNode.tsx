import type { PreCodeNodeProps } from '../../types/component-props'
import React, { useMemo } from 'react'
import { resolveCodePadding, resolveCodeTypography } from './codeTypography'

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk'

interface DiffPreviewLine {
  code: string
  empty: boolean
  kind: DiffPreviewLineKind
  key: string
  number: number | string
}

interface DiffPreviewPane {
  className: string
  key: string
  lines: DiffPreviewLine[]
}

function normalizeLanguage(raw: unknown) {
  const head = String(String(raw ?? '').split(/\s+/g)[0] ?? '')
    .split(':')[0]
    .toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
}

function splitLines(source: unknown) {
  return String(source ?? '').split(/\r\n|\n|\r/)
}

function splitDiffSource(source: unknown) {
  const code = String(source ?? '')
  if (!code)
    return []
  return code.split(/\r\n|\n|\r/)
}

function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedDiffLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function isExplicitDiffLanguage(node: PreCodeNodeProps['node'], normalizedLanguage: string) {
  if (normalizedLanguage === 'diff')
    return true

  const firstLine = String((node as any)?.raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  return /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine)
}

function hasPatchLines(lines: string[], node: PreCodeNodeProps['node'], normalizedLanguage: string) {
  const hasRemoved = lines.some(line => isRemovedDiffLine(line))
  const hasAdded = lines.some(line => isAddedDiffLine(line))
  return (hasRemoved && hasAdded)
    || (isExplicitDiffLanguage(node, normalizedLanguage) && (hasRemoved || hasAdded))
}

function hasDiffSourcePair(node: PreCodeNodeProps['node']) {
  return (node as any)?.originalCode != null || (node as any)?.updatedCode != null
}

function isBlankDiffLine(code: string) {
  return String(code ?? '').trim().length === 0
}

function shouldPreserveSourceBlankDiffKind(lines: string[], index: number) {
  return !isBlankDiffLine(lines[index]) || index < lines.length - 1
}

function toDiffLine(
  code: string,
  kind: DiffPreviewLineKind,
  key: string,
  number: number | string,
  options: { preserveBlankKind?: boolean } = {},
): DiffPreviewLine {
  const empty = String(code ?? '').trim().length === 0
  return {
    code,
    empty,
    kind: empty && kind !== 'hunk' && !options.preserveBlankKind ? 'context' : kind,
    key,
    number,
  }
}

function computeSourceLineMatches(original: string[], modified: string[]) {
  const n = original.length
  const m = modified.length
  const maxCells = 1_500_000
  if ((n + 1) * (m + 1) > maxCells)
    return null

  const cols = m + 1
  const scores = new Uint16Array((n + 1) * (m + 1))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const current = i * cols + j
      if (original[i] === modified[j]) {
        scores[current] = scores[(i + 1) * cols + j + 1] + 1
      }
      else {
        scores[current] = Math.max(scores[(i + 1) * cols + j], scores[i * cols + j + 1])
      }
    }
  }

  const matches: Array<{ originalIndex: number, modifiedIndex: number }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (original[i] === modified[j]) {
      matches.push({ originalIndex: i, modifiedIndex: j })
      i++
      j++
    }
    else if (scores[(i + 1) * cols + j] >= scores[i * cols + j + 1]) {
      i++
    }
    else {
      j++
    }
  }

  return matches
}

function buildInlinePatchPreviewLines(lines: string[]) {
  let modifiedLine = 1
  return lines.map((raw, index) => {
    if (raw.startsWith('@@'))
      return toDiffLine(raw, 'hunk', `inline-hunk-${index}`, '')
    if (isRemovedDiffLine(raw)) {
      const line = toDiffLine(raw.slice(1), 'removed', `inline-removed-${index}`, '', { preserveBlankKind: true })
      return line
    }
    if (isAddedDiffLine(raw))
      return toDiffLine(raw.slice(1), 'added', `inline-added-${index}`, modifiedLine++, { preserveBlankKind: true })

    const code = raw.startsWith(' ') ? raw.slice(1) : raw
    return toDiffLine(code, 'context', `inline-context-${index}`, modifiedLine++)
  })
}

function buildInlineSourcePreviewLines(originalSource: unknown, modifiedSource: unknown) {
  const original = splitDiffSource(originalSource)
  const modified = splitDiffSource(modifiedSource)
  const matches = computeSourceLineMatches(original, modified)

  if (matches) {
    const result: DiffPreviewLine[] = []
    let originalIndex = 0
    let modifiedIndex = 0

    for (const match of matches) {
      while (originalIndex < match.originalIndex) {
        result.push(toDiffLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, '', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
        }))
        originalIndex++
      }
      while (modifiedIndex < match.modifiedIndex) {
        result.push(toDiffLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
        }))
        modifiedIndex++
      }
      result.push(toDiffLine(modified[match.modifiedIndex], 'context', `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1))
      originalIndex = match.originalIndex + 1
      modifiedIndex = match.modifiedIndex + 1
    }

    while (originalIndex < original.length) {
      result.push(toDiffLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, '', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
      }))
      originalIndex++
    }
    while (modifiedIndex < modified.length) {
      result.push(toDiffLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
      }))
      modifiedIndex++
    }

    return result
  }

  const result: DiffPreviewLine[] = []
  let start = 0
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1

  while (start <= originalEnd && start <= modifiedEnd && original[start] === modified[start]) {
    result.push(toDiffLine(modified[start], 'context', `inline-prefix-${start}`, start + 1))
    start++
  }

  const suffix: DiffPreviewLine[] = []
  while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
    suffix.unshift(toDiffLine(modified[modifiedEnd], 'context', `inline-suffix-${modifiedEnd}`, modifiedEnd + 1))
    originalEnd--
    modifiedEnd--
  }

  for (let index = start; index <= originalEnd; index++) {
    result.push(toDiffLine(original[index], 'removed', `inline-removed-source-${index}`, '', {
      preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
    }))
  }

  for (let index = start; index <= modifiedEnd; index++) {
    result.push(toDiffLine(modified[index], 'added', `inline-added-source-${index}`, index + 1, {
      preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
    }))
  }

  return result.concat(suffix)
}

function buildDiffPanes(
  node: PreCodeNodeProps['node'],
  inline = false,
  normalizedLanguage = normalizeLanguage((node as any)?.language),
): DiffPreviewPane[] {
  const patchLines = splitLines((node as any)?.code)
  const hasPatchDiffLines = hasPatchLines(patchLines, node, normalizedLanguage)

  if (!hasPatchDiffLines && hasDiffSourcePair(node)) {
    if (inline) {
      const lines = buildInlineSourcePreviewLines((node as any)?.originalCode, (node as any)?.updatedCode)
      return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
    }

    const original = splitDiffSource((node as any)?.originalCode)
    const modified = splitDiffSource((node as any)?.updatedCode)
    return [
      {
        key: 'original',
        className: 'markstream-pre__diff-pane--original',
        lines: original.map((line, index) => {
          const kind = modified[index] === line ? 'context' : 'removed'
          return toDiffLine(line, kind, `original-${index}`, index + 1, {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
          })
        }),
      },
      {
        key: 'modified',
        className: 'markstream-pre__diff-pane--modified',
        lines: modified.map((line, index) => {
          const kind = original[index] === line ? 'context' : 'added'
          return toDiffLine(line, kind, `modified-${index}`, index + 1, {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
          })
        }),
      },
    ]
  }

  if (inline) {
    const lines = buildInlinePatchPreviewLines(patchLines)
    return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
  }

  const original: DiffPreviewLine[] = []
  const modified: DiffPreviewLine[] = []
  let originalLine = 1
  let modifiedLine = 1

  for (const [index, raw] of patchLines.entries()) {
    if (raw.startsWith('@@')) {
      original.push(toDiffLine(raw, 'hunk', `original-hunk-${index}`, ''))
      modified.push(toDiffLine(raw, 'hunk', `modified-hunk-${index}`, ''))
    }
    else if (isRemovedDiffLine(raw)) {
      original.push(toDiffLine(raw.slice(1), 'removed', `original-removed-${index}`, originalLine++, { preserveBlankKind: true }))
    }
    else if (isAddedDiffLine(raw)) {
      modified.push(toDiffLine(raw.slice(1), 'added', `modified-added-${index}`, modifiedLine++, { preserveBlankKind: true }))
    }
    else {
      const code = raw.startsWith(' ') ? raw.slice(1) : raw
      original.push(toDiffLine(code, 'context', `original-context-${index}`, originalLine++))
      modified.push(toDiffLine(code, 'context', `modified-context-${index}`, modifiedLine++))
    }
  }

  return [
    { key: 'original', className: 'markstream-pre__diff-pane--original', lines: original },
    { key: 'modified', className: 'markstream-pre__diff-pane--modified', lines: modified },
  ]
}

function getDisplayCode(node: PreCodeNodeProps['node']) {
  if ((node as any)?.diff === true)
    return String((node as any)?.code ?? '')
  const value = String((node as any)?.code ?? '')
  return (node as any)?.loading === true ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

function countCodeLines(code: string) {
  let count = 1
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '\n') {
      count++
    }
    else if (code[index] === '\r') {
      count++
      if (code[index + 1] === '\n')
        index++
    }
  }
  return count
}

export function PreCodeNode({ node, className, diffInline, showLineNumbers, style }: PreCodeNodeProps) {
  const normalizedLanguage = useMemo(() => normalizeLanguage((node as any)?.language), [node])
  const languageClass = `language-${normalizedLanguage}`
  const ariaLabel = normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'
  const isDiffPreview = showLineNumbers === true && (node as any)?.diff === true
  const diffPanes = useMemo(() => isDiffPreview ? buildDiffPanes(node, diffInline === true, normalizedLanguage) : [], [diffInline, isDiffPreview, node, normalizedLanguage])
  const displayCode = useMemo(() => getDisplayCode(node), [node])

  const codeLineCount = useMemo(() => countCodeLines(displayCode), [displayCode])
  const lineNumbersText = useMemo(() => {
    let text = ''
    for (let line = 1; line <= codeLineCount; line++)
      text += `${text ? '\n' : ''}${line}`
    return text
  }, [codeLineCount])

  // Match vue3: when line numbers are shown for a non-diff block, size the
  // gutter to the widest line number and let the code padding derive from it.
  const lineNumberLayoutStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (showLineNumbers !== true || isDiffPreview)
      return undefined
    const width = `${Math.max(2, String(codeLineCount).length)}ch`
    return {
      '--markstream-pre-line-number-width': width,
      '--markstream-code-padding-left': 'calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch))',
    } as React.CSSProperties
  }, [isDiffPreview, showLineNumbers, codeLineCount])

  const resolvedStyle = useMemo<React.CSSProperties>(() => {
    const enhancedFallback = className?.split(/\s+/).includes('code-fallback-plain') === true
    const typography = enhancedFallback
      ? resolveCodeTypography()
      : {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 16,
          lineHeight: 28,
        }
    const padding = enhancedFallback
      ? resolveCodePadding(undefined, isDiffPreview ? 0 : 8)
      : { top: 0, bottom: 0 }
    return {
      '--markstream-pre-line-number-top': `${padding.top}px`,
      'fontFamily': typography.fontFamily,
      'fontSize': `${typography.fontSize}px`,
      'lineHeight': `${typography.lineHeight}px`,
      'paddingBottom': `${padding.bottom}px`,
      'paddingTop': `${padding.top}px`,
      'tabSize': enhancedFallback ? 4 : 2,
      ...style,
      ...lineNumberLayoutStyle,
    } as React.CSSProperties
  }, [className, isDiffPreview, lineNumberLayoutStyle, style])

  return (
    <pre
      className={[
        languageClass,
        className,
        showLineNumbers ? 'markstream-pre--line-numbers' : '',
        isDiffPreview ? 'markstream-pre--diff-preview' : '',
        isDiffPreview && diffInline ? 'markstream-pre--diff-inline' : '',
      ].filter(Boolean).join(' ')}
      style={resolvedStyle}
      aria-busy={(node as any)?.loading === true}
      aria-label={ariaLabel}
      data-language={normalizedLanguage}
      data-markstream-line-numbers={showLineNumbers ? '1' : undefined}
      data-markstream-pre="1"
      tabIndex={0}
    >
      {isDiffPreview
        ? (
            <code translate="no" className="markstream-pre__diff-code">
              {diffPanes.map(pane => (
                <span key={pane.key} className={['markstream-pre__diff-pane', pane.className].join(' ')}>
                  {pane.lines.map(line => (
                    <span key={line.key} className={['markstream-pre__diff-line', `markstream-pre__diff-line--${line.kind}`, line.empty ? 'markstream-pre__diff-line--empty' : ''].filter(Boolean).join(' ')}>
                      <span className="markstream-pre__diff-rail" aria-hidden="true" />
                      <span className="markstream-pre__diff-number" aria-hidden="true">{line.number}</span>
                      <span className="markstream-pre__diff-content">
                        <span className="markstream-pre__diff-content-inner">{line.code}</span>
                      </span>
                    </span>
                  ))}
                </span>
              ))}
            </code>
          )
        : (
            <>
              {showLineNumbers && (
                <span className="markstream-pre__line-numbers" aria-hidden="true">
                  <span className="markstream-pre__line-numbers-text">{lineNumbersText}</span>
                </span>
              )}
              <code translate="no" className="markstream-pre__code">{displayCode}</code>
            </>
          )}
    </pre>
  )
}
