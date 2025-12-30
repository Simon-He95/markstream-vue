import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

export interface HtmlPreviewFrameProps {
  code: string
  isDark?: boolean
  onClose?: () => void
  title?: string
}

export function HtmlPreviewFrame(props: HtmlPreviewFrameProps) {
  const srcdoc = useMemo(() => {
    const base = props.code || ''
    const lowered = base.trim().toLowerCase()
    if (lowered.startsWith('<!doctype') || lowered.startsWith('<html') || lowered.startsWith('<body'))
      return base
    const bg = props.isDark ? '#020617' : '#ffffff'
    const fg = props.isDark ? '#e5e7eb' : '#020617'
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: ${bg};
        color: ${fg};
      }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', ui-sans-serif, sans-serif;
      }
    </style>
  </head>
  <body>
    ${base}
  </body>
</html>`
  }, [props.code, props.isDark])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc')
        props.onClose?.()
    }
    if (typeof window !== 'undefined')
      window.addEventListener('keydown', handleKeydown)
    return () => {
      if (typeof window !== 'undefined')
        window.removeEventListener('keydown', handleKeydown)
    }
  }, [props])

  if (typeof document === 'undefined')
    return null

  return createPortal(
    <div className={`html-preview-frame__backdrop${props.isDark ? ' html-preview-frame__backdrop--dark' : ''}`} onClick={() => props.onClose?.()}>
      <div className={`html-preview-frame${props.isDark ? ' html-preview-frame--dark' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="html-preview-frame__header">
          <div className="html-preview-frame__title">
            <span className="html-preview-frame__dot" />
            <span className="html-preview-frame__label">{props.title || 'Preview'}</span>
          </div>
          <button
            type="button"
            className={`html-preview-frame__close${props.isDark ? ' html-preview-frame__close--dark' : ''}`}
            onClick={() => props.onClose?.()}
          >
            ×
          </button>
        </div>
        <iframe
          className="html-preview-frame__iframe"
          sandbox="allow-scripts allow-same-origin"
          srcDoc={srcdoc}
          title={props.title || 'Preview'}
        />
      </div>
    </div>,
    document.body,
  )
}

export default HtmlPreviewFrame
