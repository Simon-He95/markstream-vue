import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  Input,
  ViewChild,
} from '@angular/core'
import { toSafeMermaidSvgMarkup } from 'stream-markdown-parser'
import { getMermaid } from '../../optional/mermaid'
import { canParseOffthread, findPrefixOffthread } from '../../workers/mermaidWorkerClient'
import { clampPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../shared/diagram-height'
import { getString } from '../shared/node-helpers'
import {
  clampNumber,
  copyTextToClipboard,
  downloadSvgMarkup,
  resolveCssSize,
  setElementHtml,
} from '../shared/rich-block-helpers'

let mermaidRenderSequence = 0
let mermaidRenderQueue: Promise<void> = Promise.resolve()

type MermaidTheme = 'light' | 'dark'
type MermaidBindFunctions = (element: Element) => unknown

function enqueueMermaidRender<T>(run: () => Promise<T>) {
  const next = mermaidRenderQueue.then(run, run)
  mermaidRenderQueue = next.then(() => undefined, () => undefined)
  return next
}

@Component({
  selector: 'markstream-angular-mermaid-block-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="mermaid-block"
      [class.dark]="resolvedIsDark"
      [attr.data-markstream-mermaid]="'1'"
      [attr.data-mode]="showSource ? 'source' : 'preview'"
    >
      <div *ngIf="resolvedShowHeader" class="mermaid-header">
        <div class="flex items-center gap-2 min-w-0">
          <span class="markstream-angular-enhanced-block__badge">Mermaid</span>
          <span class="mermaid-title__text truncate">Diagram</span>
        </div>

        <div class="mermaid-actions">
          <div *ngIf="resolvedShowModeToggle" class="mermaid-toggle" role="tablist" aria-label="Mermaid mode">
            <button
              type="button"
              class="mermaid-toggle-btn"
              [class.mermaid-toggle-btn--active]="!showSource"
              [attr.aria-pressed]="!showSource"
              (click)="setMode(false)"
            >
              Preview
            </button>
            <button
              type="button"
              class="mermaid-toggle-btn"
              [class.mermaid-toggle-btn--active]="showSource"
              [attr.aria-pressed]="showSource"
              (click)="setMode(true)"
            >
              Source
            </button>
          </div>

          <button
            *ngIf="resolvedShowCopyButton"
            type="button"
            class="mermaid-btn"
            [attr.title]="tooltipFor(copied ? 'Copied' : 'Copy')"
            (click)="copySource()"
          >
            {{ copied ? 'Copied' : 'Copy' }}
          </button>

          <button
            *ngIf="resolvedShowExportButton"
            type="button"
            class="mermaid-btn"
            [disabled]="!svgMarkup"
            [attr.title]="tooltipFor('Export SVG')"
            (click)="exportSvg()"
          >
            Export
          </button>

          <button
            *ngIf="resolvedShowFullscreenButton"
            type="button"
            class="mermaid-btn"
            [disabled]="!svgMarkup"
            [attr.title]="tooltipFor('Fullscreen')"
            (click)="openModal()"
          >
            Fullscreen
          </button>

          <button
            *ngIf="resolvedShowCollapseButton"
            type="button"
            class="mermaid-btn"
            [attr.title]="tooltipFor(collapsed ? 'Expand' : 'Collapse')"
            (click)="toggleCollapsed()"
          >
            {{ collapsed ? 'Expand' : 'Collapse' }}
          </button>

          <ng-container *ngIf="resolvedShowZoomControls && !showSource && !collapsed">
            <button type="button" class="mermaid-btn" [attr.title]="tooltipFor('Zoom out')" (click)="adjustZoom(-0.1)">-</button>
            <button type="button" class="mermaid-btn" [attr.title]="tooltipFor('Reset zoom')" (click)="resetZoom()">100%</button>
            <button type="button" class="mermaid-btn" [attr.title]="tooltipFor('Zoom in')" (click)="adjustZoom(0.1)">+</button>
          </ng-container>
        </div>
      </div>

      <div *ngIf="!collapsed" class="mermaid-body">
        <div *ngIf="rendering && !showSource" class="mermaid-loading">
          <span class="mermaid-spinner" aria-hidden="true"></span>
          <span>Rendering Mermaid...</span>
        </div>

        <div
          *ngIf="!showSource"
          class="mermaid-preview"
          [style.maxHeight]="resolvedMaxHeight"
          [style.minHeight.px]="estimatedPreviewHeightPx"
          [style.height.px]="estimatedPreviewHeightPx"
          [style.transform]="previewTransform"
        >
          <div #previewHost class="markstream-angular-mermaid" [class.is-empty]="!svgMarkup"></div>
        </div>

        <pre *ngIf="showSource" class="mermaid-source"><code translate="no">{{ code }}</code></pre>

        <div *ngIf="error" class="mermaid-error">{{ error }}</div>
      </div>

      <span class="sr-only" aria-live="polite" role="status">{{ copied ? 'Copied' : '' }}</span>
    </div>

    <div
      *ngIf="modalOpen"
      class="mermaid-modal-overlay"
      role="dialog"
      aria-modal="true"
      (click)="closeModal()"
    >
      <div
        class="mermaid-modal-panel"
        [class.is-dark]="resolvedIsDark"
        (click)="$event.stopPropagation()"
      >
        <div class="mermaid-modal-header">
          <span class="mermaid-modal-title">Mermaid Preview</span>
          <button type="button" class="mermaid-modal-close" (click)="closeModal()">Close</button>
        </div>
        <div class="mermaid-modal-body">
          <div
            class="mermaid-modal-content"
            [style.transform]="modalTransform"
            (wheel)="handleModalWheel($event)"
          >
            <div #modalHost class="markstream-angular-mermaid fullscreen"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MermaidBlockNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef)

  @ViewChild('previewHost') private previewHost?: ElementRef<HTMLElement>
  @ViewChild('modalHost') private modalHost?: ElementRef<HTMLElement>

  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() props?: Record<string, any>

  rendering = false
  copied = false
  collapsed = false
  showSource = false
  modalOpen = false
  zoom = 1
  svgMarkup = ''
  error = ''

  private viewReady = false
  private destroyed = false
  private renderToken = 0
  private copyTimer: number | null = null
  private lastMermaidBindFunctions: MermaidBindFunctions | null = null

  get mergedProps() {
    return {
      ...(this.context?.mermaidProps || {}),
      ...(this.props || {}),
    }
  }

  get code() {
    return getString((this.node as any)?.code)
      .replace(/\]::([^:])/g, ']:::$1')
      .replace(/:::subgraphNode$/gm, '::subgraphNode')
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

  get resolvedShowFullscreenButton() {
    return this.mergedProps.showFullscreenButton !== false
  }

  get resolvedShowCollapseButton() {
    return this.mergedProps.showCollapseButton !== false
  }

  get resolvedShowZoomControls() {
    return this.mergedProps.showZoomControls !== false
  }

  get resolvedShowTooltips() {
    if (typeof this.mergedProps.showTooltips === 'boolean')
      return this.mergedProps.showTooltips
    return this.context?.showTooltips !== false
  }

  get resolvedMaxHeight() {
    return resolveCssSize(this.mergedProps.maxHeight, '500px')
  }

  get estimatedPreviewHeightPx() {
    return clampPreviewHeight(
      parsePositiveNumber(this.mergedProps.estimatedPreviewHeightPx) ?? estimateMermaidPreviewHeight(this.code),
      undefined,
      this.maxPreviewHeight,
    )
  }

  private get maxPreviewHeight() {
    if (this.mergedProps.maxHeight == null || this.mergedProps.maxHeight === 'none')
      return this.mergedProps.maxHeight === 'none' ? null : 500
    return parsePositiveNumber(this.mergedProps.maxHeight) ?? 500
  }

  get resolvedWorkerTimeout() {
    return clampNumber(Number(this.mergedProps.workerTimeoutMs ?? 1400), 200, 10_000)
  }

  get resolvedParseTimeout() {
    return clampNumber(Number(this.mergedProps.parseTimeoutMs ?? 1800), 200, 10_000)
  }

  get resolvedRenderTimeout() {
    return clampNumber(Number(this.mergedProps.renderTimeoutMs ?? 2500), 200, 15_000)
  }

  get resolvedFullRenderTimeout() {
    return clampNumber(Number(this.mergedProps.fullRenderTimeoutMs ?? 4000), 200, 20_000)
  }

  get strictMode() {
    return this.mergedProps.isStrict !== false
  }

  get resolvedLoading() {
    if (typeof this.mergedProps.loading === 'boolean')
      return this.mergedProps.loading
    return (this.node as any)?.loading === true
  }

  get resolvedProgressiveRender() {
    return this.mergedProps.progressiveRender === true
  }

  get previewTransform() {
    return `scale(${this.zoom})`
  }

  get modalTransform() {
    return `scale(${Math.max(1, this.zoom)})`
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

  @HostListener('window:keydown', ['$event'])
  handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.modalOpen)
      this.closeModal()
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
    downloadSvgMarkup(this.svgMarkup, `mermaid-${Date.now()}.svg`)
  }

  openModal() {
    if (!this.svgMarkup)
      return
    this.modalOpen = true
    if (typeof document !== 'undefined')
      document.body.style.overflow = 'hidden'
    queueMicrotask(() => this.syncSvgHosts())
    this.cdr.markForCheck()
  }

  closeModal() {
    this.modalOpen = false
    if (typeof document !== 'undefined')
      document.body.style.overflow = ''
    this.cdr.markForCheck()
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed
    if (!this.collapsed)
      queueMicrotask(() => void this.renderDiagram())
    this.cdr.markForCheck()
  }

  adjustZoom(delta: number) {
    this.zoom = clampNumber(Number((this.zoom + delta).toFixed(2)), 0.4, 2.5)
    this.cdr.markForCheck()
  }

  resetZoom() {
    this.zoom = 1
    this.cdr.markForCheck()
  }

  handleModalWheel(event: WheelEvent) {
    if (this.mergedProps.enableWheelZoom !== true)
      return
    event.preventDefault()
    this.adjustZoom(event.deltaY > 0 ? -0.08 : 0.08)
  }

  private async renderDiagram() {
    if (this.destroyed || !this.viewReady || this.collapsed)
      return

    const source = this.code.trim()
    if (!source) {
      this.svgMarkup = ''
      this.error = ''
      this.syncSvgHosts()
      this.cdr.markForCheck()
      return
    }

    if (this.resolvedLoading && !this.resolvedProgressiveRender) {
      this.renderToken += 1
      this.rendering = true
      this.error = ''
      this.svgMarkup = ''
      this.syncSvgHosts()
      this.cdr.markForCheck()
      return
    }

    const token = ++this.renderToken
    this.rendering = true
    this.error = ''
    this.cdr.markForCheck()

    try {
      const mermaid = await getMermaid(this.strictMode
        ? {
            startOnLoad: false,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            flowchart: { htmlLabels: false },
          }
        : {
            startOnLoad: false,
            securityLevel: 'loose',
            suppressErrorRendering: true,
          })

      if (!mermaid)
        throw new Error('Mermaid renderer is not available.')

      const theme: MermaidTheme = this.resolvedIsDark ? 'dark' : 'light'
      let renderSource = source
      if (this.resolvedLoading && this.resolvedProgressiveRender) {
        try {
          const res = await this.canParseOrPrefix(source, theme, mermaid, token)
          if (this.destroyed || token !== this.renderToken)
            return
          if (!res.fullOk && !res.prefix) {
            this.rendering = false
            this.cdr.markForCheck()
            return
          }
          if (res.prefix)
            renderSource = res.prefix
        }
        catch (error: any) {
          if (error?.name === 'AbortError')
            return
          this.rendering = false
          this.cdr.markForCheck()
          return
        }
      }

      const renderId = `markstream-angular-mermaid-${++mermaidRenderSequence}`
      const themedSource = this.applyThemeTo(renderSource, theme)
      const rendered = await enqueueMermaidRender(() => this.withTimeout(
        () => Promise.resolve(mermaid.render(renderId, themedSource)),
        this.resolvedLoading && this.resolvedProgressiveRender
          ? this.resolvedRenderTimeout
          : this.resolvedFullRenderTimeout,
      ))
      if (this.destroyed || token !== this.renderToken)
        return

      const svg = typeof rendered === 'string' ? rendered : rendered?.svg
      const safeSvg = toSafeMermaidSvgMarkup(svg)
      if (!safeSvg)
        throw new Error('Mermaid produced invalid SVG during preview')

      this.svgMarkup = safeSvg
      this.lastMermaidBindFunctions = typeof rendered === 'string' ? null : rendered?.bindFunctions ?? null
      if (!this.svgMarkup)
        this.showSource = true
      this.syncSvgHosts()
    }
    catch (error) {
      if (this.destroyed || token !== this.renderToken)
        return
      if (this.resolvedLoading && this.resolvedProgressiveRender) {
        this.svgMarkup = ''
        this.syncSvgHosts()
        return
      }
      // Allow consumer to handle the error via onRenderError callback
      const onRenderError = this.mergedProps.onRenderError
      if (typeof onRenderError === 'function' && this.previewHost?.nativeElement) {
        const handled = onRenderError(error, this.code, this.previewHost.nativeElement)
        if (handled === true) {
          this.svgMarkup = ''
          return
        }
      }
      this.svgMarkup = ''
      this.showSource = true
      this.error = error instanceof Error ? error.message : 'Failed to render Mermaid diagram.'
      this.syncSvgHosts()
    }
    finally {
      if (token === this.renderToken) {
        this.rendering = false
        this.cdr.markForCheck()
      }
    }
  }

  private syncSvgHosts() {
    setElementHtml(this.previewHost?.nativeElement, this.svgMarkup)
    if (this.modalOpen)
      setElementHtml(this.modalHost?.nativeElement, this.svgMarkup)
    else
      setElementHtml(this.modalHost?.nativeElement, '')
    this.bindMermaidInteractions(this.previewHost?.nativeElement)
    if (this.modalOpen)
      this.bindMermaidInteractions(this.modalHost?.nativeElement)
  }

  private bindMermaidInteractions(element: Element | null | undefined) {
    if (this.mergedProps.enableMermaidInteractions !== true || !this.svgMarkup || !element?.querySelector('svg'))
      return
    try {
      this.lastMermaidBindFunctions?.(element)
    }
    catch {}
  }

  private scheduleHostSync() {
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.destroyed)
          return
        this.syncSvgHosts()
        this.cdr.markForCheck()
      }, 0)
      return
    }
    queueMicrotask(() => this.syncSvgHosts())
  }

  private async canParseWithFallback(source: string, theme: MermaidTheme, mermaid: any, token: number) {
    try {
      const canParse = await canParseOffthread(source, theme, this.resolvedWorkerTimeout)
      if (this.destroyed || token !== this.renderToken)
        throw new DOMException('Aborted', 'AbortError')
      if (canParse)
        return true
    }
    catch (error: any) {
      if (error?.name === 'AbortError')
        throw error
    }

    const themedSource = this.applyThemeTo(source, theme)
    const anyMermaid = mermaid as any
    if (typeof anyMermaid.parse === 'function') {
      await this.withTimeout(() => Promise.resolve(anyMermaid.parse(themedSource)), this.resolvedParseTimeout)
      if (this.destroyed || token !== this.renderToken)
        throw new DOMException('Aborted', 'AbortError')
      return true
    }

    const renderId = `markstream-angular-mermaid-parse-${++mermaidRenderSequence}`
    await this.withTimeout(() => Promise.resolve(anyMermaid.render(renderId, themedSource)), this.resolvedParseTimeout)
    if (this.destroyed || token !== this.renderToken)
      throw new DOMException('Aborted', 'AbortError')
    return true
  }

  private async canParseOrPrefix(source: string, theme: MermaidTheme, mermaid: any, token: number) {
    if (this.getMermaidDiagramKind(source) === 'gantt') {
      const prefix = this.getSafePrefixCandidate(source)
      if (!prefix.trim())
        return { fullOk: false, prefix: '' }
      await this.canParseWithFallback(prefix, theme, mermaid, token)
      if (this.destroyed || token !== this.renderToken)
        throw new DOMException('Aborted', 'AbortError')
      return prefix === source ? { fullOk: true, prefix: '' } : { fullOk: false, prefix }
    }

    try {
      await this.canParseWithFallback(source, theme, mermaid, token)
      return { fullOk: true, prefix: '' }
    }
    catch (error: any) {
      if (error?.name === 'AbortError')
        throw error
    }

    const prefix = await this.findPrefixCandidate(source, theme, token)
    if (!prefix)
      return { fullOk: false, prefix: '' }
    await this.canParseWithFallback(prefix, theme, mermaid, token)
    if (this.destroyed || token !== this.renderToken)
      throw new DOMException('Aborted', 'AbortError')
    return { fullOk: false, prefix }
  }

  private async findPrefixCandidate(source: string, theme: MermaidTheme, token: number) {
    try {
      const prefix = await findPrefixOffthread(source, theme, this.resolvedWorkerTimeout)
      if (this.destroyed || token !== this.renderToken)
        throw new DOMException('Aborted', 'AbortError')
      if (prefix)
        return prefix
    }
    catch (error: any) {
      if (error?.name === 'AbortError')
        throw error
    }

    return this.getSafePrefixCandidate(source)
  }

  private applyThemeTo(source: string, theme: MermaidTheme) {
    const trimmed = source.trimStart()
    if (trimmed.startsWith('%%{'))
      return source
    const themeValue = theme === 'dark' ? 'dark' : 'default'
    return `%%{init: {"theme": "${themeValue}"}}%%\n${source}`
  }

  private getMermaidDiagramKind(source: string) {
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('%%'))
        continue
      const match = line.match(/^([A-Z][\w-]*)\b/i)
      return match?.[1]?.toLowerCase() || ''
    }
    return ''
  }

  private isGanttTaskLine(rawLine: string) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%'))
      return false
    if (/^(?:gantt|title|dateformat|axisformat|tickinterval|excludes|section|todaymarker|topaxis|weekday|weekend|acctitle|accdescr|accdescrmultiline)\b/i.test(line))
      return false
    return line.includes(':')
  }

  private getSafeGanttPreviewCandidate(source: string) {
    const lines = source.split(/\r?\n/)
    if (!/\r?\n$/.test(source) && lines.length > 0)
      lines.pop()
    while (lines.length > 0) {
      const last = lines[lines.length - 1]?.trim()
      if (!last || last.startsWith('%%')) {
        lines.pop()
        continue
      }
      if (this.isGanttTaskLine(last))
        break
      lines.pop()
    }
    return lines.some(line => this.isGanttTaskLine(line)) ? lines.join('\n') : ''
  }

  private getSafePrefixCandidate(source: string) {
    if (this.getMermaidDiagramKind(source) === 'gantt')
      return this.getSafeGanttPreviewCandidate(source)
    const lines = source.split('\n')
    while (lines.length > 0) {
      const lastRaw = lines[lines.length - 1]
      const last = lastRaw.trimEnd()
      if (!last) {
        lines.pop()
        continue
      }

      const looksDangling = /^[-=~>|<\s]+$/.test(last.trim())
        || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
        || /[-|><]$/.test(last)
        || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)
      if (!looksDangling)
        break

      lines.pop()
    }
    return lines.join('\n')
  }

  private withTimeout<T>(run: () => Promise<T>, timeoutMs: number) {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const timer = typeof window !== 'undefined'
        ? window.setTimeout(() => {
            if (settled)
              return
            settled = true
            reject(new Error('Operation timed out'))
          }, timeoutMs)
        : null

      run()
        .then((value) => {
          if (settled)
            return
          settled = true
          if (timer != null && typeof window !== 'undefined')
            window.clearTimeout(timer)
          resolve(value)
        })
        .catch((error) => {
          if (settled)
            return
          settled = true
          if (timer != null && typeof window !== 'undefined')
            window.clearTimeout(timer)
          reject(error)
        })
    })
  }
}
