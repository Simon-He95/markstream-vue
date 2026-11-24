<script lang="ts">
/**
 * Permanent CodeBlockNode editing demo for markstream-vue2.
 *
 * Run from the repository root:
 *   pnpm play:vue2
 * or from this directory:
 *   pnpm dev
 *
 * URL: http://localhost:3334/codeblock-editing
 *
 * The page mounts a direct `<CodeBlockNode>` with a non-loading TypeScript
 * node. Every button reaches the public `$refs` editing API through a
 * `CodeBlockNodeExposed` cast. Real `stream-diffs@0.0.5` powers the surface
 * (`useTokenTransformer: true`, accepting completion).
 */
import type { CodeBlockNodeExposed } from 'markstream-vue2'
import { CodeBlockNode } from 'markstream-vue2'
import { readEditCompleteContent } from '../../../playground-shared/editCompleteContent'

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

function createDemoNode() {
  return {
    type: 'code_block',
    language: 'ts',
    code: DEMO_CODE,
    raw: `\`\`\`ts\n${DEMO_CODE}\n\`\`\``,
    loading: false,
  }
}

function formatError(error) {
  if (error instanceof Error)
    return error.name && error.message ? `${error.name}: ${error.message}` : error.message || error.name
  return String(error)
}

function readSurfaceKind(api) {
  try {
    const surface = api.getSurface()
    if (!surface)
      return 'not attached'
    const kind = surface.getInput?.()?.kind
    return typeof kind === 'string' && kind ? kind : 'file (inferred)'
  }
  catch {
    return 'unavailable'
  }
}

