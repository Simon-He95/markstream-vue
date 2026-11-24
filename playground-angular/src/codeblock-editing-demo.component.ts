/**
 * Permanent CodeBlockNode editing demo.
 *
 * Run from the repository root:
 *   pnpm play:angular
 * or from this directory:
 *   pnpm dev
 *
 * URL: http://127.0.0.1:4175/codeblock-editing
 *
 * The page mounts a direct `<markstream-angular-code-block-node>` with a
 * non-loading TypeScript node. Every button calls the public `@ViewChild`
 * editing API exposed by `markstream-angular`. Real `stream-diffs@0.0.5`
 * powers the surface (`useTokenTransformer: true`, accepting completion).
 */
import type { AfterViewInit, OnDestroy } from '@angular/core'
import type { AngularRenderableNode, CodeBlockOptions } from 'markstream-angular'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Output,
  signal,
  ViewChild,
} from '@angular/core'
import { CodeBlockNode } from 'markstream-angular'
import { readEditCompleteContent } from '../../playground-shared/editCompleteContent'

const DEMO_CODE = [
  'export interface RetryOptions {',
  '  attempts: number',
  '  delayMs: number',
  '}',
  '',
  'export async function withRetry<T>(',
  '  task: () => Promise<T>,',
  '  options: RetryOptions = { attempts: 3, delayMs: 250 },',
  '): Promise<T> {',
  '  let lastError: unknown',
  '',
  '  for (let attempt = 1; attempt <= options.attempts; attempt++) {',
  '    try {',
  '      return await task()',
  '    }',
  '    catch (error) {',
  '      lastError = error',
  '      await new Promise(resolve => setTimeout(resolve, options.delayMs))',
  '    }',
  '  }',
  '',
  '  throw lastError',
  '}',
].join('\n')

function createDemoNode(): AngularRenderableNode {
  return {
    type: 'code_block',
    language: 'ts',
    code: DEMO_CODE,
    raw: `\`\`\`ts\n${DEMO_CODE}\n\`\`\``,
    loading: false,
  } as AngularRenderableNode
}

interface DemoStatus {
  surfaceKind: string
  ready: boolean
  editing: boolean
  canUndo: boolean
  canRedo: boolean
  code: string
}

interface LogEntry {
  id: number
  time: string
  level: 'action' | 'error'
  message: string
}

const EMPTY_STATUS: DemoStatus = {
  surfaceKind: 'not attached',
  ready: false,
  editing: false,
  canUndo: false,
  canRedo: false,
  code: '',
}

function formatError(error: unknown) {
  if (error instanceof Error)
    return error.name && error.message ? `${error.name}: ${error.message}` : error.message || error.name
  return String(error)
}

function readSurfaceKind(api: CodeBlockNode) {
  try {
    const surface = api.getSurface() as any
    if (!surface)
      return 'not attached'
    const kind = surface.getInput?.()?.kind
    return typeof kind === 'string' && kind ? kind : 'file (inferred)'
  }
  catch {
    return 'unavailable'
  }
}

