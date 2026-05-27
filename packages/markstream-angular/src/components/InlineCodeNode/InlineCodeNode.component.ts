import type { OnChanges } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { resolveStreamingTextState } from 'markstream-core'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-inline-code-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <code>
      <span *ngIf="settledCode">{{ settledCode }}</span>
      <span
        *ngIf="streamedDelta"
        [class]="'markstream-angular-text__stream-delta ' + streamedDeltaClass"
        (animationend)="settleStreamedDelta()"
      >{{ streamedDelta }}</span>
    </code>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineCodeNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() typewriter?: boolean
  @Input() fade?: boolean

  settledCode = ''
  streamedDelta = ''
  private streamFadeVersion = 0

  ngOnChanges() {
    const nextCode = getString((this.node as any)?.code)
    const streamStateKey = getString(this.indexKey).trim()
    const textStreamState = this.context?.textStreamState
    const rendered = `${this.settledCode}${this.streamedDelta}`
    const previousPersisted = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    const previousCode = previousPersisted ?? rendered

    const nextState = resolveStreamingTextState({
      nextContent: nextCode,
      previousContent: previousCode,
      typewriterEnabled: this.fadeEnabled,
    })

    this.settledCode = nextState.settledContent
    this.streamedDelta = nextState.streamedDelta
    if (nextState.appended)
      this.streamFadeVersion += 1
    if (streamStateKey)
      textStreamState?.set(streamStateKey, nextCode)
  }

  get streamedDeltaClass() {
    return this.streamFadeVersion % 2 === 0
      ? 'markstream-angular-text__stream-delta--a'
      : 'markstream-angular-text__stream-delta--b'
  }

  get fadeEnabled() {
    if (typeof this.fade === 'boolean')
      return this.fade
    if (typeof this.context?.fade === 'boolean')
      return this.context.fade
    return true
  }

  get typewriterEnabled() {
    if (typeof this.typewriter === 'boolean')
      return this.typewriter
    if (typeof this.context?.typewriter === 'boolean')
      return this.context.typewriter
    return false
  }

  settleStreamedDelta() {
    if (!this.streamedDelta)
      return
    this.settledCode = `${this.settledCode}${this.streamedDelta}`
    this.streamedDelta = ''
  }
}
