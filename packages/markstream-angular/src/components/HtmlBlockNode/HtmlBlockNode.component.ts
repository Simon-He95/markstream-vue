import type { ElementRef } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input, ViewChild } from '@angular/core'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS } from 'stream-markdown-parser'
import { renderMarkdownNodeToHtml } from '../../renderMarkdownHtml'
import { sanitizeHtmlContent } from '../../sanitizeHtmlContent'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-html-block-node',
  standalone: true,
  template: '<div #containerRef class="html-block-node"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlBlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @ViewChild('containerRef', { static: true }) private readonly containerRef?: ElementRef<HTMLElement>

  ngAfterViewInit() {
    this.commitContent()
  }

  ngOnChanges() {
    this.commitContent()
  }

  ngOnDestroy() {
    const container = this.containerRef?.nativeElement
    if (container)
      container.innerHTML = ''
  }

  private commitContent() {
    const container = this.containerRef?.nativeElement
    if (!container)
      return

    const content = getString((this.node as any)?.content)
    const tag = getString((this.node as any)?.tag).trim().toLowerCase()
    const children = Array.isArray((this.node as any)?.children) ? (this.node as any).children : []
    if (!content) {
      container.innerHTML = ''
      return
    }

    if (this.context?.allowHtml === false || ((this.node as any)?.loading && !(this.node as any)?.autoClosed)) {
      container.textContent = content
      return
    }

    const htmlPolicy = this.context?.htmlPolicy ?? 'safe'
    if (htmlPolicy === 'escape') {
      container.textContent = content
      return
    }

    if (tag && children.length > 0 && !NON_STRUCTURING_HTML_TAGS.has(tag) && !isHtmlTagBlocked(tag, htmlPolicy)) {
      container.innerHTML = renderMarkdownNodeToHtml(this.node, {
        allowHtml: this.context?.allowHtml,
        customHtmlTags: this.context?.customHtmlTags,
        htmlPolicy,
      })
      return
    }

    container.innerHTML = sanitizeHtmlContent(content, htmlPolicy)
  }
}
