import type { PreCodeNodeProps } from '../../types/component-props'
import React, { useMemo } from 'react'

function normalizeLanguage(raw: unknown) {
  const head = String(String(raw ?? '').split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
}

export function PreCodeNode({ node }: PreCodeNodeProps) {
  const normalizedLanguage = useMemo(() => normalizeLanguage((node as any)?.language), [node])
  const languageClass = `language-${normalizedLanguage}`
  const ariaLabel = normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'

  return (
    <pre
      className={languageClass}
      aria-busy={(node as any)?.loading === true}
      aria-label={ariaLabel}
      data-language={normalizedLanguage}
      tabIndex={0}
    >
      <code translate="no">{String((node as any)?.code ?? '')}</code>
    </pre>
  )
}
