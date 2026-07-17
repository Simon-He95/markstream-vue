import type { PreCodeNodeProps } from '../../types/component-props'
import { buildDiffPreviewPanes } from 'markstream-core'
import React, { useMemo } from 'react'

function normalizeLanguage(raw: unknown) {
  const head = String(raw ?? '').split(/\s+/g)[0]?.split(':')[0]?.toLowerCase() ?? ''
  return head.replace(/[^\w-]/g, '') || 'plaintext'
}

function getDisplayCode(node: PreCodeNodeProps['node']) {
  const value = String((node as any)?.code ?? '')
  return (node as any)?.loading === true ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

export function PreCodeNode({
  node,
  className,
  diffHideUnchangedRegions,
  diffInline,
  showLineNumbers,
  style,
}: PreCodeNodeProps) {
  const normalizedLanguage = useMemo(() => normalizeLanguage((node as any)?.language), [node])
  const languageClass = `language-${normalizedLanguage}`
  const ariaLabel = normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'
  const isDiffPreview = showLineNumbers === true && (node as any)?.diff === true
  const displayCode = useMemo(() => getDisplayCode(node), [node])
  const lineNumbers = useMemo(() => displayCode.split(/\r\n|\n|\r/).map((_, index) => index + 1).join('\n'), [displayCode])
  const diffPanes = useMemo(() => isDiffPreview
    ? buildDiffPreviewPanes({
        code: (node as any)?.code,
        hideUnchangedRegions: diffHideUnchangedRegions,
        inline: diffInline === true,
        language: (node as any)?.language,
        loading: (node as any)?.loading === true,
        originalCode: (node as any)?.originalCode,
        raw: (node as any)?.raw,
        updatedCode: (node as any)?.updatedCode,
      })
    : [], [diffHideUnchangedRegions, diffInline, isDiffPreview, node])
  const hasCollapsedRows = diffPanes.some(pane => pane.lines.some(line => line.kind === 'collapsed'))

  return (
    <pre
      className={[
        languageClass,
        className,
        showLineNumbers ? 'markstream-pre--line-numbers' : '',
        isDiffPreview ? 'markstream-pre--diff-preview' : '',
        isDiffPreview && diffInline ? 'markstream-pre--diff-inline' : '',
        hasCollapsedRows ? 'markstream-pre--diff-collapsed' : '',
      ].filter(Boolean).join(' ')}
      style={style}
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
                  <span className="markstream-pre__diff-pane-content">
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
                </span>
              ))}
            </code>
          )
        : (
            <>
              {showLineNumbers && (
                <span className="markstream-pre__line-numbers" aria-hidden="true">
                  <span className="markstream-pre__line-numbers-text">{lineNumbers}</span>
                </span>
              )}
              <code translate="no" className="markstream-pre__code">{displayCode}</code>
            </>
          )}
    </pre>
  )
}
