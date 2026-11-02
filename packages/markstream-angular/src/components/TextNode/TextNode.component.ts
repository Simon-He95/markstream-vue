import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import type { SmoothStreamingScope } from '../shared/smooth-streaming-scope'
import { ChangeDetectionStrategy, Component, Inject, Input, Optional, ViewChild } from '@angular/core'
import { createStreamingTextDom, createStreamingTextScope } from 'markstream-core'
import { getString } from '../shared/node-helpers'
import { MARKSTREAM_SMOOTH_STREAMING_SCOPE } from '../shared/smooth-streaming-scope'

@Component({
  selector: 'markstream-angular-text-node',
  standalone: true,
  template: `<span #host class="markstream-angular-text-node text-node" [class.markstream-angular-text--centered]="!!node.center"><span>{{ initial }}</span></span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextNodeComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() typewriter?: boolean
  @Input() fade?: boolean
  @ViewChild('host') host?: ElementRef<HTMLElement>
  initial = ''
  private initialized = false
  private binding?: ReturnType<typeof createStreamingTextDom>
  private readonly localScope = createStreamingTextScope(work => work())

  constructor(@Optional() @Inject(MARKSTREAM_SMOOTH_STREAMING_SCOPE) private readonly scope?: SmoothStreamingScope) {}

  ngOnChanges() {
    if (!this.initialized) {
      this.initial = getString(this.node.content)
      this.initialized = true
    }
    this.update()
  }

  ngAfterViewInit() {
    if (typeof window === 'undefined')
      return
    this.binding = createStreamingTextDom(this.host!.nativeElement, this.initial, this.scope?.textScope ?? this.localScope)
    this.update()
  }

  ngOnDestroy() {
    this.binding?.dispose()
  }

  private update() {
    if (!this.scope?.textScope)
      this.localScope.setFinal(this.context?.final === true)
    const content = getString(this.node.content)
    const key = this.indexKey ?? ''
    this.binding?.update(content, this.fade ?? this.context?.fade ?? true, key ? this.context?.textStreamState?.get(key) : undefined)
    if (key)
      this.context?.textStreamState?.set(key, content)
  }
}
