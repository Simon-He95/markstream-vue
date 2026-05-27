import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  Input,
  ViewChild,
} from '@angular/core'
import { isUnsafeHtmlUrl, shouldOpenLinkInNewTab } from 'stream-markdown-parser'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import { getNodeList, getString } from '../shared/node-helpers'
import { TextNodeComponent } from '../TextNode/TextNode.component'

@Component({
  selector: 'markstream-angular-link-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent), forwardRef(() => TextNodeComponent)],
  template: `
    <a
      *ngIf="!loading; else loadingTpl"
      #anchorEl
      class="link-node"
      [attr.href]="href || null"
      [attr.title]="resolvedShowTooltip ? '' : title"
      [attr.aria-label]="'Link: ' + title"
      [attr.target]="openInNewTab ? '_blank' : null"
      [attr.rel]="openInNewTab ? 'noopener noreferrer' : null"
      [ngStyle]="cssVars"
      (mouseenter)="onAnchorEnter()"
      (mouseleave)="onAnchorLeave()"
    >
      <markstream-angular-nested-renderer
        *ngIf="hasChildren; else fallbackText"
        [nodes]="children"
        [context]="context"
        [indexPrefix]="nestedPrefix"
      />
      <ng-template #fallbackText>
        <markstream-angular-text-node
          [node]="{ type: 'text', content: fallbackLabel }"
          [context]="context"
          [indexKey]="nestedPrefix + '-fallback'"
        />
      </ng-template>
    </a>

    <ng-template #loadingTpl>
      <span class="link-loading" [ngStyle]="cssVars" aria-hidden="false">
        <span class="link-text-wrapper">
          <span class="link-text">
            <markstream-angular-text-node
              [node]="{ type: 'text', content: fallbackLabel }"
              [context]="context"
              [indexKey]="nestedPrefix + '-loading'"
            />
          </span>
          <span class="link-loading-indicator" aria-hidden="true"></span>
        </span>
      </span>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('anchorEl') private anchorRef?: ElementRef<HTMLElement>

  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  private hovering = false

  get href() {
    const href = getString((this.node as any)?.href)
    return href && !isUnsafeHtmlUrl(href) ? href : ''
  }

  get title() {
    const rawTitle = getString((this.node as any)?.title)
    return rawTitle || this.href
  }

  get openInNewTab() {
    return shouldOpenLinkInNewTab(this.href)
  }

  get loading() {
    return (this.node as any)?.loading === true
  }

  get resolvedShowTooltip() {
    return this.context?.showTooltips !== false
  }

  get children() {
    return getNodeList((this.node as any)?.children)
  }

  get hasChildren() {
    return this.children.length > 0
  }

  get fallbackLabel() {
    return getString((this.node as any)?.text || this.href)
  }

  get nestedPrefix() {
    return `${this.indexKey || 'link'}-inline`
  }

  get cssVars() {
    return {
      '--link-color': '#0366d6',
      '--underline-height': '2px',
      '--underline-bottom': '-3px',
      '--underline-opacity': '0.35',
      '--underline-rest-opacity': '0.175',
      '--underline-duration': '1.6s',
      '--underline-timing': 'ease-in-out',
      '--underline-iteration': 'infinite',
    } as Record<string, string>
  }

  ngAfterViewInit() {
    this.syncTooltip()
  }

  ngOnChanges() {
    this.syncTooltip()
  }

  ngOnDestroy() {
    if (this.hovering)
      hideTooltip(true)
  }

  onAnchorEnter() {
    if (!this.resolvedShowTooltip)
      return

    this.hovering = true
    showTooltipForAnchor(this.anchorRef?.nativeElement || null, this.title, 'top', false, this.context?.isDark)
  }

  onAnchorLeave() {
    if (!this.resolvedShowTooltip)
      return

    this.hovering = false
    hideTooltip()
  }

  private syncTooltip() {
    if (!this.hovering || !this.resolvedShowTooltip)
      return

    showTooltipForAnchor(this.anchorRef?.nativeElement || null, this.title, 'top', true, this.context?.isDark)
  }
}
