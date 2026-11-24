<script lang="ts">
  /**
   * Direct `CodeBlockNode` editing demo (Svelte 5).
   *
   * URL: http://localhost:4176/codeblock-editing-demo
   * Run: pnpm play:svelte
   *
   * Uses the real `stream-diffs@0.0.5` runtime with `useTokenTransformer: true`
   * and an accepting `onEditComplete`. `bind:this` receives the public
   * `SvelteCodeBlockNodeExposed` handle that drives the documented editing API.
   */
  import type { CodeBlockOptions, SvelteCodeBlockNodeExposed } from 'markstream-svelte'
  import { CodeBlockNode } from 'markstream-svelte'
  import { onMount } from 'svelte'
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

  const DEMO_URL = 'http://localhost:4176/codeblock-editing-demo'
  const RUN_COMMAND = 'pnpm play:svelte'

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

  let codeBlock = $state<SvelteCodeBlockNodeExposed>()
  let revision = $state(1)
  let node = $state.raw(createNode(INITIAL_CODE))
  let status = $state<DemoStatus>({
    surfaceKind: 'none',
    ready: false,
    editing: false,
    canUndo: false,
    canRedo: false,
    code: INITIAL_CODE,
  })
  let entries = $state<LogEntry[]>([
    { id: 1, kind: 'info', text: 'Waiting for the CodeBlockNode surface…' },
  ])
  let hookContent = $state('(complete an edit session to capture onEditComplete)')
  let logId = 1

  const codeBlockOptions: CodeBlockOptions = {
    useTokenTransformer: true,
    onEditComplete: (event) => {
      const finalCode = readEditCompleteContent(event)
      hookContent = finalCode
      pushLog(`onEditComplete payload (${finalCode.split('\n').length} lines); returning "accept".`)
      return 'accept'
    },
    maxHeight: 420,
  }

  function pushLog(text: string, kind: LogEntry['kind'] = 'info') {
    logId += 1
    entries = [{ id: logId, kind, text }, ...entries].slice(0, 8)
  }

  function refresh() {
    const current = codeBlock
    if (!current) {
      status = { ...status, surfaceKind: 'none', ready: false, editing: false, canUndo: false, canRedo: false, code: node.code }
      return
    }
    try {
      const surface = current.getSurface()
      const input = surface
        ? (surface as { getInput?: () => { kind?: string } }).getInput?.()
        : undefined
      status = {
        surfaceKind: surface ? String(input?.kind ?? 'attached') : 'none',
        ready: current.isReadyToEdit(),
        editing: current.isEditing(),
        canUndo: current.canUndo(),
        canRedo: current.canRedo(),
        code: current.getCode(),
      }
    }
    catch (error) {
      pushLog(`Reading editor state failed: ${errorMessage(error)}`, 'error')
    }
  }

  onMount(() => {
    const timer = setInterval(refresh, 250)
    return () => clearInterval(timer)
  })

  $effect(() => {
    void codeBlock
    refresh()
  })

  async function startEditing() {
    const current = codeBlock
    if (!current) {
      pushLog('Start editing skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    await current.startEditing({}, 'svelte-playground-draft')
    current.focusEditor()
    pushLog('startEditing() resolved. Type into the editor or press Apply edit.')
    refresh()
  }

  function applyEdit() {
    const current = codeBlock
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
    codeBlock?.undo()
    pushLog('undo() requested.')
    refresh()
  }

  function redo() {
    codeBlock?.redo()
    pushLog('redo() requested.')
    refresh()
  }

  function complete() {
    const current = codeBlock
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
    const current = codeBlock
    if (!current) {
      pushLog('Discard skipped: the CodeBlockNode handle is not mounted yet.', 'error')
      return
    }
    current.stopEditing('discard')
    pushLog('stopEditing("discard") restored the last input.')
    refresh()
  }

  function reset() {
    node = createNode(INITIAL_CODE)
    revision += 1
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
</script>

<main class="cb-demo">
  <h1>CodeBlockNode editing API</h1>
  <p>
    A direct <code>CodeBlockNode</code> backed by the real <code>stream-diffs@0.0.5</code> runtime.
    Options use <code>useTokenTransformer: true</code> and an accepting <code>onEditComplete</code>.
    The buttons drive the public <code>bind:this</code> handle, and the panel below polls the live surface.
  </p>
  <div class="cb-demo__meta">
    <p>URL: <code>{DEMO_URL}</code></p>
    <p>Run: <code>{RUN_COMMAND}</code></p>
  </div>

  <div class="cb-demo__layout">
    <section class="cb-demo__panel" aria-labelledby="cb-demo-editor-title">
      <h2 id="cb-demo-editor-title">TypeScript code block</h2>
      <div class="cb-demo__actions">
        <button
          type="button"
          data-primary="true"
          data-action="start"
          disabled={status.editing}
          onclick={() => act('Start editing', startEditing)}
        >
          Start editing
        </button>
        <button type="button" data-action="apply" disabled={!status.editing} onclick={applyEdit}>
          Apply edit
        </button>
        <button type="button" data-action="undo" disabled={!status.editing || !status.canUndo} onclick={undo}>
          Undo
        </button>
        <button type="button" data-action="redo" disabled={!status.editing || !status.canRedo} onclick={redo}>
          Redo
        </button>
        <button type="button" data-action="complete" disabled={!status.editing} onclick={complete}>
          Complete
        </button>
        <button type="button" data-action="discard" disabled={!status.editing} onclick={discard}>
          Discard
        </button>
        <button type="button" data-action="reset" onclick={reset}>
          Reset
        </button>
      </div>
      <p class="cb-demo__hint">
        Start editing, then type in the code or use <strong>Apply edit</strong>. Complete keeps the accepted
        draft; Discard restores the last input; Reset remounts the original block.
      </p>
      <div class="markstream-svelte cb-demo__editor" data-testid="cb-editor">
        {#key revision}
          <CodeBlockNode
            bind:this={codeBlock}
            {node}
            loading={false}
            isDark={false}
            theme="vitesse-light"
            {codeBlockOptions}
          />
        {/key}
      </div>
    </section>

    <aside>
      <section class="cb-demo__panel" aria-labelledby="cb-demo-status-title">
        <h2 id="cb-demo-status-title">Live status</h2>
        <dl class="cb-demo__status" data-testid="cb-status">
          <div>
            <dt>surface kind</dt>
            <dd data-status="surface-kind">{status.surfaceKind}</dd>
          </div>
          <div>
            <dt>isReadyToEdit</dt>
            <dd data-status="ready">{String(status.ready)}</dd>
          </div>
          <div>
            <dt>isEditing</dt>
            <dd data-status="editing">{String(status.editing)}</dd>
          </div>
          <div>
            <dt>canUndo / canRedo</dt>
            <dd data-status="history">{`${status.canUndo} / ${status.canRedo}`}</dd>
          </div>
        </dl>
        <h2>getCode()</h2>
        <pre class="cb-demo__code" data-testid="cb-code">{status.code}</pre>
        <h2>onEditComplete payload</h2>
        <pre class="cb-demo__code" data-testid="cb-hook-code">{hookContent}</pre>
      </section>

      <section class="cb-demo__panel" aria-labelledby="cb-demo-log-title" style="margin-top: 18px">
        <h2 id="cb-demo-log-title">Action / error log</h2>
        <ol class="cb-demo__log" data-testid="cb-log">
          {#if entries.length > 0}
            {#each entries as entry (entry.id)}
              <li data-kind={entry.kind}>{entry.text}</li>
            {/each}
          {:else}
            <li class="cb-demo__empty">No actions yet.</li>
          {/if}
        </ol>
      </section>
    </aside>
  </div>
</main>
