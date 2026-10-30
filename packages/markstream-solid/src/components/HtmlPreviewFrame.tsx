import type { JSX } from 'solid-js'
import { createMemo, onCleanup, onMount } from 'solid-js'
import { isServer, Portal } from 'solid-js/web'
import { useSafeI18n } from '../i18n/useSafeI18n'

export interface HtmlPreviewFrameProps {
  code: string
  isDark?: boolean
  htmlPreviewAllowScripts?: boolean
  htmlPreviewSandbox?: string
  onClose?: () => void
  title?: string
}
export function HtmlPreviewFrame(props: HtmlPreviewFrameProps): JSX.Element {
  const { t } = useSafeI18n()
  const sandbox = createMemo(() => typeof props.htmlPreviewSandbox === 'string' ? props.htmlPreviewSandbox : props.htmlPreviewSandbox !== undefined ? '' : props.htmlPreviewAllowScripts === true ? 'allow-scripts' : '')
  const srcdoc = createMemo(() => {
    const code = props.code || ''
    if (/^\s*<(?:!doctype|html|body)/i.test(code))
      return code
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;height:100%;background:${props.isDark ? '#020617' : '#ffffff'};color:${props.isDark ? '#e5e7eb' : '#020617'}}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif}</style></head><body>${code}</body></html>`
  })
  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc')
        props.onClose?.()
    }
    window.addEventListener('keydown', close)
    onCleanup(() => {
      window.removeEventListener('keydown', close)
      previousFocus?.focus()
    })
  })
  if (isServer)
    return null
  return (
    <Portal>
      <div class="markstream-solid" classList={{ dark: !!props.isDark }}>
        <div class="html-preview-frame__backdrop" onClick={() => props.onClose?.()}>
          <div class="html-preview-frame" role="dialog" aria-modal="true" aria-label={props.title || t('common.preview')} onClick={event => event.stopPropagation()}>
            <div class="html-preview-frame__header">
              <span>{props.title || t('common.preview')}</span>
              <button type="button" class="html-preview-frame__close" aria-label={t('common.close')} onClick={() => props.onClose?.()}>×</button>
            </div>
            <iframe class="html-preview-frame__iframe" title={props.title || t('common.preview')} sandbox={sandbox()} referrerPolicy="no-referrer" srcdoc={srcdoc()} />
          </div>
        </div>
      </div>
    </Portal>
  )
}
