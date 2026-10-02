import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
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
import { getD2 } from '../../optional/d2'
import { extractRenderedSvg, toSafeSvgMarkup } from '../../sanitizeSvg'
import { createD2RenderSalt } from '../../utils/d2RenderSalt'
import { getString } from '../shared/node-helpers'
import {
  copyTextToClipboard,
  downloadSvgMarkup,
  resolveCssSize,
  setElementHtml,
} from '../shared/rich-block-helpers'

const DARK_THEME_OVERRIDES: Record<string, string> = {
  N1: '#E5E7EB',
  N2: '#CBD5E1',
  N3: '#94A3B8',
  N4: '#64748B',
  N5: '#475569',
  N6: '#334155',
  N7: '#0B1220',
  B1: '#60A5FA',
  B2: '#3B82F6',
  B3: '#2563EB',
  B4: '#1D4ED8',
  B5: '#1E40AF',
  B6: '#111827',
  AA2: '#22D3EE',
  AA4: '#0EA5E9',
  AA5: '#0284C7',
  AB4: '#FBBF24',
  AB5: '#F59E0B',
}

@Component({
  selector: 'markstream-angular-d2-block-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="markstream-angular-enhanced-block markstream-angular-enhanced-block--d2"
      [attr.data-markstream-d2]="'1'"
      [attr.data-mode]="showSource ? 'source' : 'preview'"
    >
      <div *ngIf="resolvedShowHeader" class="markstream-angular-enhanced-block__header">
        <div class="flex items-center gap-2 min-w-0">
          <span class="markstream-angular-enhanced-block__badge">D2</span>
          <span class="mermaid-title__text truncate">Diagram</span>
        </div>

        <div class="markstream-angular-enhanced-block__actions">
          <button
            *ngIf="resolvedShowModeToggle"
            type="button"
            class="markstream-angular-enhanced-block__action mode-btn"
            [class.is-active]="!showSource"
            (click)="setMode(false)"
          >
            Preview
          </button>
          <button
            *ngIf="resolvedShowModeToggle"
            type="button"
            class="markstream-angular-enhanced-block__action mode-btn"
            [class.is-active]="showSource"
            (click)="setMode(true)"
          >
            Source
          </button>
          <button
            *ngIf="resolvedShowCopyButton"
            type="button"
            class="markstream-angular-enhanced-block__action d2-action-btn"
            [attr.title]="tooltipFor(copied ? 'Copied' : 'Copy')"
            (click)="copySource()"
          >
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button
            *ngIf="resolvedShowExportButton"
            type="button"
            class="markstream-angular-enhanced-block__action d2-action-btn"
            [disabled]="!svgMarkup"
            [attr.title]="tooltipFor('Export SVG')"
            (click)="exportSvg()"
          >
            Export
          </button>
          <button
            *ngIf="resolvedShowCollapseButton"
            type="button"
            class="markstream-angular-enhanced-block__action d2-action-btn"
            [attr.title]="tooltipFor(collapsed ? 'Expand' : 'Collapse')"
            (click)="toggleCollapsed()"
          >
            {{ collapsed ? 'Expand' : 'Collapse' }}
          </button>
        </div>
      </div>

      <div *ngIf="!collapsed" class="markstream-angular-enhanced-block__body d2-block-body" [style]="resolvedRenderStyle">
        <div *ngIf="rendering && !showSource" class="mermaid-loading">
          <span class="mermaid-spinner" aria-hidden="true"></span>
          <span>Rendering D2...</span>
        </div>

        <div *ngIf="!showSource" class="d2-render">
          <div #previewHost class="d2-svg"></div>
        </div>

        <div *ngIf="showSource" class="d2-source">
          <pre class="markstream-angular-enhanced-block__source d2-code"><code translate="no">{{ code }}</code></pre>
        </div>

        <div *ngIf="error" class="d2-error">{{ error }}</div>
      </div>

      <span class="sr-only" aria-live="polite" role="status">{{ copied ? 'Copied' : '' }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class D2BlockNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef)

  @ViewChild('previewHost') private previewHost?: ElementRef<HTMLElement>

  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() props?: Record<string, any>

  rendering = false
  copied = false
  collapsed = false
  showSource = false
  svgMarkup = ''
  error = ''

  private viewReady = false
  private destroyed = false
  private renderToken = 0
  private copyTimer: number | null = null

  get mergedProps() {
    return {
      ...(this.context?.d2Props || {}),
      ...(this.props || {}),
    }
  }

  get code() {
    return getString((this.node as any)?.code)
  }

  get resolvedIsDark() {
    if (typeof this.mergedProps.isDark === 'boolean')
      return this.mergedProps.isDark
    return this.context?.isDark === true
  }

  get resolvedShowHeader() {
    return this.mergedProps.showHeader !== false
  }

  get resolvedShowModeToggle() {
    return this.mergedProps.showModeToggle !== false
  }

  get resolvedShowCopyButton() {
    return this.mergedProps.showCopyButton !== false
  }

  get resolvedShowExportButton() {
    return this.mergedProps.showExportButton !== false
  }

  get resolvedShowCollapseButton() {
    return this.mergedProps.showCollapseButton !== false
  }

  get resolvedShowTooltips() {
    if (typeof this.mergedProps.showTooltips === 'boolean')
      return this.mergedProps.showTooltips
    return this.context?.showTooltips !== false
  }

  get resolvedRenderStyle() {
    const maxHeight = this.mergedProps.maxHeight
    if (maxHeight == null || maxHeight === '')
      return null
    const max = resolveCssSize(maxHeight)
    return `max-height: ${max}; --ms-d2-render-max-height: ${max}`
  }

  get resolvedLoading() {
    if (typeof this.mergedProps.loading === 'boolean')
      return this.mergedProps.loading
    return (this.node as any)?.loading === true
  }

  get resolvedProgressiveRender() {
    return this.mergedProps.progressiveRender === true
  }

  ngAfterViewInit() {
    this.viewReady = true
    queueMicrotask(() => void this.renderDiagram())
  }

  ngOnChanges() {
    if (!this.viewReady)
      return
    queueMicrotask(() => void this.renderDiagram())
  }

  ngOnDestroy() {
    this.destroyed = true
    this.renderToken += 1
    if (this.copyTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.copyTimer)
  }

  tooltipFor(text: string) {
    return this.resolvedShowTooltips ? text : null
  }

  setMode(nextSource: boolean) {
    this.showSource = nextSource
    if (!nextSource)
      this.scheduleHostSync()
    this.cdr.markForCheck()
  }

  async copySource() {
    await copyTextToClipboard(this.code)
    this.copied = true
    this.context?.events.onCopy?.(this.code)
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

  exportSvg() {
    if (!this.svgMarkup)
      return
    downloadSvgMarkup(this.svgMarkup, `d2-${Date.now()}.svg`)
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed
    if (!this.collapsed)
      queueMicrotask(() => void this.renderDiagram())
    this.cdr.markForCheck()
  }

  private async renderDiagram() {
    if (this.destroyed || !this.viewReady || this.collapsed)
      return

    const source = this.code.trim()
    if (!source) {
      this.svgMarkup = ''
      this.error = ''
      this.syncSvgHost()
      this.cdr.markForCheck()
      return
    }

    if (this.resolvedLoading && !this.resolvedProgressiveRender) {
      this.renderToken += 1
      this.rendering = true
      this.error = ''
      this.svgMarkup = ''
      this.syncSvgHost()
      this.cdr.markForCheck()
      return
    }

    const token = ++this.renderToken
    this.rendering = true
    this.error = ''
    this.cdr.markForCheck()

    try {
      const D2Ctor = await getD2()
      if (!D2Ctor)
        throw new Error('D2 renderer is not available.')

      const instance = createD2Instance(D2Ctor)
      if (!instance || typeof instance.compile !== 'function' || typeof instance.render !== 'function')
        throw new TypeError('D2 instance is missing compile/render methods.')

      const compileResult = await instance.compile(source)
      const diagram = compileResult?.diagram ?? compileResult
      const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
      const renderOptions: Record<string, any> = {
        ...baseRenderOptions,
        themeID: this.resolvedIsDark
          ? (this.mergedProps.darkThemeId ?? baseRenderOptions.darkThemeID ?? baseRenderOptions.themeID)
          : (this.mergedProps.themeId ?? baseRenderOptions.themeID),
        darkThemeID: null,
        darkThemeOverrides: null,
      }

      if (this.resolvedIsDark) {
        renderOptions.themeOverrides = {
          ...(baseRenderOptions.themeOverrides || {}),
          ...DARK_THEME_OVERRIDES,
        }
      }

      renderOptions.salt = renderOptions.salt ?? createD2RenderSalt()
      const renderResult = await instance.render(diagram, renderOptions)
      if (this.destroyed || token !== this.renderToken)
        return

      const safeSvg = toSafeSvgMarkup(extractRenderedSvg(renderResult), 'markstream-d2-root-svg')
      if (!safeSvg)
        throw new Error('D2 render returned empty output.')

      this.svgMarkup = safeSvg
      this.syncSvgHost()
    }
    catch (error) {
      if (this.destroyed || token !== this.renderToken)
        return
      this.svgMarkup = ''
      this.showSource = true
      this.error = error instanceof Error ? error.message : 'Failed to render D2 diagram.'
      this.syncSvgHost()
    }
    finally {
      if (token === this.renderToken) {
        this.rendering = false
        this.cdr.markForCheck()
      }
    }
  }

  private syncSvgHost() {
    setElementHtml(this.previewHost?.nativeElement, this.svgMarkup)
  }

  private scheduleHostSync() {
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.destroyed)
          return
        this.syncSvgHost()
        this.cdr.markForCheck()
      }, 0)
      return
    }
    queueMicrotask(() => this.syncSvgHost())
  }
}

function createD2Instance(D2Ctor: any) {
  if (typeof D2Ctor === 'function') {
    const instance = new D2Ctor()
    if (instance && typeof instance.compile === 'function')
      return instance
    if (typeof D2Ctor.compile === 'function')
      return D2Ctor
  }

  if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function')
    return new D2Ctor.D2()

  if (typeof D2Ctor?.compile === 'function')
    return D2Ctor

  return null
}
