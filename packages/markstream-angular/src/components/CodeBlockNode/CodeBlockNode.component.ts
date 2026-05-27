import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
import type { CodeBlockMonacoTheme } from '../../types/monaco'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  ViewChild,
} from '@angular/core'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { getUseMonaco } from '../../optional/monaco'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../../utils/languageIcon'
import { PreCodeNodeComponent } from '../PreCodeNode/PreCodeNode.component'
import { getString } from '../shared/node-helpers'
import { HtmlPreviewFrameComponent } from './HtmlPreviewFrame.component'

interface MonacoHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language?: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language?: string) => Promise<unknown> | unknown
  cleanupEditor?: () => void
  safeClean?: () => void
  getEditorView?: () => any
  getDiffEditorView?: () => any
  setTheme?: (theme?: CodeBlockMonacoTheme) => Promise<unknown> | unknown
}

@Component({
  selector: 'markstream-angular-code-block-node',
  standalone: true,
  imports: [CommonModule, PreCodeNodeComponent, HtmlPreviewFrameComponent],
  template: `
    <div
      class="code-block-container"
      [class.is-dark]="resolvedIsDark"
      [class.is-plain-text]="isPlainTextLanguage"
      [class.is-rendering]="resolvedLoading"
      [attr.data-markstream-monaco]="editorReady && !useFallback ? '1' : null"
      [attr.data-markstream-monaco-diff]="editorReady && isDiff && !useFallback ? '1' : null"
      [ngStyle]="containerStyle"
    >
      <div
        *ngIf="resolvedShowHeader"
        class="code-block-header"
        [style.color]="headerForeground"
        [style.backgroundColor]="headerBackground"
      >
        <div class="code-block-header__meta">
          <span class="icon-slot code-block-language-icon">
            <img class="code-block-language-icon__image" [src]="languageIconDataUrl" alt="" />
          </span>
          <span class="code-block-header__label">{{ displayLanguage }}</span>
        </div>
        <div class="code-block-header__actions">
          <button
            *ngIf="resolvedShowCollapseButton"
            type="button"
            class="code-action-btn"
            [attr.title]="tooltipFor(collapsed ? t('common.expand') : t('common.collapse'))"
            [attr.aria-pressed]="collapsed"
            (click)="toggleCollapsed()"
          >
            <svg
              [style.rotate]="collapsed ? '0deg' : '90deg'"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              width="1em"
              height="1em"
              viewBox="0 0 24 24"
              class="code-action-btn__icon"
            >
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" />
            </svg>
          </button>

          <ng-container *ngIf="resolvedShowFontSizeButtons && resolvedEnableFontSizeControl">
            <button
              type="button"
              class="code-action-btn"
              [disabled]="fontSize <= 10"
              [attr.title]="tooltipFor(t('common.decrease'))"
              (click)="changeFontSize(-1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
                <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              class="code-action-btn"
              [disabled]="fontSize === defaultFontSize"
              [attr.title]="tooltipFor(t('common.reset'))"
              (click)="resetFontSize()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
                <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </g>
              </svg>
            </button>
            <button
              type="button"
              class="code-action-btn"
              [disabled]="fontSize >= 36"
              [attr.title]="tooltipFor(t('common.increase'))"
              (click)="changeFontSize(1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
                <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" />
              </svg>
            </button>
          </ng-container>

          <button
            *ngIf="resolvedShowCopyButton"
            type="button"
            class="code-action-btn"
            [attr.title]="tooltipFor(copied ? t('common.copied') : t('common.copy'))"
            [attr.aria-label]="copied ? t('common.copied') : t('common.copy')"
            (click)="copyCode()"
          >
            <svg *ngIf="!copied" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
              <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </g>
            </svg>
            <svg *ngIf="copied" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" />
            </svg>
          </button>

          <button
            *ngIf="resolvedShowExpandButton"
            type="button"
            class="code-action-btn"
            [attr.title]="tooltipFor(expanded ? t('common.collapse') : t('common.expand'))"
            [attr.aria-pressed]="expanded"
            (click)="toggleExpanded()"
          >
            <svg *ngIf="expanded" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />
            </svg>
            <svg *ngIf="!expanded" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="code-action-btn__icon">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" />
            </svg>
          </button>

          <button
            *ngIf="resolvedShowPreviewButton && isPreviewable"
            type="button"
            class="code-action-btn"
            [attr.title]="tooltipFor(t('common.preview'))"
            [attr.aria-label]="t('common.preview')"
            (click)="previewCode()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" class="code-action-btn__icon">
              <g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd">
                <path d="M23.628 7.41c-.12-1.172-.08-3.583-.9-4.233c-1.921-1.51-6.143-1.11-8.815-1.19c-3.481-.15-7.193.14-10.625.24a.34.34 0 0 0 0 .67c3.472-.05 7.074-.29 10.575-.09c2.471.15 6.653-.14 8.254 1.16c.4.33.41 2.732.49 3.582a42 42 0 0 1 .08 9.005a13.8 13.8 0 0 1-.45 3.001c-2.42 1.4-19.69 2.381-20.72.55a21 21 0 0 1-.65-4.632a41.5 41.5 0 0 1 .12-7.964c.08 0 7.334.33 12.586.24c2.331 0 4.682-.13 6.764-.21a.33.33 0 0 0 0-.66c-7.714-.16-12.897-.43-19.31.05c.11-1.38.48-3.922.38-4.002a.3.3 0 0 0-.42 0c-.37.41-.29 1.77-.36 2.251s-.14 1.07-.2 1.6a45 45 0 0 0-.36 8.645a21.8 21.8 0 0 0 .66 5.002c1.46 2.702 17.248 1.461 20.95.43c1.45-.4 1.69-.8 1.871-1.95c.575-3.809.602-7.68.08-11.496" />
                <path d="M4.528 5.237a.84.84 0 0 0-.21-1c-.77-.41-1.71.39-1 1.1a.83.83 0 0 0 1.21-.1m2.632-.25c.14-.14.19-.84-.2-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.2-.09m2.88 0a.83.83 0 0 0-.21-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.21-.09m-4.29 8.735c0 .08.23 2.471.31 2.561a.371.371 0 0 0 .63-.14c0-.09 0 0 .15-1.72a10 10 0 0 0-.11-2.232a5.3 5.3 0 0 1-.26-1.37a.3.3 0 0 0-.54-.24a6.8 6.8 0 0 0-.2 2.33c-1.281-.38-1.121.13-1.131-.42a15 15 0 0 0-.19-1.93c-.16-.17-.36-.17-.51.14a20 20 0 0 0-.43 3.471c.04.773.18 1.536.42 2.272c.26.4.7.22.7-.1c0-.09-.16-.09 0-1.862c.06-1.18-.23-.3 1.16-.76m5.033-2.552c.32-.07.41-.28.39-.37c0-.55-3.322-.34-3.462-.24s-.2.18-.18.28s0 .11 0 .16a3.8 3.8 0 0 0 1.591.361v.82a15 15 0 0 0-.13 3.132c0 .2-.09.94.17 1.16a.34.34 0 0 0 .48 0c.125-.35.196-.718.21-1.09a8 8 0 0 0 .14-3.232c0-.13.05-.7-.1-.89a8 8 0 0 0 .89-.09m5.544-.181a.69.69 0 0 0-.89-.44a2.8 2.8 0 0 0-1.252 1.001a2.3 2.3 0 0 0-.41-.83a1 1 0 0 0-1.6.27a7 7 0 0 0-.35 2.07c0 .571 0 2.642.06 2.762c.14 1.09 1 .51.63.13a17.6 17.6 0 0 1 .38-3.962c.32-1.18.32.2.39.51s.11 1.081.73 1.081s.48-.93 1.401-1.78q.075 1.345 0 2.69a15 15 0 0 0 0 1.811a.34.34 0 0 0 .68 0q.112-.861.11-1.73a16.7 16.7 0 0 0 .12-3.582m1.441-.201c-.05.16-.3 3.002-.31 3.202a6.3 6.3 0 0 0 .21 1.741c.33 1 1.21 1.07 2.291.82a3.7 3.7 0 0 0 1.14-.23c.21-.22.10-.59-.41-.64q-.817.096-1.64.07c-.44-.07-.34 0-.67-4.442q.015-.185 0-.37a.316.316 0 0 0-.23-.38a.316.316 0 0 0-.38.23" />
              </g>
            </svg>
          </button>
        </div>
      </div>

      <div
        class="code-block-body"
        [class.code-block-body--collapsed]="collapsed"
        [class.code-block-body--expanded]="expanded"
      >
        <ng-container *ngIf="!showLoadingPlaceholder; else loadingTpl">
          <markstream-angular-pre-code-node *ngIf="useFallback; else editorTpl" [node]="node" />

          <ng-template #editorTpl>
            <div #editorHost class="code-editor-container" [style.visibility]="editorReady ? 'visible' : 'hidden'"></div>
            <div *ngIf="!editorReady" style="position:absolute; inset:0; overflow:auto; padding:1rem;">
              <pre class="code-fallback-plain m-0" [attr.aria-busy]="resolvedLoading" [attr.aria-label]="ariaLabel" tabindex="0"><code translate="no" [style.fontSize.px]="fontSize" [textContent]="resolvedCode"></code></pre>
            </div>
          </ng-template>
        </ng-container>
      </div>

      <markstream-angular-html-preview-frame
        *ngIf="inlinePreviewOpen && isPreviewable"
        [code]="resolvedCode"
        [htmlPreviewAllowScripts]="mergedProps.htmlPreviewAllowScripts === true"
        [htmlPreviewSandbox]="mergedProps.htmlPreviewSandbox"
        [isDark]="resolvedIsDark"
        [title]="previewTitle"
        [onClose]="closeInlinePreview"
      />

      <span class="sr-only" aria-live="polite" role="status">{{ copied ? t('common.copied') : '' }}</span>
    </div>

    <ng-template #loadingTpl>
      <div class="code-loading-placeholder">
        <div class="loading-skeleton">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeBlockNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly i18n = useSafeI18n()

  @ViewChild('editorHost') private editorHost?: ElementRef<HTMLElement>

  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() props?: Record<string, any>

  useFallback = false
  copied = false
  collapsed = false
  expanded = false
  inlinePreviewOpen = false
  editorReady = false
  defaultFontSize = 14
  fontSize = 14

  private helpers: MonacoHelpers | null = null
  private createPromise: Promise<void> | null = null
  private syncPromise: Promise<void> | null = null
  private editorKind: 'single' | 'diff' | null = null
  private viewReady = false
  private destroyed = false
  private copyTimer: number | null = null
  private deferredHeightSyncRaf: number | null = null

  get t() {
    return this.i18n.t
  }

  get mergedProps() {
    return {
      ...(this.context?.codeBlockProps || {}),
      ...(this.props || {}),
    }
  }

  get resolvedLoading() {
    const explicit = this.mergedProps.loading
    if (typeof explicit === 'boolean')
      return explicit
    return (this.node as any)?.loading !== false
  }

  get resolvedStream() {
    const explicit = this.mergedProps.stream
    if (typeof explicit === 'boolean')
      return explicit
    if (typeof this.context?.codeBlockStream === 'boolean')
      return this.context.codeBlockStream
    return true
  }

  get resolvedIsDark() {
    const explicit = this.mergedProps.isDark
    if (typeof explicit === 'boolean')
      return explicit
    return this.context?.isDark === true
  }

  get resolvedDarkTheme() {
    return this.mergedProps.darkTheme ?? this.context?.codeBlockThemes?.darkTheme ?? 'vitesse-dark'
  }

  get resolvedLightTheme() {
    return this.mergedProps.lightTheme ?? this.context?.codeBlockThemes?.lightTheme ?? 'vitesse-light'
  }

  get resolvedThemes() {
    return this.mergedProps.themes ?? this.context?.codeBlockThemes?.themes ?? ['vitesse-dark', 'vitesse-light']
  }

  get resolvedMonacoOptions() {
    return {
      ...(this.context?.codeBlockThemes?.monacoOptions || {}),
      ...(this.mergedProps.monacoOptions || {}),
    }
  }

  get resolvedEnableFontSizeControl() {
    if (typeof this.mergedProps.enableFontSizeControl === 'boolean')
      return this.mergedProps.enableFontSizeControl
    return true
  }

  get resolvedShowHeader() {
    return this.mergedProps.showHeader !== false
  }

  get resolvedShowCopyButton() {
    return this.mergedProps.showCopyButton !== false
  }

  get resolvedShowExpandButton() {
    return this.mergedProps.showExpandButton !== false
  }

  get resolvedShowPreviewButton() {
    return this.mergedProps.showPreviewButton !== false
  }

  get resolvedShowCollapseButton() {
    return this.mergedProps.showCollapseButton !== false
  }

  get resolvedShowFontSizeButtons() {
    return this.mergedProps.showFontSizeButtons !== false
  }

  get resolvedShowTooltips() {
    if (typeof this.mergedProps.showTooltips === 'boolean')
      return this.mergedProps.showTooltips
    return this.context?.showTooltips !== false
  }

  get resolvedIsShowPreview() {
    if (typeof this.mergedProps.isShowPreview === 'boolean')
      return this.mergedProps.isShowPreview
    return true
  }

  get rawLanguage() {
    return getString((this.node as any)?.language || 'plaintext')
  }

  get canonicalLanguage() {
    return normalizeLanguageIdentifier(this.rawLanguage) || 'plain'
  }

  get monacoLanguage() {
    return resolveMonacoLanguageId(this.rawLanguage)
  }

  get isPlainTextLanguage() {
    return this.monacoLanguage === 'plaintext'
  }

  get displayLanguage() {
    const label = languageMap[this.canonicalLanguage] || this.canonicalLanguage
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Text'
  }

  get languageIconDataUrl() {
    const icon = getLanguageIcon(this.rawLanguage).trim()
    const svg = icon.includes('xmlns=')
      ? icon
      : icon.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  get resolvedCode() {
    if (this.isDiff)
      return getString((this.node as any)?.updatedCode || (this.node as any)?.code)
    return getString((this.node as any)?.code)
  }

  get originalCode() {
    return getString((this.node as any)?.originalCode)
  }

  get isDiff() {
    return !!(this.node as any)?.diff
  }

  get isPreviewable() {
    if (!this.resolvedIsShowPreview)
      return false
    return this.canonicalLanguage === 'html' || this.canonicalLanguage === 'svg'
  }

  get previewTitle() {
    return this.canonicalLanguage === 'html'
      ? this.t('artifacts.htmlPreviewTitle')
      : this.t('artifacts.svgPreviewTitle')
  }

  get headerForeground() {
    return `var(--vscode-editor-foreground, ${this.resolvedIsDark ? '#e5e7eb' : '#111827'})`
  }

  get headerBackground() {
    return `var(--vscode-editor-background, ${this.resolvedIsDark ? '#111827' : '#ffffff'})`
  }

  get ariaLabel() {
    return `Code block: ${this.displayLanguage}`
  }

  get showLoadingPlaceholder() {
    return this.shouldDelayEditor
  }

  get shouldDelayEditor() {
    return !this.resolvedStream && this.resolvedLoading
  }

  get containerStyle() {
    const style: Record<string, string> = {}
    const min = this.resolveCssSize(this.mergedProps.minWidth ?? this.context?.codeBlockThemes?.minWidth)
    const max = this.resolveCssSize(this.mergedProps.maxWidth ?? this.context?.codeBlockThemes?.maxWidth)
    if (min)
      style.minWidth = min
    if (max)
      style.maxWidth = max
    return style
  }

  readonly closeInlinePreview = () => {
    this.inlinePreviewOpen = false
    this.cdr.markForCheck()
  }

  ngAfterViewInit() {
    this.viewReady = true
    this.applyInitialFontSize()
    void this.syncEditorState()
  }

  ngOnChanges() {
    this.applyInitialFontSize()
    if (!this.viewReady)
      return
    void this.syncEditorState()
  }

  ngOnDestroy() {
    this.destroyed = true
    if (this.copyTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.copyTimer)
    this.cancelDeferredHeightSync()
    this.cleanupEditor()
  }

  tooltipFor(text: string) {
    return this.resolvedShowTooltips ? text : null
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed
    this.inlinePreviewOpen = false
    if (!this.collapsed)
      queueMicrotask(() => void this.syncEditorState())
    this.cdr.markForCheck()
  }

  toggleExpanded() {
    this.expanded = !this.expanded
    queueMicrotask(() => this.applyEditorHeight())
    this.cdr.markForCheck()
  }

  changeFontSize(delta: number) {
    this.fontSize = Math.min(36, Math.max(10, this.fontSize + delta))
    this.applyEditorFontSize()
    this.applyEditorHeight()
    this.cdr.markForCheck()
  }

  resetFontSize() {
    this.fontSize = this.defaultFontSize
    this.applyEditorFontSize()
    this.applyEditorHeight()
    this.cdr.markForCheck()
  }

  async copyCode() {
    const text = this.resolvedCode
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text)
      else
        this.copyUsingTextarea(text)
    }
    catch {
      this.copyUsingTextarea(text)
    }
    this.copied = true
    this.context?.events.onCopy?.(text)
    if (this.copyTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.copyTimer)
    if (typeof window !== 'undefined') {
      this.copyTimer = window.setTimeout(() => {
        this.copied = false
        this.cdr.markForCheck()
      }, 1000)
    }
    this.cdr.markForCheck()
  }

  previewCode() {
    if (!this.isPreviewable)
      return
    const artifactType = this.canonicalLanguage === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle = this.previewTitle
    if (typeof this.context?.events.onHandleArtifactClick === 'function') {
      this.context.events.onHandleArtifactClick({
        node: this.node,
        artifactType,
        artifactTitle,
        id: `temp-${this.canonicalLanguage}-${Date.now()}`,
      })
      return
    }
    if (this.canonicalLanguage === 'html')
      this.inlinePreviewOpen = !this.inlinePreviewOpen
    this.cdr.markForCheck()
  }

  private applyInitialFontSize() {
    const initial = Number(this.resolvedMonacoOptions.fontSize)
    this.defaultFontSize = Number.isFinite(initial) && initial > 0 ? initial : 14
    if (!(typeof this.fontSize === 'number' && Number.isFinite(this.fontSize) && this.fontSize > 0))
      this.fontSize = this.defaultFontSize
    if (this.fontSize < 10 || this.fontSize > 36)
      this.fontSize = this.defaultFontSize
  }

  private async syncEditorState() {
    if (this.destroyed || !this.viewReady)
      return
    if (this.collapsed || this.showLoadingPlaceholder) {
      this.editorReady = false
      this.cdr.markForCheck()
      return
    }

    await this.ensureHelpers()
    if (this.destroyed || this.useFallback || !this.helpers) {
      this.cdr.markForCheck()
      return
    }

    if (!this.editorHost?.nativeElement) {
      this.editorReady = false
      this.cdr.markForCheck()
      return
    }

    if (this.syncPromise)
      return this.syncPromise

    this.syncPromise = (async () => {
      try {
        const desiredKind = this.isDiff && typeof this.helpers?.createDiffEditor === 'function' ? 'diff' : 'single'
        if (this.editorKind !== desiredKind) {
          await this.recreateEditor(desiredKind)
        }
        else {
          await this.updateEditor()
        }
        await Promise.resolve(this.helpers?.setTheme?.(this.resolvedIsDark ? this.resolvedDarkTheme : this.resolvedLightTheme))
        this.applyEditorFontSize()
        if (this.expanded || !this.resolvedLoading || !this.editorReady)
          this.applyEditorHeight()
        this.editorReady = true
        this.scheduleDeferredHeightSync()
      }
      catch {
        this.useFallback = true
        this.editorReady = false
        this.cleanupEditor()
      }
      finally {
        this.syncPromise = null
        this.cdr.markForCheck()
      }
    })()

    return this.syncPromise
  }

  private async ensureHelpers() {
    if (this.helpers || this.useFallback)
      return
    if (this.createPromise)
      return this.createPromise

    this.createPromise = (async () => {
      const monacoModule = await getUseMonaco()
      if (!monacoModule || typeof monacoModule.useMonaco !== 'function') {
        this.useFallback = true
        return
      }

      const options = {
        wordWrap: 'on',
        wrappingIndent: 'same',
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        revealDebounceMs: 75,
        MAX_HEIGHT: 500,
        fontSize: this.defaultFontSize,
        themes: this.resolvedThemes,
        theme: this.resolvedIsDark ? this.resolvedDarkTheme : this.resolvedLightTheme,
        ...(this.resolvedMonacoOptions || {}),
      }

      this.helpers = monacoModule.useMonaco(options)
    })()

    try {
      await this.createPromise
    }
    finally {
      this.createPromise = null
    }
  }

  private async recreateEditor(kind: 'single' | 'diff') {
    const host = this.editorHost?.nativeElement
    if (!host || !this.helpers)
      return

    this.cleanupEditor()
    host.innerHTML = ''
    this.editorKind = kind

    if (kind === 'diff') {
      await Promise.resolve(this.helpers.createDiffEditor?.(
        host,
        this.originalCode,
        this.resolvedCode,
        this.monacoLanguage,
      ))
      return
    }

    await Promise.resolve(this.helpers.createEditor?.(
      host,
      this.resolvedCode,
      this.monacoLanguage,
    ))
  }

  private async updateEditor() {
    if (!this.helpers)
      return

    if (this.isDiff && this.editorKind === 'diff' && typeof this.helpers.updateDiff === 'function') {
      await Promise.resolve(this.helpers.updateDiff(this.originalCode, this.resolvedCode, this.monacoLanguage))
      return
    }

    await Promise.resolve(this.helpers.updateCode?.(this.resolvedCode, this.monacoLanguage))
  }

  private applyEditorFontSize() {
    const view = this.editorKind === 'diff'
      ? this.helpers?.getDiffEditorView?.()
      : this.helpers?.getEditorView?.()
    try {
      view?.updateOptions?.({ fontSize: this.fontSize, automaticLayout: this.expanded })
      if (this.editorKind === 'diff' && typeof view?.getModifiedEditor === 'function')
        view.getModifiedEditor()?.updateOptions?.({ fontSize: this.fontSize })
    }
    catch {}
  }

  private applyEditorHeight() {
    const host = this.editorHost?.nativeElement
    if (!host)
      return

    const maxHeight = this.resolveMaxHeight()
    host.style.minHeight = '0px'
    host.style.maxHeight = this.expanded ? 'none' : `${maxHeight}px`
    host.style.overflow = this.expanded ? 'visible' : 'auto'

    const view = this.editorKind === 'diff'
      ? this.helpers?.getDiffEditorView?.()
      : this.helpers?.getEditorView?.()
    if (!view)
      return

    try {
      view.updateOptions?.({ automaticLayout: this.expanded })
    }
    catch {}

    const height = this.resolveEditorHeight(view, maxHeight)
    host.style.height = `${height}px`
    try {
      view.layout?.()
    }
    catch {}
  }

  private resolveEditorHeight(view: any, maxHeight: number) {
    let contentHeight = Number.NaN
    try {
      if (typeof view.getContentHeight === 'function')
        contentHeight = Number(view.getContentHeight())
      else if (this.editorKind === 'diff' && typeof view.getModifiedEditor === 'function')
        contentHeight = Number(view.getModifiedEditor()?.getContentHeight?.())
    }
    catch {}

    if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
      const lines = this.resolveEditorLineCount(view)
      const lineHeight = this.resolveEditorLineHeight()
      const estimate = lines * (lineHeight + 1.5) + 1
      return Math.ceil(Math.max(1, this.expanded ? estimate : Math.min(estimate, maxHeight)))
    }

    return Math.ceil(Math.max(1, this.expanded ? contentHeight : Math.min(contentHeight, maxHeight)))
  }

  private resolveEditorLineCount(view: any) {
    try {
      if (
        this.editorKind === 'diff'
        && typeof view?.getOriginalEditor === 'function'
        && typeof view?.getModifiedEditor === 'function'
      ) {
        const originalLines = Number(view.getOriginalEditor?.()?.getModel?.()?.getLineCount?.() ?? 1)
        const modifiedLines = Number(view.getModifiedEditor?.()?.getModel?.()?.getLineCount?.() ?? 1)
        return Math.max(1, originalLines, modifiedLines)
      }

      const lines = Number(view?.getModel?.()?.getLineCount?.() ?? 1)
      if (Number.isFinite(lines) && lines > 0)
        return lines
    }
    catch {}

    return Math.max(1, String(this.resolvedCode || '').split('\n').length)
  }

  private resolveEditorLineHeight() {
    const fromOptions = Number(this.resolvedMonacoOptions.lineHeight)
    if (Number.isFinite(fromOptions) && fromOptions > 0)
      return fromOptions

    const fromFontOption = Number(this.resolvedMonacoOptions.fontSize)
    if (Number.isFinite(fromFontOption) && fromFontOption > 0)
      return Math.max(12, Math.round(fromFontOption * 1.35))

    const fromState = Number(this.fontSize)
    if (Number.isFinite(fromState) && fromState > 0)
      return Math.max(12, Math.round(fromState * 1.35))

    return 18
  }

  private resolveMaxHeight() {
    const raw = this.resolvedMonacoOptions.MAX_HEIGHT ?? 500
    if (typeof raw === 'number' && Number.isFinite(raw))
      return raw > 0 ? raw : 500
    const matched = String(raw).match(/^(\d+(?:\.\d+)?)/)
    const parsed = matched ? Number.parseFloat(matched[1]) : 500
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500
  }

  private cancelDeferredHeightSync() {
    if (this.deferredHeightSyncRaf == null || typeof window === 'undefined')
      return
    window.cancelAnimationFrame(this.deferredHeightSyncRaf)
    this.deferredHeightSyncRaf = null
  }

  private scheduleDeferredHeightSync() {
    if (typeof window === 'undefined' || this.destroyed)
      return

    this.cancelDeferredHeightSync()
    this.deferredHeightSyncRaf = window.requestAnimationFrame(() => {
      this.deferredHeightSyncRaf = window.requestAnimationFrame(() => {
        this.deferredHeightSyncRaf = null
        this.applyEditorHeight()
      })
    })
  }

  private cleanupEditor() {
    try {
      this.helpers?.safeClean?.()
    }
    catch {}
    try {
      this.helpers?.cleanupEditor?.()
    }
    catch {}
    this.editorKind = null
  }

  private resolveCssSize(value: unknown) {
    if (value == null || value === '')
      return null
    return typeof value === 'number' ? `${value}px` : String(value)
  }

  private copyUsingTextarea(text: string) {
    if (typeof document === 'undefined')
      return
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
    }
    catch {}
    finally {
      textarea.remove()
    }
  }
}
