/**
 * Direct `CodeBlockNode` editing demo (SolidJS).
 *
 * URL: http://localhost:4178/codeblock-editing-demo
 * Run: pnpm play:solid
 *
 * Uses the real `stream-diffs@0.0.5` runtime with `useTokenTransformer: true`
 * and an accepting `onEditComplete`. The callback ref receives the public
 * `SolidCodeBlockNodeHandle`, so every button drives the documented editing API.
 */
import type { CodeBlockOptions, SolidCodeBlockNodeHandle } from 'markstream-solid'
import { CodeBlockNode } from 'markstream-solid'
import { createSignal, For, onCleanup, Show } from 'solid-js'
import { readEditCompleteContent } from '../../playground-shared/editCompleteContent'
import '../../playground-shared/codeblock-editing-demo.css'

const INITIAL_CODE = [
  'export interface Invoice {',
  '  id: string',
  '  total: number',
  '}',
  '',
  'export function formatTotal(invoice: Invoice): string {',
  '  return new Intl.NumberFormat(\'en-US\', {',
  '    style: \'currency\',',
  '    currency: \'USD\',',
  '  }).format(invoice.total)',
  '}',
].join('\n')

const DEMO_URL = 'http://localhost:4178/codeblock-editing-demo'
const RUN_COMMAND = 'pnpm play:solid'

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
  kind: 'info' | 'error'
  text: string
}

function createNode(code: string) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading: false,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function lineCount(code: string) {
  return code.split('\n').length
}

