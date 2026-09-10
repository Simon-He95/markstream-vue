export interface HtmlPreviewFrameProps {
  code?: string
  title?: string
  isDark?: boolean
  htmlPreviewAllowScripts?: boolean
  htmlPreviewSandbox?: string
  onClose?: () => void
}

export function HtmlPreviewFrame(props: HtmlPreviewFrameProps) {
  const title = () => props.title || 'Preview'
  const sandbox = () => props.htmlPreviewSandbox ?? (props.htmlPreviewAllowScripts ? 'allow-scripts' : '')
  return (
    <div class={`html-preview-frame${props.isDark ? ' is-dark' : ''}`}>
      <div class="html-preview-frame__header">
        <span>{title()}</span>
        <button type="button" onClick={() => props.onClose?.()}>Close</button>
      </div>
      <iframe title={title()} class="html-preview-frame__iframe" srcdoc={props.code || ''} sandbox={sandbox()} />
    </div>
  )
}
