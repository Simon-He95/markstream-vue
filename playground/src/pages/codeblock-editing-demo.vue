<script setup lang="ts">
import type { DiffSurfaceController } from 'stream-diffs'
import { createDiffSurface } from 'stream-diffs'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { readEditCompleteContent } from '../../../playground-shared/editCompleteContent'

type Surface = DiffSurfaceController

const fileHost = ref<HTMLElement>()
const diffHost = ref<HTMLElement>()
const fileStatus = ref('')
const diffStatus = ref('')
const fileAction = ref('')
const diffAction = ref('')
const fileHookContent = ref('(complete an edit session to capture onEditComplete)')
const diffHookContent = ref('(complete an edit session to capture onEditComplete)')

let fileSurface: Surface | undefined
let diffSurface: Surface | undefined

const fileCode = [
  'export interface Answer {',
  '  value: number',
  '}',
  '',
  'export const answer: Answer = { value: 42 }',
].join('\n')

const oldCode = `${fileCode}\n`
const newCode = `${fileCode.replace('42', '43')}\n`

function readNativeCode(surface: Surface) {
  const native = surface.getNativeInstance() as any
  return native?.file?.contents
    ?? native?.fileDiff?.additionLines?.join('')
    ?? ''
}

function renderStatus(surface: Surface) {
  const status = {
    kind: surface.getInput().kind,
    ready: surface.isReadyToEdit(),
    editing: surface.isEditing(),
    code: surface.getEditingText() ?? readNativeCode(surface),
  }
  return JSON.stringify(status, null, 2)
}

function syncStatus(surface: Surface, target: typeof fileStatus) {
  target.value = renderStatus(surface)
}

async function setupSurface(kind: 'file' | 'diff') {
  const host = kind === 'file' ? fileHost.value : diffHost.value
  if (!host)
    return
  const previous = kind === 'file' ? fileSurface : diffSurface
  previous?.dispose()
  const surface = kind === 'file'
    ? createDiffSurface({
        kind: 'file',
        file: { name: 'answer.ts', contents: `${fileCode}\n`, lang: 'typescript' },
        options: {
          theme: 'pierre-dark',
          useTokenTransformer: true,
          onEditComplete: (event) => {
            fileHookContent.value = readEditCompleteContent(event)
            return 'accept'
          },
        },
      })
    : createDiffSurface({
        kind: 'diff',
        oldFile: { name: 'answer.ts', contents: oldCode, lang: 'typescript' },
        newFile: { name: 'answer.ts', contents: newCode, lang: 'typescript' },
        options: {
          theme: 'pierre-dark',
          useTokenTransformer: true,
          onEditComplete: (event) => {
            diffHookContent.value = readEditCompleteContent(event)
            return 'accept'
          },
        },
      })
  await surface.mount(host)
  if (kind === 'file')
    fileSurface = surface
  else
    diffSurface = surface
  syncStatus(surface, kind === 'file' ? fileStatus : diffStatus)
}

async function start(kind: 'file' | 'diff') {
  const surface = kind === 'file' ? fileSurface : diffSurface
  if (!surface)
    return
  const target = kind === 'file' ? fileAction : diffAction
  try {
    await surface.startEditing({}, `${kind}-playground-draft`)
    target.value = 'Edit session started. Click into the code and type.'
  }
  catch (error) {
    target.value = `startEditing failed: ${String(error)}`
  }
  syncStatus(surface, kind === 'file' ? fileStatus : diffStatus)
}

function applyEdit(kind: 'file' | 'diff') {
  const surface = kind === 'file' ? fileSurface : diffSurface
  if (!surface)
    return
  const target = kind === 'file' ? fileAction : diffAction
  try {
    surface.applyEdits([{
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      newText: '// added from applyEdits()\n',
    }])
    target.value = 'Applied one programmatic edit.'
  }
  catch (error) {
    target.value = `applyEdits failed: ${String(error)}`
  }
  syncStatus(surface, kind === 'file' ? fileStatus : diffStatus)
}

function history(kind: 'file' | 'diff', action: 'undo' | 'redo') {
  const surface = kind === 'file' ? fileSurface : diffSurface
  if (!surface)
    return
  const target = kind === 'file' ? fileAction : diffAction
  surface[action]()
  target.value = action === 'undo' ? 'Undo requested.' : 'Redo requested.'
  syncStatus(surface, kind === 'file' ? fileStatus : diffStatus)
}

