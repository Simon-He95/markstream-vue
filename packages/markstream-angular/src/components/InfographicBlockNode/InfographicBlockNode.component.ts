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
import { createPanGesture } from 'markstream-core'
import { getInfographic } from '../../optional/infographic'
import { clampPreviewHeight, estimateInfographicPreviewHeight, INFOGRAPHIC_PREVIEW_MIN_HEIGHT, parsePositiveNumber } from '../shared/diagram-height'
import { getString } from '../shared/node-helpers'
import {
  clampNumber,
  clearElement,
  copyTextToClipboard,
  downloadSvgMarkup,
  resolveCssSize,
  setElementHtml,
} from '../shared/rich-block-helpers'

@Component({
  selector: 'markstream-angular-infographic-block-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="markstream-angular-enhanced-block markstream-angular-enhanced-block--infographic"
      [attr.data-markstream-infographic]="'1'"
      [attr.data-mode]="showSource ? 'source' : 'preview'"
    >
      <div *ngIf="resolvedShowHeader" class="markstream-angular-enhanced-block__header">
        <div class="flex items-center gap-2 min-w-0">
          <span class="markstream-angular-enhanced-block__badge">Infographic</span>
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
            class="markstream-angular-enhanced-block__action"
            [attr.title]="tooltipFor(copied ? 'Copied' : 'Copy')"
            (click)="copySource()"
          >
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button
            *ngIf="resolvedShowExportButton"
            type="button"
            class="markstream-angular-enhanced-block__action"
            [disabled]="!svgMarkup"
            [attr.title]="tooltipFor('Export SVG')"
            (click)="exportSvg()"
          >
            Export
          </button>
          <button
            *ngIf="resolvedShowFullscreenButton"
            type="button"
            class="markstream-angular-enhanced-block__action"
            [disabled]="!svgMarkup"
            [attr.title]="tooltipFor('Fullscreen')"
            (click)="openModal()"
          >
            Fullscreen
          </button>
          <button
            *ngIf="resolvedShowCollapseButton"
            type="button"
            class="markstream-angular-enhanced-block__action"
            [attr.title]="tooltipFor(collapsed ? 'Expand' : 'Collapse')"
            (click)="toggleCollapsed()"
          >
            {{ collapsed ? 'Expand' : 'Collapse' }}
          </button>
          <ng-container *ngIf="resolvedShowZoomControls && modalOpen">
            <button type="button" class="markstream-angular-enhanced-block__action" [attr.title]="tooltipFor('Zoom out')" (click)="adjustZoom(-0.1)">-</button>
            <button type="button" class="markstream-angular-enhanced-block__action" [attr.title]="tooltipFor('Reset zoom')" (click)="resetZoom()">100%</button>
            <button type="button" class="markstream-angular-enhanced-block__action" [attr.title]="tooltipFor('Zoom in')" (click)="adjustZoom(0.1)">+</button>
          </ng-container>
        </div>
      </div>

      <div
        *ngIf="!collapsed"
        class="markstream-angular-enhanced-block__body"
        [style.maxHeight]="resolvedMaxHeight"
      >
        <div *ngIf="rendering && !showSource" class="mermaid-loading">
          <span class="mermaid-spinner" aria-hidden="true"></span>
          <span>Rendering infographic...</span>
        </div>

        <div
          *ngIf="!showSource"
          #previewHost
          class="infographic-render"
          [style.minHeight]="resolvedContainerMinHeight"
          [style.transform]="previewTransform"
          [style.touch-action]="panSurfaceClaimsTouch ? 'none' : null"
          [style.cursor]="isDragging ? 'grabbing' : 'grab'"
          (pointerdown)="onPanStart($event)"
        >
          <pre *ngIf="!svgMarkup && !error" class="markstream-angular-enhanced-block__source infographic-pending-source"><code translate="no">{{ code }}</code></pre>
        </div>

        <pre *ngIf="showSource" class="markstream-angular-enhanced-block__source"><code translate="no">{{ code }}</code></pre>

        <div *ngIf="error" class="d2-error">{{ error }}</div>
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
          <span class="mermaid-modal-title">Infographic Preview</span>
          <button type="button" class="mermaid-modal-close" (click)="closeModal()">Close</button>
        </div>
        <div class="mermaid-modal-body">
          <div
            class="mermaid-modal-content"
            [style.transform]="modalTransform"
            [style.touch-action]="panSurfaceClaimsTouch ? 'none' : null"
            [style.cursor]="isDragging ? 'grabbing' : 'grab'"
            (pointerdown)="onPanStart($event)"
          >
            <div #modalHost class="fullscreen"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfographicBlockNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
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
  translateX = 0
  translateY = 0
  isDragging = false
  error = ''
  containerMinHeight = ''
  svgMarkup = ''

  private viewReady = false
  private destroyed = false
  private renderToken = 0
  private renderScheduled = false
  private copyTimer: number | null = null
  private infographicInstance: any = null

  // Drag functionality. The gesture lifecycle (window listeners, pointer identity,
  // lost releases) lives in markstream-core so every package pans identically.
  private readonly panGesture = createPanGesture({
    getTranslate: () => ({ x: this.translateX, y: this.translateY }),
    setTranslate: (next) => {
      this.translateX = next.x
      this.translateY = next.y
      this.cdr.markForCheck()
    },
    canStart: (event) => {
      // Nothing to pan until the diagram exists. Without this the pending/error
      // source panel would be claimed by the gesture, and `preventDefault` would
      // take text selection away from it.
      if (!this.hasDiagramSvg())
        return false

      // Touch pans only where the surface claims the gesture. Elsewhere the page
      // keeps the swipe for scrolling, and panning along with it would shift the
      // diagram by a few pixels before the browser takes the gesture over.
      return event.pointerType !== 'touch' || this.panSurfaceClaimsTouch
    },
    onActiveChange: (active) => {
      this.isDragging = active
      this.cdr.markForCheck()
    },
  })

  get mergedProps() {
    return {
      ...(this.context?.infographicProps || {}),
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

  get resolvedShowCopyButton() {
    return this.mergedProps.showCopyButton !== false
  }

  get resolvedShowCollapseButton() {
    return this.mergedProps.showCollapseButton !== false
  }

  get resolvedShowModeToggle() {
    return this.mergedProps.showModeToggle !== false
  }

  get resolvedShowExportButton() {
    return this.mergedProps.showExportButton !== false
  }

  get resolvedShowFullscreenButton() {
    return this.mergedProps.showFullscreenButton !== false
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
      parsePositiveNumber(this.mergedProps.estimatedPreviewHeightPx) ?? estimateInfographicPreviewHeight(this.code),
      this.resolveDiagramMinHeight(),
      this.maxPreviewHeight,
    )
  }

  /**
   * Resolve the diagram preview minimum height from the density CSS token
   * (--ms-size-diagram-min-height), falling back to the built-in default.
   * Mirrors MermaidBlockNode's resolveDiagramMinHeight; SSR falls back to the
   * constant because getComputedStyle is browser-only.
   */
  private resolveDiagramMinHeight() {
    const el = this.previewHost?.nativeElement
    if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
      return INFOGRAPHIC_PREVIEW_MIN_HEIGHT
    const raw = window.getComputedStyle(el).getPropertyValue('--ms-size-diagram-min-height').trim()
    return parsePositiveNumber(raw) ?? INFOGRAPHIC_PREVIEW_MIN_HEIGHT
  }

  get resolvedContainerMinHeight() {
    return this.containerMinHeight || `${this.estimatedPreviewHeightPx}px`
  }

  private get maxPreviewHeight() {
    if (this.mergedProps.maxHeight == null || this.mergedProps.maxHeight === 'none')
      return this.mergedProps.maxHeight === 'none' ? null : 500
    return parsePositiveNumber(this.mergedProps.maxHeight) ?? 500
  }

  private resolveContainerMinHeight(actualHeight: number) {
    const boundedHeight = Math.max(actualHeight, this.estimatedPreviewHeightPx)
    const raw = this.mergedProps.maxHeight
    if (raw == null || raw === 'none')
      return `${boundedHeight}px`

    const maxHeight = this.maxPreviewHeight
    if (maxHeight == null)
      return `${boundedHeight}px`

    return `${Math.min(boundedHeight, maxHeight)}px`
  }

  get resolvedLoading() {
    if (typeof this.mergedProps.loading === 'boolean')
      return this.mergedProps.loading
    return (this.node as any)?.loading === true
  }

  get resolvedProgressiveRender() {
    return this.mergedProps.progressiveRender === true
  }

  /**
   * The diagram is scaled to fit the preview box, so at fit zoom nothing is
   * off-screen and panning only shifts it inside the box. Touch therefore keeps
   * scrolling the page at that zoom (a chat is mostly scrolling) and only claims
   * the gesture once the diagram is zoomed in and actually overflows the box.
   * The fullscreen modal always claims it: the surface fills the viewport, panning
   * is the intended gesture there, and the page behind it is locked anyway.
   */
  get panSurfaceClaimsTouch() {
    return this.modalOpen || this.zoom > 1
  }

  get previewTransform() {
    return `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoom})`
  }

  get modalTransform() {
    return `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoom})`
  }

  /**
   * Whether a pan surface holds a rendered diagram. The modal renders its own
   * copy of the SVG, so it is checked as well: the source panel may have taken
   * the inline preview's place while the modal is open.
   */
  private hasDiagramSvg() {
    return !!this.previewHost?.nativeElement?.querySelector('svg')
      || !!this.modalHost?.nativeElement?.querySelector('svg')
  }

  ngAfterViewInit() {
    this.viewReady = true
    this.scheduleInfographicRender()
  }

  ngOnChanges() {
    if (!this.viewReady)
      return
    this.containerMinHeight = ''
    this.scheduleInfographicRender()
  }

  ngOnDestroy() {
    this.destroyed = true
    this.renderToken += 1
    this.renderScheduled = false
    this.panGesture.stop()
    if (this.copyTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.copyTimer)
    this.destroyInfographic()
    if (typeof document !== 'undefined')
      document.body.style.overflow = ''
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
      this.schedulePreviewSync()
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
    downloadSvgMarkup(this.svgMarkup, `infographic-${Date.now()}.svg`)
  }

  openModal() {
    if (!this.svgMarkup)
      return
    this.modalOpen = true
    if (typeof document !== 'undefined')
      document.body.style.overflow = 'hidden'
    queueMicrotask(() => this.syncModalPreview())
    this.cdr.markForCheck()
  }

  closeModal() {
    this.modalOpen = false
    if (typeof document !== 'undefined')
      document.body.style.overflow = ''
    clearElement(this.modalHost?.nativeElement)
    this.cdr.markForCheck()
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed
    if (!this.collapsed)
      this.scheduleInfographicRender()
    this.cdr.markForCheck()
  }

  adjustZoom(delta: number) {
    this.zoom = clampNumber(Number((this.zoom + delta).toFixed(2)), 0.4, 2.5)
    this.cdr.markForCheck()
  }

  resetZoom() {
    this.zoom = 1
    this.translateX = 0
    this.translateY = 0
    this.cdr.markForCheck()
  }

  onPanStart(event: PointerEvent) {
    this.panGesture.start(event)
  }

  private scheduleInfographicRender() {
    if (this.destroyed || this.renderScheduled)
      return
    this.renderScheduled = true
    queueMicrotask(() => {
      this.renderScheduled = false
      if (!this.destroyed)
        void this.renderInfographic()
    })
  }

  private async renderInfographic() {
    if (this.destroyed || !this.viewReady || this.collapsed || this.showSource)
      return

    const source = this.code.trim()
    if (!source) {
      this.svgMarkup = ''
      clearElement(this.previewHost?.nativeElement)
      this.cdr.markForCheck()
      return
    }

    const host = this.previewHost?.nativeElement
    if (!host)
      return

    if (this.resolvedLoading && !this.resolvedProgressiveRender) {
      this.renderToken += 1
      this.rendering = true
      this.error = ''
      this.cdr.markForCheck()
      return
    }

    const final = !this.resolvedLoading
    const token = ++this.renderToken
    this.rendering = true
    this.error = ''
    this.cdr.markForCheck()
    let nextInstance: any = null
    let previousChildren: ChildNode[] | null = null

    try {
      const InfographicClass = await getInfographic()
      if (!InfographicClass)
        throw new Error('Infographic renderer is not available.')
      if (this.destroyed || token !== this.renderToken)
        return

      previousChildren = Array.from(host.childNodes)
      nextInstance = new InfographicClass({
        container: host,
        width: '100%',
        height: '100%',
      })
      let renderErrorMessage = ''
      let renderCompleted = false
      nextInstance.on?.('error', (error: unknown) => {
        const errors = Array.isArray(error) ? error : [error]
        renderErrorMessage = errors
          .map((item) => {
            if (item instanceof Error)
              return item.message
            if (typeof item === 'string')
              return item
            if (item && typeof item === 'object' && 'message' in item)
              return String((item as { message?: unknown }).message ?? '')
            return String(item ?? '')
          })
          .filter(Boolean)
          .join('; ')
      })
      nextInstance.on?.('rendered', () => {
        renderCompleted = true
      })
      nextInstance.render(source)
      if (renderErrorMessage)
        throw new Error(renderErrorMessage)
      const nextChildren = Array.from(host.childNodes)
      const replacedChildren = nextChildren.length > 0 && (
        nextChildren.length !== previousChildren.length
        || nextChildren.some((child, index) => child !== previousChildren?.[index])
      )
      if (!renderCompleted && !replacedChildren)
        throw new Error('Infographic render returned empty output.')

      if (this.destroyed || token !== this.renderToken)
        return

      this.infographicInstance?.destroy?.()
      this.infographicInstance = nextInstance
      nextInstance = null
      const svg = host.querySelector('svg')
      this.svgMarkup = svg ? svg.outerHTML : ''
      const measuredHeight = host.scrollHeight
      if (measuredHeight > 0)
        this.containerMinHeight = this.resolveContainerMinHeight(measuredHeight)
      this.syncModalPreview()
    }
    catch (error) {
      if (this.destroyed || token !== this.renderToken)
        return
      nextInstance?.destroy?.()
      nextInstance = null
      if (final && !this.resolvedLoading && source === this.code.trim()) {
        this.destroyInfographic()
        this.svgMarkup = ''
        this.showSource = true
        this.error = error instanceof Error ? error.message : 'Failed to render infographic.'
        clearElement(host)
      }
      else if (previousChildren) {
        host.replaceChildren(...previousChildren)
      }
    }
    finally {
      nextInstance?.destroy?.()
      if (token === this.renderToken) {
        this.rendering = false
        this.cdr.markForCheck()
      }
    }
  }

  private destroyInfographic() {
    try {
      this.infographicInstance?.destroy?.()
    }
    catch {
      // Best-effort cleanup.
    }
    this.infographicInstance = null
  }

  private syncModalPreview() {
    if (!this.modalOpen || !this.svgMarkup) {
      clearElement(this.modalHost?.nativeElement)
      return
    }
    setElementHtml(this.modalHost?.nativeElement, this.svgMarkup)
  }

  private schedulePreviewSync() {
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.destroyed)
          return
        setElementHtml(this.previewHost?.nativeElement, this.svgMarkup)
        this.syncModalPreview()
        this.cdr.markForCheck()
      }, 0)
      return
    }
    queueMicrotask(() => {
      setElementHtml(this.previewHost?.nativeElement, this.svgMarkup)
      this.syncModalPreview()
    })
  }
}
