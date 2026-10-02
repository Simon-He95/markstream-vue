import type { AngularRenderableNode } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { findFootnoteElement } from '../../utils/footnoteTarget'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-footnote-anchor-node',
  standalone: true,
  template: `
    <a
      class="footnote-anchor text-sm text-[#0366d6] hover:underline cursor-pointer"
      [attr.href]="href"
      [attr.title]="title"
      (click)="handleClick($event)"
    >
      ↩︎
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FootnoteAnchorNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get id() {
    return getString((this.node as any)?.id)
  }

  get href() {
    return `#fnref-${this.id}`
  }

  get title() {
    return `Back to reference ${this.id}`
  }

  handleClick(event: MouseEvent) {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = findFootnoteElement(event.currentTarget, `fnref-${this.id}`)
    target?.scrollIntoView({ behavior: 'smooth' })
  }
}
