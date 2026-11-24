import type { OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'
import { streamContent } from '../../playground/src/const/markdown'
import { CodeBlockEditingDemoComponent } from './codeblock-editing-demo.component'
import { LineNumberHandoffCheckComponent } from './line-number-handoff-check.component'
import { TestPageComponent } from './test-page.component'
import { TestSandboxComponent } from './test-sandbox.component'
import { ThinkingNodeComponent } from './thinking-node.component'

const markdownSource = typeof streamContent === 'string' ? streamContent : String(streamContent || '')
const THINKING_TAGS = ['thinking'] as const

function normalizePath(pathname: string | null | undefined) {
  const normalized = (pathname || '/').replace(/\/+$/, '')
  return normalized || '/'
}

function clampDelay(value: number) {
  if (!Number.isFinite(value))
    return 16
  return Math.min(200, Math.max(4, Math.round(value)))
}

function clampChunk(value: number) {
  if (!Number.isFinite(value))
    return 1
  return Math.min(16, Math.max(1, Math.floor(value)))
}

function readNumericInput(event: Event, fallback: number) {
  const value = Number((event.target as HTMLInputElement | null)?.value ?? fallback)
  return Number.isFinite(value) ? value : fallback
}

@Component({
  selector: 'playground-angular-root',
  standalone: true,
  imports: [CommonModule, CodeBlockEditingDemoComponent, MarkstreamAngularComponent, LineNumberHandoffCheckComponent, TestPageComponent, TestSandboxComponent],
  template: `
    <app-codeblock-editing-demo
      *ngIf="isCodeBlockEditingDemo(); else nonEditingDemo"
      (navigateHome)="goHome()"
    />

    <ng-template #nonEditingDemo>
      <app-angular-test-sandbox *ngIf="isSandboxPage(); else nonSandbox" />

      <ng-template #nonSandbox>
        <app-line-number-handoff-check *ngIf="isLineNumberHandoffCheck(); else nonHandoff" />

        <ng-template #nonHandoff>
        <app-angular-test-page
          *ngIf="isTestPage(); else home"
          (navigateHome)="goHome()"
        />

        <ng-template #home>
          <div class="page">
          <header class="header">
            <div class="header-main">
              <div class="title">markstream-angular playground</div>
              <div class="header-actions">
                <button type="button" class="btn" (click)="goToTest()">
                  Open /test
                </button>
                <button type="button" class="btn ghost" (click)="goToCodeBlockEditing()">
                  Open /codeblock-editing
                </button>
              </div>
            </div>
            <div class="sub">
              Angular playground with streaming demo, standalone /test regression lab, isolated /test-sandbox,
              and a direct CodeBlockNode editing demo at /codeblock-editing.
            </div>
          </header>

          <div class="layout">
            <section class="panel controls">
              <h2>Stream controls</h2>

              <div class="field">
                <label for="delay">Delay (ms)</label>
                <input
                  id="delay"
                  type="number"
                  min="4"
                  max="200"
                  [value]="delay()"
                  (input)="updateDelay($event)"
                >
              </div>

              <div class="field">
                <label for="chunk">Chunk size</label>
                <input
                  id="chunk"
                  type="number"
                  min="1"
                  max="16"
                  [value]="chunkSize()"
                  (input)="updateChunkSize($event)"
                >
              </div>

              <div class="actions">
                <button type="button" class="btn" (click)="toggleStream()">
                  {{ running() ? 'Pause' : 'Resume' }}
                </button>
                <button type="button" class="btn" (click)="resetStream()">
                  Reset
                </button>
                <button type="button" class="btn ghost" (click)="fillAll()">
                  Render all
                </button>
              </div>

              <div class="status">
                <div class="progress">
                  <div class="bar" [style.width.%]="progress()"></div>
                </div>
                <div class="meta">
                  {{ content().length }} / {{ totalLength }} ({{ progress() }}%)
                </div>
              </div>

              <p class="note">
                首页保留主 demo；更完整的跨框架回归入口在 <code>/test</code>，隔离版本对照在 <code>/test-sandbox</code>。
              </p>
            </section>

            <section class="panel preview">
              <markstream-angular
                [content]="content()"
                [final]="isDone()"
                [renderCodeBlocksAsPre]="false"
                [codeBlockStream]="true"
                [customHtmlTags]="thinkingTags"
                [customComponents]="customComponents"
              />
            </section>
          </div>
        </div>
        </ng-template>
      </ng-template>
    </ng-template>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly thinkingTags = THINKING_TAGS
  readonly customComponents = {
    thinking: ThinkingNodeComponent,
  }

  readonly totalLength = markdownSource.length
  readonly currentPath = signal(typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname))
  readonly content = signal('')
  readonly delay = signal(16)
  readonly chunkSize = signal(2)
  readonly running = signal(true)
  readonly normalizedChunkSize = computed(() => clampChunk(this.chunkSize()))
  readonly progress = computed(() => {
    if (!this.totalLength)
      return 0
    return Math.min(100, Math.round((this.content().length / this.totalLength) * 100))
  })

  readonly isDone = computed(() => this.content().length >= this.totalLength)
  readonly isTestPage = computed(() => this.currentPath() === '/test')
  readonly isSandboxPage = computed(() => this.currentPath() === '/test-sandbox')
  readonly isLineNumberHandoffCheck = computed(() => this.currentPath() === '/line-number-handoff-check')
  readonly isCodeBlockEditingDemo = computed(() => this.currentPath() === '/codeblock-editing')
  readonly isStandalonePage = computed(() =>
    this.isTestPage()
    || this.isSandboxPage()
    || this.isLineNumberHandoffCheck()
    || this.isCodeBlockEditingDemo(),
  )

  private timer: number | null = null

  ngOnInit() {
    if (typeof window !== 'undefined')
      window.addEventListener('popstate', this.handlePopState)
    if (!this.isStandalonePage())
      this.startStream()
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined')
      window.removeEventListener('popstate', this.handlePopState)
    this.stopStream()
  }

  updateDelay(event: Event) {
    this.delay.set(clampDelay(readNumericInput(event, this.delay())))
    if (this.running() && !this.isStandalonePage())
      this.restartStream()
  }

  updateChunkSize(event: Event) {
    this.chunkSize.set(clampChunk(readNumericInput(event, this.chunkSize())))
  }

  goToTest() {
    this.navigate('/test')
  }

  goToCodeBlockEditing() {
    this.navigate('/codeblock-editing')
  }

  goHome() {
    this.navigate('/')
  }

  toggleStream() {
    if (this.running())
      this.stopStream()
    else
      this.startStream()
  }

  resetStream() {
    this.content.set('')
    this.startStream()
  }

  fillAll() {
    this.content.set(markdownSource)
    this.stopStream()
  }

  private readonly handlePopState = () => {
    this.syncPath()
    if (this.isStandalonePage())
      this.stopStream()
    else if (!this.content())
      this.startStream()
  }

  private syncPath() {
    if (typeof window === 'undefined')
      return
    this.currentPath.set(normalizePath(window.location.pathname))
  }

  private navigate(pathname: string) {
    const nextPath = normalizePath(pathname)
    if (typeof window !== 'undefined' && nextPath !== normalizePath(window.location.pathname))
      window.history.pushState({}, '', nextPath)

    this.currentPath.set(nextPath)

    if (this.isStandalonePage())
      this.stopStream()
    else if (!this.content() || this.content().length >= markdownSource.length)
      this.resetStream()
  }

  private tick() {
    if (this.isDone()) {
      this.stopStream()
      return
    }

    this.content.update((current) => {
      const nextChunk = markdownSource.slice(current.length, current.length + this.normalizedChunkSize())
      return current + nextChunk
    })
  }

  private startStream() {
    this.stopStream()
    if (typeof window === 'undefined')
      return
    this.running.set(true)
    this.timer = window.setInterval(() => this.tick(), this.delay())
  }

  private stopStream() {
    if (this.timer != null && typeof window !== 'undefined') {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.running.set(false)
  }

  private restartStream() {
    if (!this.running())
      return
    this.startStream()
  }
}
