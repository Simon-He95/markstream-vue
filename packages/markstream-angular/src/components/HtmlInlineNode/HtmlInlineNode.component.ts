import type { ElementRef } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input, ViewChild } from '@angular/core'
import { sanitizeHtmlContent } from '../../sanitizeHtmlContent'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-html-inline-node',
  standalone: true,
  template: '<span #containerRef class="html-inline-node"></span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlInlineNodeComponent {
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
    if (!content) {
      container.innerHTML = ''
      return
    }

    const htmlPolicy = this.context?.htmlPolicy ?? 'safe'
    if (this.context?.allowHtml === false || htmlPolicy === 'escape' || ((this.node as any)?.loading && !(this.node as any)?.autoClosed)) {
      container.textContent = content
      return
    }

    container.innerHTML = sanitizeHtmlContent(content, htmlPolicy)
  }
}