export default function CodeBlockEditingDemo() {
  const [node, setNode] = createSignal(createNode(INITIAL_CODE))
  const [revision, setRevision] = createSignal(1)
  const [status, setStatus] = createSignal<DemoStatus>({
    surfaceKind: 'none',
    ready: false,
    editing: false,
    canUndo: false,
    canRedo: false,
    code: INITIAL_CODE,
  })
  const [entries, setEntries] = createSignal<LogEntry[]>([
    { id: 1, kind: 'info', text: 'Waiting for the CodeBlockNode surface…' },
  ])
  const [hookContent, setHookContent] = createSignal('(complete an edit session to capture onEditComplete)')

  let handle: SolidCodeBlockNodeHandle | null = null
  let logId = 1

  const codeBlockOptions: CodeBlockOptions = {
    useTokenTransformer: true,
    onEditComplete: (event) => {
      const finalCode = readEditCompleteContent(event)
      setHookContent(finalCode)
      pushLog(`onEditComplete payload (${finalCode.split('\n').length} lines); returning "accept".`)
      return 'accept'
    },
    maxHeight: 420,
  }

  function pushLog(text: string, kind: LogEntry['kind'] = 'info') {
    logId += 1
    setEntries(current => [{ id: logId, kind, text }, ...current].slice(0, 8))
  }

  function refresh() {
    const current = handle
    if (!current) {
      setStatus(previous => ({ ...previous, surfaceKind: 'none', ready: false, editing: false, canUndo: false, canRedo: false, code: node().code }))
      return
    }
    try {
      const surface = current.getSurface()
      const input = surface
        ? (surface as { getInput?: () => { kind?: string } }).getInput?.()
        : undefined
      setStatus({
        surfaceKind: surface ? String(input?.kind ?? 'attached') : 'none',
        ready: current.isReadyToEdit(),
        editing: current.isEditing(),
        canUndo: current.canUndo(),
        canRedo: current.canRedo(),
        code: current.getCode(),
      })
    }
    catch (error) {
      pushLog(`Reading editor state failed: ${errorMessage(error)}`, 'error')
    }
  }

  const timer = setInterval(refresh, 250)
  onCleanup(() => {
    clearInterval(timer)
    handle = null
  })

  async function startEditing() {
    const current = handle
    if (!current) {
      pushLog('Start editing skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    await Promise.resolve(current.startEditing({}, 'solid-playground-draft'))
    current.focusEditor()
    pushLog('startEditing() resolved. Type into the editor or press Apply edit.')
    refresh()
  }

  function applyEdit() {
    const current = handle
    if (!current) {
      pushLog('Apply edit skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    current.applyEdits([{
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      newText: '// inserted by applyEdits()\n',
    }])
    pushLog('applyEdits() inserted a comment on line 1.')
    refresh()
  }

  function undo() {
    handle?.undo()
    pushLog('undo() requested.')
    refresh()
  }

  function redo() {
    handle?.redo()
    pushLog('redo() requested.')
    refresh()
  }

  function complete() {
    const current = handle
    if (!current) {
      pushLog('Complete skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    current.stopEditing('complete')
    const code = current.getCode()
    pushLog(`stopEditing('complete') accepted the draft (${lineCount(code)} lines); getCode() reflects it.`)
    refresh()
  }

  function discard() {
    const current = handle
    if (!current) {
      pushLog('Discard skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    current.stopEditing('discard')
    pushLog('stopEditing("discard") restored the last input.')
    refresh()
  }

  function reset() {
    setNode(createNode(INITIAL_CODE))
    setRevision(value => value + 1)
    pushLog('Reset: remounted a fresh CodeBlockNode with the original TypeScript block.')
  }

  async function act(action: string, run: () => unknown | Promise<unknown>) {
    try {
      await run()
    }
    catch (error) {
      pushLog(`${action} failed: ${errorMessage(error)}`, 'error')
    }
    finally {
      refresh()
    }
  }

  return (
    <main class="cb-demo">
      <h1>CodeBlockNode editing API</h1>
      <p>
        A direct
        {' '}
        <code>CodeBlockNode</code>
        {' '}
        backed by the real
        {' '}
        <code>stream-diffs@0.0.5</code>
        {' '}
        runtime.
        Options use
        {' '}
        <code>useTokenTransformer: true</code>
        {' '}
        and an accepting
        {' '}
        <code>onEditComplete</code>
        .
        The buttons drive the public callback-ref handle, and the panel below polls the live surface.
      </p>
      <div class="cb-demo__meta">
        <p>
          URL:
          {' '}
          <code>{DEMO_URL}</code>
        </p>
        <p>
          Run:
          {' '}
          <code>{RUN_COMMAND}</code>
        </p>
      </div>

      <div class="cb-demo__layout">
        <section class="cb-demo__panel" aria-labelledby="cb-demo-editor-title">
          <h2 id="cb-demo-editor-title">TypeScript code block</h2>
          <div class="cb-demo__actions">
            <button
              type="button"
              data-primary="true"
              data-action="start"
              disabled={status().editing}
              onClick={() => void act('Start editing', startEditing)}
            >
              Start editing
            </button>
            <button type="button" data-action="apply" disabled={!status().editing} onClick={applyEdit}>
              Apply edit
            </button>
            <button type="button" data-action="undo" disabled={!status().editing || !status().canUndo} onClick={undo}>
              Undo
            </button>
            <button type="button" data-action="redo" disabled={!status().editing || !status().canRedo} onClick={redo}>
              Redo
            </button>
            <button type="button" data-action="complete" disabled={!status().editing} onClick={complete}>
              Complete
            </button>
            <button type="button" data-action="discard" disabled={!status().editing} onClick={discard}>
              Discard
            </button>
            <button type="button" data-action="reset" onClick={reset}>
              Reset
            </button>
          </div>
          <p class="cb-demo__hint">
            Start editing, then type in the code or use
            {' '}
            <strong>Apply edit</strong>
            . Complete keeps the accepted
            draft; Discard restores the last input; Reset remounts the original block.
          </p>
          <div class="cb-demo__editor" data-testid="cb-editor">
            <Show when={revision()} keyed>
              <CodeBlockNode
                node={node()}
                loading={false}
                isDark={false}
                theme="vitesse-light"
                codeBlockOptions={codeBlockOptions}
                ref={(value) => {
                  handle = value
                  if (value)
                    pushLog('CodeBlockNode callback ref received the editing handle.')
                  refresh()
                }}
              />
            </Show>
          </div>
        </section>

        <aside>
          <section class="cb-demo__panel" aria-labelledby="cb-demo-status-title">
            <h2 id="cb-demo-status-title">Live status</h2>
            <dl class="cb-demo__status" data-testid="cb-status">
              <div>
                <dt>surface kind</dt>
                <dd data-status="surface-kind">{status().surfaceKind}</dd>
              </div>
              <div>
                <dt>isReadyToEdit</dt>
                <dd data-status="ready">{String(status().ready)}</dd>
              </div>
              <div>
                <dt>isEditing</dt>
                <dd data-status="editing">{String(status().editing)}</dd>
              </div>
              <div>
                <dt>canUndo / canRedo</dt>
                <dd data-status="history">{`${status().canUndo} / ${status().canRedo}`}</dd>
              </div>
            </dl>
            <h2>getCode()</h2>
            <pre class="cb-demo__code" data-testid="cb-code">{status().code}</pre>
            <h2>onEditComplete payload</h2>
            <pre class="cb-demo__code" data-testid="cb-hook-code">{hookContent()}</pre>
          </section>

          <section class="cb-demo__panel" aria-labelledby="cb-demo-log-title" style={{ 'margin-top': '18px' }}>
            <h2 id="cb-demo-log-title">Action / error log</h2>
            <ol class="cb-demo__log" data-testid="cb-log">
              <Show when={entries().length > 0} fallback={<li class="cb-demo__empty">No actions yet.</li>}>
                <For each={entries()}>
                  {entry => <li data-kind={entry.kind}>{entry.text}</li>}
                </For>
              </Show>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  )
}
