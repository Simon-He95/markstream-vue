import type { OnDestroy } from '@angular/core'
import type { SmoothMarkdownStreamOptions, SmoothMarkdownStreamSnapshot } from 'markstream-core'
import { createSmoothMarkdownStream } from 'markstream-core'

export type { SmoothMarkdownStreamOptions }

export class SmoothMarkdownStreamService implements OnDestroy {
  private controller: ReturnType<typeof createSmoothMarkdownStream> | null = null
  private snapshot: SmoothMarkdownStreamSnapshot = {
    source: '',
    visible: '',
    done: false,
    paused: false,
    pendingChars: 0,
    caughtUp: true,
    final: false,
  }

  private readonly listeners = new Set<() => void>()
  private unsubscribeFromController?: () => void

  init(options: SmoothMarkdownStreamOptions = {}): void {
    if (this.controller)
      return
    this.controller = createSmoothMarkdownStream(options)
    this.syncSnapshot()
    this.unsubscribeFromController = this.controller.subscribe(() => this.syncSnapshot())
  }

  ngOnDestroy(): void {
    this.unsubscribeFromController?.()
    this.unsubscribeFromController = undefined
    if (this.controller) {
      this.controller.destroy()
      this.controller = null
    }
    this.listeners.clear()
  }

  /**
   * Subscribe to snapshot updates. Called when the controller's visible
   * content advances during smooth streaming. The listener is invoked
   * after each snapshot sync so that Angular components can trigger
   * rebuild / markForCheck.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get source(): string { return this.snapshot.source }
  get visible(): string { return this.snapshot.visible }
  get done(): boolean { return this.snapshot.done }
  get caughtUp(): boolean { return this.snapshot.caughtUp }
  get final(): boolean { return this.snapshot.final }
  get pendingChars(): number { return this.snapshot.pendingChars }

  enqueue(chunk: string): void { this.controller?.enqueue(chunk) }
  finish(options?: { flush?: boolean }): void { this.controller?.finish(options) }
  flush(): void { this.controller?.flush() }
  reset(initialMarkdown?: string): void { this.controller?.reset(initialMarkdown) }
  pause(): void { this.controller?.pause() }
  resume(): void { this.controller?.resume() }

  private syncSnapshot(): void {
    if (this.controller)
      this.snapshot = this.controller.getSnapshot()
    for (const listener of this.listeners)
      listener()
  }
}