export default {
  name: 'CodeBlockEditingDemo',
  components: {
    CodeBlockNode,
  },
  emits: ['navigateHome'],
  data() {
    return {
      node: createDemoNode(),
      codeBlockOptions: {
        useTokenTransformer: true,
        // Accepting completion is the behavior this demo verifies. Return
        // 'reject' here to inspect the opt-out path instead.
        onEditComplete: (event) => {
          const finalCode = readEditCompleteContent(event)
          this.hookContent = finalCode
          this.appendLog('action', `onEditComplete payload (${finalCode.split('\n').length} lines); returning "accept".`)
          return 'accept'
        },
      },
      hookContent: '(complete an edit session to capture onEditComplete)',
      status: {
        surfaceKind: 'not attached',
        ready: false,
        editing: false,
        canUndo: false,
        canRedo: false,
        code: '',
      },
      logs: [],
      busy: false,
      blockVisible: true,
      blockKey: 0,
      statusTimer: null,
      nextLogId: 0,
    }
  },
  mounted() {
    this.refreshStatus()
    this.statusTimer = window.setInterval(() => this.refreshStatus(), 300)
  },
  beforeUnmount() {
    if (this.statusTimer != null) {
      window.clearInterval(this.statusTimer)
      this.statusTimer = null
    }
  },
  methods: {
    getApi() {
      const api = this.$refs.codeBlock as unknown as CodeBlockNodeExposed | undefined
      if (!api)
        throw new Error('CodeBlockNode is not mounted')
      return api
    },
    async startEditingDemo() {
      return this.run('startEditing', async () => {
        const api = this.getApi()
        const editor = await api.startEditing({}, 'vue2-codeblock-editing-demo')
        const text = editor.getText()
        this.appendLog('action', `startEditing resolved; editor holds ${text.length} characters.`)
        this.refreshStatus()
      })
    },
    applyEditDemo() {
      return this.run('applyEdits', () => {
        const api = this.getApi()
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
    },
    undoDemo() {
      return this.run('undo', () => {
        const api = this.getApi()
        if (!this.ensureEditing(api, 'undo'))
          return
        api.undo()
        this.appendLog('action', `undo requested; canUndo=${api.canUndo()}, canRedo=${api.canRedo()}.`)
        this.refreshStatus()
      })
    },
    redoDemo() {
      return this.run('redo', () => {
        const api = this.getApi()
        if (!this.ensureEditing(api, 'redo'))
          return
        api.redo()
        this.appendLog('action', `redo requested; canUndo=${api.canUndo()}, canRedo=${api.canRedo()}.`)
        this.refreshStatus()
      })
    },
    completeDemo() {
      return this.run('complete', () => {
        const api = this.getApi()
        if (!this.ensureEditing(api, 'complete'))
          return
        api.stopEditing('complete')
        this.appendLog('action', `Completed (accepting onEditComplete); getCode()=${api.getCode().length} chars.`)
        this.refreshStatus()
      })
    },
    discardDemo() {
      return this.run('discard', () => {
        const api = this.getApi()
        if (!this.ensureEditing(api, 'discard'))
          return
        api.stopEditing('discard')
        this.appendLog('action', 'Discarded; the surface returned to the last accepted input.')
        this.refreshStatus()
      })
    },
    async resetDemo() {
      return this.run('reset', async () => {
        this.blockVisible = false
        await this.$nextTick()
        this.blockKey += 1
        this.node = createDemoNode()
        this.blockVisible = true
        await this.$nextTick()
        this.appendLog('action', 'Reset: CodeBlockNode recreated from the original TypeScript node.')
        this.refreshStatus()
      })
    },
    ensureEditing(api, action) {
      if (api.isEditing())
        return true
      this.appendLog('error', `${action} needs an active session. Click "Start editing" first.`)
      return false
    },
    clearLog() {
      this.logs = []
    },
    async run(label, action) {
      if (this.busy)
        return
      this.busy = true
      try {
        await action()
      }
      catch (error) {
        this.appendLog('error', `${label}: ${formatError(error)}`)
        this.refreshStatus()
      }
      finally {
        this.busy = false
      }
    },
    refreshStatus() {
      const api = this.$refs.codeBlock
      if (!api) {
        this.status = {
          surfaceKind: 'not attached',
          ready: false,
          editing: false,
          canUndo: false,
          canRedo: false,
          code: '',
        }
        return
      }

      let code = ''
      try {
        code = api.getCode()
      }
      catch {
        code = ''
      }

      this.status = {
        surfaceKind: readSurfaceKind(api),
        ready: api.isReadyToEdit(),
        editing: api.isEditing(),
        canUndo: api.canUndo(),
        canRedo: api.canRedo(),
        code,
      }
    },
    appendLog(level, message) {
      const entry = {
        id: ++this.nextLogId,
        time: new Date().toLocaleTimeString([], { hour12: false }),
        level,
        message,
      }
      this.logs = [entry, ...this.logs].slice(0, 8)
    },
  },
}
</script>

<template>
  <div class="cbd" data-testid="codeblock-editing-demo">
    <header class="hero">
      <div class="hero-copy">
        <span class="eyebrow">CodeBlockNode · editing API</span>
        <h1>Vue 2 direct editing playground</h1>
        <p>
          A direct non-loading TypeScript <code>&lt;CodeBlockNode&gt;</code>.
          Each button reaches the public <code>$refs</code> editing API through a
          <code>CodeBlockNodeExposed</code> cast; the surface is the real
          <code>stream-diffs@0.0.5</code> runtime with <code>useTokenTransformer: true</code>
          and an accepting <code>onEditComplete</code>.
        </p>
      </div>
      <div class="hero-actions">
        <button type="button" class="ghost" @click="$emit('navigateHome')">
          ← Playground home
        </button>
      </div>
    </header>

    <div class="grid">
      <section class="panel controls">
        <div class="panel-heading">
          <h2>Actions</h2>
          <span class="pill" :class="{ 'pill--live': status.editing }">
            {{ status.editing ? 'editing' : 'idle' }}
          </span>
        </div>

        <div class="actions">
          <button type="button" class="action action--primary" data-testid="start-editing" :disabled="busy" @click="startEditingDemo">
            Start editing
          </button>
          <button type="button" class="action" data-testid="apply-edit" :disabled="busy || !status.editing" @click="applyEditDemo">
            Apply edit
          </button>
          <button type="button" class="action" data-testid="undo" :disabled="busy || !status.editing" @click="undoDemo">
            Undo
          </button>
          <button type="button" class="action" data-testid="redo" :disabled="busy || !status.editing" @click="redoDemo">
            Redo
          </button>
          <button type="button" class="action action--accept" data-testid="complete" :disabled="busy || !status.editing" @click="completeDemo">
            Complete
          </button>
          <button type="button" class="action action--danger" data-testid="discard" :disabled="busy || !status.editing" @click="discardDemo">
            Discard
          </button>
          <button type="button" class="action" data-testid="reset" :disabled="busy" @click="resetDemo">
            Reset
          </button>
        </div>

        <section class="status" aria-live="polite">
          <h2>Live status</h2>
          <dl>
            <div>
              <dt>surface kind</dt>
              <dd data-testid="surface-kind">
                {{ status.surfaceKind }}
              </dd>
            </div>
            <div>
              <dt>isReadyToEdit</dt>
              <dd data-testid="is-ready">
                {{ status.ready }}
              </dd>
            </div>
            <div>
              <dt>isEditing</dt>
              <dd data-testid="is-editing">
                {{ status.editing }}
              </dd>
            </div>
            <div>
              <dt>canUndo / canRedo</dt>
              <dd>{{ status.canUndo }} / {{ status.canRedo }}</dd>
            </div>
          </dl>
          <div class="code-readout">
            <div class="code-readout__label">
              getCode()
            </div>
            <pre data-testid="status-code">{{ status.code || '—' }}</pre>
          </div>
          <div class="code-readout">
            <div class="code-readout__label">
              onEditComplete payload
            </div>
            <pre data-testid="hook-code">{{ hookContent }}</pre>
          </div>
        </section>

        <section class="log">
          <div class="panel-heading">
            <h2>Action log</h2>
            <button v-if="logs.length" type="button" class="link" @click="clearLog">
              Clear
            </button>
          </div>
          <p v-if="!logs.length" class="muted">
            No actions yet. Start editing, then apply, undo/redo, complete, discard, or reset.
          </p>
          <ol v-if="logs.length">
            <li v-for="entry in logs" :key="entry.id" :class="{ 'log-entry--error': entry.level === 'error' }">
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
          loading = false
        </p>
        <div class="markstream-vue2 code-host">
          <CodeBlockNode
            v-if="blockVisible"
            :key="blockKey"
            ref="codeBlock"
            :node="node"
            :loading="false"
            :code-block-options="codeBlockOptions"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
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
</style>