@Component({
  selector: 'app-codeblock-editing-demo',
  standalone: true,
  imports: [CommonModule, CodeBlockNode],
  template: `
    <div class="cbd" data-testid="codeblock-editing-demo">
      <header class="hero">
        <div class="hero-copy">
          <span class="eyebrow">CodeBlockNode · editing API</span>
          <h1>Angular direct editing playground</h1>
          <p>
            A direct non-loading TypeScript <code>&lt;markstream-angular-code-block-node&gt;</code>.
            Each button calls the public <code>&#64;ViewChild</code> methods; the surface is the real
            <code>stream-diffs@0.0.5</code> runtime with <code>useTokenTransformer: true</code> and an
            accepting <code>onEditComplete</code>.
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="ghost" (click)="navigateHome.emit()">
            ← Playground home
          </button>
        </div>
      </header>

      <div class="grid">
        <section class="panel controls">
          <div class="panel-heading">
            <h2>Actions</h2>
            <span class="pill" [class.pill--live]="status().editing">
              {{ status().editing ? 'editing' : 'idle' }}
            </span>
          </div>

          <div class="actions">
            <button type="button" class="action action--primary" data-testid="start-editing" [disabled]="busy()" (click)="startEditingDemo()">
              Start editing
            </button>
            <button type="button" class="action" data-testid="apply-edit" [disabled]="busy() || !status().editing" (click)="applyEditDemo()">
              Apply edit
            </button>
            <button type="button" class="action" data-testid="undo" [disabled]="busy() || !status().editing" (click)="undoDemo()">
              Undo
            </button>
            <button type="button" class="action" data-testid="redo" [disabled]="busy() || !status().editing" (click)="redoDemo()">
              Redo
            </button>
            <button type="button" class="action action--accept" data-testid="complete" [disabled]="busy() || !status().editing" (click)="completeDemo()">
              Complete
            </button>
            <button type="button" class="action action--danger" data-testid="discard" [disabled]="busy() || !status().editing" (click)="discardDemo()">
              Discard
            </button>
            <button type="button" class="action" data-testid="reset" [disabled]="busy()" (click)="resetDemo()">
              Reset
            </button>
          </div>

          <section class="status" aria-live="polite">
            <h2>Live status</h2>
            <dl>
              <div>
                <dt>surface kind</dt>
                <dd data-testid="surface-kind">{{ status().surfaceKind }}</dd>
              </div>
              <div>
                <dt>isReadyToEdit</dt>
                <dd data-testid="is-ready">{{ status().ready }}</dd>
              </div>
              <div>
                <dt>isEditing</dt>
                <dd data-testid="is-editing">{{ status().editing }}</dd>
              </div>
              <div>
                <dt>canUndo / canRedo</dt>
                <dd>{{ status().canUndo }} / {{ status().canRedo }}</dd>
              </div>
            </dl>
            <div class="code-readout">
              <div class="code-readout__label">getCode()</div>
              <pre data-testid="status-code">{{ status().code || '—' }}</pre>
            </div>
            <div class="code-readout">
              <div class="code-readout__label">onEditComplete payload</div>
              <pre data-testid="hook-code">{{ hookContent() }}</pre>
            </div>
          </section>

          <section class="log">
            <div class="panel-heading">
              <h2>Action log</h2>
              <button *ngIf="logs().length" type="button" class="link" (click)="clearLog()">
                Clear
              </button>
            </div>
            <p *ngIf="!logs().length" class="muted">
              No actions yet. Start editing, then apply, undo/redo, complete, discard, or reset.
            </p>
            <ol *ngIf="logs().length">
              <li *ngFor="let entry of logs()" [class.log-entry--error]="entry.level === 'error'">
                <span class="log-time">{{ entry.time }}</span>
                <span class="log-level">{{ entry.level }}</span>
                <span class="log-message">{{ entry.message }}</span>
              </li>
            </ol>
          </section>
        </section>

        <section class="panel code-panel">
          <div class="panel-heading">
            <h2>Direct CodeBlockNode</h2>
            <span class="pill">stream-diffs 0.0.5</span>
          </div>
          <p class="muted code-panel__note">
            <code>useTokenTransformer: true</code> · <code>onEditComplete → 'accept'</code> ·
            node.loading = false
          </p>
          <div class="markstream-angular code-host">
            <markstream-angular-code-block-node
              *ngIf="showBlock()"
              #codeBlock
              [node]="node"
              [props]="props"
              [codeBlockOptions]="codeBlockOptions"
            />
          </div>
        </section>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
    }

    .cbd {
      max-width: 1280px;
      margin: 0 auto;
      padding: 28px 28px 56px;
      color: #0f172a;
    }

    .hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 22px;
    }

    .hero-copy {
      max-width: 820px;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 8px;
      color: #4f46e5;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(1.7rem, 2.6vw, 2.35rem);
      line-height: 1.12;
    }

    p {
      margin: 0;
      color: #475569;
      line-height: 1.65;
    }

    code {
      padding: 1px 5px;
      border-radius: 5px;
      background: #eef2ff;
      color: #3730a3;
      font-size: 0.88em;
    }

    .hero-actions {
      flex: 0 0 auto;
    }

    .ghost,
    .action,
    .link {
      border: 1px solid #d7dce7;
      border-radius: 9px;
      background: #fff;
      color: #1e293b;
      font: inherit;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }

    .ghost {
      padding: 8px 12px;
      font-size: 0.86rem;
    }

    .action {
      min-height: 38px;
      padding: 8px 12px;
      font-size: 0.86rem;
      font-weight: 600;
    }

    .action:hover:not(:disabled),
    .ghost:hover {
      border-color: #a5b4fc;
      background: #f8faff;
    }

    .action:active:not(:disabled) {
      transform: translateY(1px);
    }

    .action:disabled {
      opacity: 0.5;
      cursor: wait;
    }

    .action--primary {
      border-color: #4f46e5;
      background: #4f46e5;
      color: #fff;
    }

    .action--primary:hover:not(:disabled) {
      border-color: #4338ca;
      background: #4338ca;
    }

    .action--accept {
      border-color: #bbf7d0;
      background: #f0fdf4;
      color: #166534;
    }

    .action--danger {
      border-color: #fecaca;
      background: #fff1f2;
      color: #9f1239;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(300px, 410px) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .panel {
      min-width: 0;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
    }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0;
      font-size: 0.95rem;
      letter-spacing: -0.01em;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .actions .action:last-child {
      grid-column: 1 / -1;
    }

    .status,
    .log {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid #eef2f7;
    }

    dl {
      display: grid;
      gap: 7px;
      margin: 10px 0 0;
    }

    dl > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    dt {
      color: #64748b;
      font-size: 0.76rem;
    }

    dd {
      margin: 0;
      color: #0f172a;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 0.75rem;
      text-align: right;
    }

    .code-readout {
      margin-top: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #0f172a;
    }

    .code-readout__label {
      padding: 7px 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      color: #94a3b8;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 0.68rem;
    }

    .code-readout pre {
      max-height: 230px;
      margin: 0;
      padding: 10px;
      overflow: auto;
      color: #dbeafe;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 0.7rem;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.69rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .pill--live {
      background: #eef2ff;
      color: #3730a3;
    }

    .muted {
      color: #64748b;
      font-size: 0.8rem;
      line-height: 1.55;
    }

    ol {
      display: grid;
      gap: 6px;
      max-height: 210px;
      margin: 0;
      padding: 0;
      overflow: auto;
      list-style: none;
    }

    ol li {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      align-items: baseline;
      gap: 7px;
      padding: 7px 8px;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 0.73rem;
      line-height: 1.45;
    }

    .log-time {
      color: #94a3b8;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 0.66rem;
    }

    .log-level {
      padding: 1px 5px;
      border-radius: 4px;
      background: #e0e7ff;
      color: #3730a3;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .log-entry--error .log-level {
      background: #fee2e2;
      color: #991b1b;
    }

    .log-message {
      min-width: 0;
      color: #334155;
      word-break: break-word;
    }

    .link {
      padding: 0;
      border: 0;
      background: transparent;
      color: #4f46e5;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .code-panel__note {
      margin-bottom: 12px;
    }

    .code-host {
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }

    @media (max-width: 900px) {
      .cbd {
        padding: 20px 16px 40px;
      }

      .hero {
        flex-direction: column;
      }

      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `],
})
export class CodeBlockEditingDemoComponent implements AfterViewInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef)
  private statusTimer: number | null = null
  private nextLogId = 0

  @ViewChild('codeBlock') private codeBlock?: CodeBlockNode
  @Output() readonly navigateHome = new EventEmitter<void>()

  node = createDemoNode()
  readonly props: Record<string, unknown> = {
    showHeader: true,
    showLineNumbers: true,
  }

  readonly codeBlockOptions: CodeBlockOptions = {
    useTokenTransformer: true,
    // Accepting completion is the behavior this demo verifies. Return
    // 'reject' here to inspect the opt-out path instead.
    onEditComplete: (event) => {
      const finalCode = readEditCompleteContent(event)
      this.hookContent.set(finalCode)
      this.appendLog('action', `onEditComplete payload (${finalCode.split('\n').length} lines); returning "accept".`)
      return 'accept' as const
    },
  }

  readonly status = signal<DemoStatus>(EMPTY_STATUS)
  readonly hookContent = signal('(complete an edit session to capture onEditComplete)')
  readonly logs = signal<LogEntry[]>([])
  readonly busy = signal(false)
  readonly showBlock = signal(true)

  ngAfterViewInit() {
    this.refreshStatus()
    if (typeof window !== 'undefined')
      this.statusTimer = window.setInterval(() => this.refreshStatus(), 300)
  }

  ngOnDestroy() {
    if (this.statusTimer != null && typeof window !== 'undefined') {
      window.clearInterval(this.statusTimer)
      this.statusTimer = null
    }
  }

  startEditingDemo() {
    return this.run('startEditing', async () => {
      const api = this.requireApi()
      const editor = await api.startEditing({}, 'angular-codeblock-editing-demo')
      const text = editor.getText()
      this.appendLog('action', `startEditing resolved; editor holds ${text.length} characters.`)
      this.refreshStatus()
    })
  }

  applyEditDemo() {
    return this.run('applyEdits', () => {
      const api = this.requireApi()
      if (!this.ensureEditing(api, 'applyEdits'))
        return
      api.applyEdits([{
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        newText: '// inserted by playground applyEdits()\n',
      }])
      this.appendLog('action', 'applyEdits inserted a comment at line 1.')
      this.refreshStatus()
    })
  }

  undoDemo() {
    return this.run('undo', () => {
      const api = this.requireApi()
      if (!this.ensureEditing(api, 'undo'))
        return
      api.undo()
      this.appendLog('action', `undo requested; canUndo=${api.canUndo()}, canRedo=${api.canRedo()}.`)
      this.refreshStatus()
    })
  }

  redoDemo() {
    return this.run('redo', () => {
      const api = this.requireApi()
      if (!this.ensureEditing(api, 'redo'))
        return
      api.redo()
      this.appendLog('action', `redo requested; canUndo=${api.canUndo()}, canRedo=${api.canRedo()}.`)
      this.refreshStatus()
    })
  }

  completeDemo() {
    return this.run('complete', () => {
      const api = this.requireApi()
      if (!this.ensureEditing(api, 'complete'))
        return
      api.stopEditing('complete')
      this.appendLog('action', `Completed (accepting onEditComplete); getCode()=${api.getCode().length} chars.`)
      this.refreshStatus()
    })
  }

  discardDemo() {
    return this.run('discard', () => {
      const api = this.requireApi()
      if (!this.ensureEditing(api, 'discard'))
        return
      api.stopEditing('discard')
      this.appendLog('action', 'Discarded; the surface returned to the last accepted input.')
      this.refreshStatus()
    })
  }

  async resetDemo() {
    return this.run('reset', async () => {
      this.showBlock.set(false)
      this.cdr.detectChanges()
      await new Promise(resolve => setTimeout(resolve, 0))
      this.node = createDemoNode()
      this.showBlock.set(true)
      this.cdr.detectChanges()
      await new Promise(resolve => setTimeout(resolve, 0))
      this.appendLog('action', 'Reset: CodeBlockNode recreated from the original TypeScript node.')
      this.refreshStatus()
    })
  }

  clearLog() {
    this.logs.set([])
  }

  private ensureEditing(api: { isEditing: () => boolean }, action: string) {
    if (api.isEditing())
      return true
    this.appendLog('error', `${action} needs an active session. Click "Start editing" first.`)
    return false
  }

  private requireApi() {
    if (!this.codeBlock)
      throw new Error('CodeBlockNode is not mounted')
    return this.codeBlock
  }

  private async run(label: string, action: () => void | Promise<void>) {
    if (this.busy())
      return
    this.busy.set(true)
    try {
      await action()
    }
    catch (error) {
      this.appendLog('error', `${label}: ${formatError(error)}`)
      this.refreshStatus()
    }
    finally {
      this.busy.set(false)
    }
  }

  private refreshStatus() {
    const api = this.codeBlock
    if (!api) {
      this.status.set({ ...EMPTY_STATUS, surfaceKind: 'not attached' })
      return
    }

    let code = ''
    try {
      code = api.getCode()
    }
    catch {
      code = ''
    }

    this.status.set({
      surfaceKind: readSurfaceKind(api),
      ready: api.isReadyToEdit(),
      editing: api.isEditing(),
      canUndo: api.canUndo(),
      canRedo: api.canRedo(),
      code,
    })
  }

  private appendLog(level: LogEntry['level'], message: string) {
    const entry: LogEntry = {
      id: ++this.nextLogId,
      time: new Date().toLocaleTimeString([], { hour12: false }),
      level,
      message,
    }
    this.logs.update(entries => [entry, ...entries].slice(0, 8))
  }
}
