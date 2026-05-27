import type { AngularRenderableNode } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { sanitizeImageSrc } from 'stream-markdown-parser'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-image-node',
  standalone: true,
  template: `
    @if (src) {
      <img
        class="image-node__img"
        [attr.src]="src"
        [attr.alt]="alt"
        [attr.title]="title || null"
        [attr.loading]="'lazy'"
        decoding="async"
      >
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get src() {
    return sanitizeImageSrc((this.node as any)?.src)
  }

  get alt() {
    return getString((this.node as any)?.alt)
  }

  get title() {
    return getString((this.node as any)?.title)
  }
}