function finish(kind: 'file' | 'diff', reason: 'complete' | 'discard') {
  const surface = kind === 'file' ? fileSurface : diffSurface
  if (!surface)
    return
  const target = kind === 'file' ? fileAction : diffAction
  surface.stopEditing(reason)
  target.value = reason === 'complete'
    ? `Completed. Final code:\n${readNativeCode(surface)}`
    : 'Discarded; native surface restored to the last input.'
  syncStatus(surface, kind === 'file' ? fileStatus : diffStatus)
}

async function reset(kind: 'file' | 'diff') {
  const target = kind === 'file' ? fileAction : diffAction
  target.value = 'Recreating surface…'
  await setupSurface(kind)
  target.value = 'Surface recreated from the original input.'
}

onMounted(async () => {
  await Promise.all([setupSurface('file'), setupSurface('diff')])
})

onBeforeUnmount(() => {
  fileSurface?.dispose()
  diffSurface?.dispose()
  fileSurface = undefined
  diffSurface = undefined
})
</script>

<template>
  <main class="editing-demo">
    <header>
      <h1>stream-diffs editing API</h1>
      <p>
        Direct, framework-free <code>createDiffSurface()</code> demos. This is the lowest-level API:
        each surface mounts into a normal DOM node, enters edit mode, and exposes the final content.
        See <code>docs/api.md</code> in the stream-diffs repository.
      </p>
    </header>

    <section class="panel">
      <h2>File surface</h2>
      <div class="actions">
        <button type="button" @click="start('file')">
          Start editing
        </button>
        <button type="button" @click="applyEdit('file')">
          Apply edit
        </button>
        <button type="button" @click="history('file', 'undo')">
          Undo
        </button>
        <button type="button" @click="history('file', 'redo')">
          Redo
        </button>
        <button type="button" @click="finish('file', 'complete')">
          Complete
        </button>
        <button type="button" @click="finish('file', 'discard')">
          Discard
        </button>
        <button type="button" @click="reset('file')">
          Reset
        </button>
      </div>
      <p class="note">
        {{ fileAction }}
      </p>
      <div ref="fileHost" class="surface" />
      <pre class="status">{{ fileStatus }}</pre>
      <h3>onEditComplete payload</h3>
      <pre class="status" data-testid="file-hook-content">{{ fileHookContent }}</pre>
    </section>

    <section class="panel">
      <h2>Diff surface</h2>
      <div class="actions">
        <button type="button" @click="start('diff')">
          Start editing
        </button>
        <button type="button" @click="applyEdit('diff')">
          Apply edit
        </button>
        <button type="button" @click="history('diff', 'undo')">
          Undo
        </button>
        <button type="button" @click="history('diff', 'redo')">
          Redo
        </button>
        <button type="button" @click="finish('diff', 'complete')">
          Complete
        </button>
        <button type="button" @click="finish('diff', 'discard')">
          Discard
        </button>
        <button type="button" @click="reset('diff')">
          Reset
        </button>
      </div>
      <p class="note">
        {{ diffAction }}
      </p>
      <div ref="diffHost" class="surface" />
      <pre class="status">{{ diffStatus }}</pre>
      <h3>onEditComplete payload</h3>
      <pre class="status" data-testid="diff-hook-content">{{ diffHookContent }}</pre>
    </section>
  </main>
</template>

<style scoped>
.editing-demo {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  color: #e2e8f0;
  background: #0b1220;
  min-height: 100vh;
  font-family: system-ui, sans-serif;
}

h1,
h2 {
  margin: 0 0 8px;
}

header p {
  color: #94a3b8;
  line-height: 1.5;
}

.panel {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid #1e293b;
  border-radius: 12px;
  background: #111827;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}

button {
  padding: 6px 10px;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #e2e8f0;
  background: #1e293b;
  cursor: pointer;
}

button:hover {
  background: #334155;
}

.surface {
  border: 1px solid #1e293b;
  border-radius: 8px;
  overflow: auto;
}

.status,
.note {
  white-space: pre-wrap;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
}

.note {
  min-height: 1.5em;
  color: #cbd5e1;
}
</style>
