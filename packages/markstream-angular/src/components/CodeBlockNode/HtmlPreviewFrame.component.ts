import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { useSafeI18n } from '../../i18n/useSafeI18n'

const isDevEnv = typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).ngDevMode !== false
let lastWarnedDangerousSandbox: string | null = null

function normalizeSandboxTokens(value: string) {
  return new Set(
    value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  )
}

function warnDangerousHtmlPreviewSandbox(value: string) {
  if (!isDevEnv || typeof console === 'undefined' || lastWarnedDangerousSandbox === value)
    return
  const tokens = normalizeSandboxTokens(value)
  if (tokens.has('allow-scripts') && tokens.has('allow-same-origin')) {
    lastWarnedDangerousSandbox = value
    console.warn('[markstream-angular] htmlPreviewSandbox contains both allow-scripts and allow-same-origin. Use this only for fully trusted content served from an isolated origin.')
  }
}

function resolveHtmlPreviewSandboxValue(htmlPreviewSandbox: unknown, htmlPreviewAllowScripts?: boolean) {
  if (typeof htmlPreviewSandbox === 'string') {
    warnDangerousHtmlPreviewSandbox(htmlPreviewSandbox)
    return htmlPreviewSandbox
  }
  if (htmlPreviewSandbox !== undefined)
    return ''
  return htmlPreviewAllowScripts === true ? 'allow-scripts' : ''
}

@Component({
  selector: 'markstream-angular-html-preview-frame',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="html-preview-frame__backdrop"
      [class.html-preview-frame__backdrop--dark]="isDark"
      (click)="onClose?.()"
    >
      <div
        class="html-preview-frame"
        [class.html-preview-frame--dark]="isDark"
        (click)="$event.stopPropagation()"
      >
        <div class="html-preview-frame__header">
          <div class="html-preview-frame__title">
            <span class="html-preview-frame__dot"></span>
            <span class="html-preview-frame__label">{{ resolvedTitle }}</span>
          </div>
          <button
            type="button"
            class="html-preview-frame__close"
            [class.html-preview-frame__close--dark]="isDark"
            (click)="onClose?.()"
          >
            ×
          </button>
        </div>
        <iframe
          class="html-preview-frame__iframe"
          [attr.sandbox]="sandboxValue"
          referrerpolicy="no-referrer"
          [srcdoc]="srcdoc"
          [title]="resolvedTitle"
        ></iframe>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlPreviewFrameComponent {
  @Input() code = ''
  @Input() isDark = false
  @Input() htmlPreviewAllowScripts = false
  @Input() htmlPreviewSandbox?: string
  @Input() title?: string
  @Input() onClose?: () => void

  private readonly i18n = useSafeI18n()

  get resolvedTitle() {
    return this.title || `HTML ${this.i18n.t('common.preview')}`
  }

  get sandboxValue() {
    return resolveHtmlPreviewSandboxValue(this.htmlPreviewSandbox, this.htmlPreviewAllowScripts)
  }

  get srcdoc() {
    const base = this.code || ''
    const lowered = base.trim().toLowerCase()
    if (lowered.startsWith('<!doctype') || lowered.startsWith('<html') || lowered.startsWith('<body'))
      return base
    const bg = this.isDark ? '#020617' : '#ffffff'
    const fg = this.isDark ? '#e5e7eb' : '#020617'
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
  }
}
