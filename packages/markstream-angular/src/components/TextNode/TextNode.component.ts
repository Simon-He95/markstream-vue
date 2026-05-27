import type { OnChanges } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { resolveStreamingTextState } from 'markstream-core'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-text-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="!centered; else centeredText">
      <span class="markstream-angular-text-node">
        <span *ngIf="settledText">{{ settledText }}</span>
        <span
          *ngIf="streamedDelta"
          [class]="'markstream-angular-text__stream-delta ' + streamedDeltaClass"
          (animationend)="settleStreamedDelta()"
        >{{ streamedDelta }}</span>
      </span>
    </ng-container>
    <ng-template #centeredText>
      <span class="markstream-angular-text-node markstream-angular-text--centered">
        <span *ngIf="settledText">{{ settledText }}</span>
        <span
          *ngIf="streamedDelta"
          [class]="'markstream-angular-text__stream-delta ' + streamedDeltaClass"
          (animationend)="settleStreamedDelta()"
        >{{ streamedDelta }}</span>
      </span>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() typewriter?: boolean
  @Input() fade?: boolean

  settledText = ''
  streamedDelta = ''
  private streamFadeVersion = 0
  private lastStreamRenderVersion?: number

  ngOnChanges() {
    const nextText = getString((this.node as any)?.content)
    const streamStateKey = getString(this.indexKey).trim()
    const textStreamState = this.context?.textStreamState
    const streamRenderVersion = this.context?.streamRenderVersion
    const streamRenderVersionChanged = streamRenderVersion !== this.lastStreamRenderVersion
    const rendered = `${this.settledText}${this.streamedDelta}`
    const previousPersisted = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    const previousText = previousPersisted ?? rendered

    if (!this.fadeEnabled) {
      this.settledText = nextText
      this.streamedDelta = ''
      if (streamStateKey)
        textStreamState?.set(streamStateKey, nextText)
      this.lastStreamRenderVersion = streamRenderVersion
      return
    }

    if (nextText === previousText) {
      if (this.streamedDelta && streamRenderVersionChanged) {
        this.settleStreamedDelta()
      }
      else if (rendered !== nextText) {
        this.settledText = nextText
        this.streamedDelta = ''
      }
      if (streamStateKey)
        textStreamState?.set(streamStateKey, nextText)
      this.lastStreamRenderVersion = streamRenderVersion
      return
    }

    const nextState = resolveStreamingTextState({
      nextContent: nextText,
      previousContent: previousText,
      typewriterEnabled: this.fadeEnabled,
    })

    this.settledText = nextState.settledContent
    this.streamedDelta = nextState.streamedDelta
    if (nextState.appended)
      this.streamFadeVersion += 1
    if (streamStateKey)
      textStreamState?.set(streamStateKey, nextText)
    this.lastStreamRenderVersion = streamRenderVersion
  }

  get centered() {
    return !!(this.node as any)?.center
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
    this.settledText = `${this.settledText}${this.streamedDelta}`
    this.streamedDelta = ''
  }
}
