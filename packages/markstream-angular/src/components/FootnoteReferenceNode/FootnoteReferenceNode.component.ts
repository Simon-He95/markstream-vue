import type { AngularRenderableNode } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { findFootnoteElement } from '../../utils/footnoteTarget'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-footnote-reference-node',
  standalone: true,
  template: `
    <sup [attr.id]="referenceId" class="markstream-nested-footnote-ref">
      <a [attr.href]="href" (click)="handleClick($event)">[{{ id }}]</a>
    </sup>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FootnoteReferenceNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get id() {
    return getString((this.node as any)?.id)
  }

  get href() {
    return `#fnref--${this.id}`
  }

  get referenceId() {
    return `fnref-${this.id}`
  }

  handleClick(event: MouseEvent) {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = findFootnoteElement(event.currentTarget, `fnref--${this.id}`)
    target?.scrollIntoView({ behavior: 'smooth' })
  }
}
