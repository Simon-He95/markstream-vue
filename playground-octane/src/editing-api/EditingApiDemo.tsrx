import type { CodeBlockNodeHandle, CodeBlockOptions, CodeBlockNodeProps } from 'markstream-octane'
import { CodeBlockNode } from 'markstream-octane'
import { useCallback, useEffect, useMemo, useRef, useState } from 'octane'
import { readEditCompleteContent } from '../../../playground-shared/editCompleteContent'

const INITIAL_CODE = `export interface Answer {
  value: number
}

export const answer: Answer = {
  value: 42,
}

export function describe(value: Answer) {
  return \`answer=\${value.value}\`
}
`

const EDIT_STATE_KEY = 'octane-editing-api-draft'

type Status = {
  kind: string
  readyToEdit: boolean
  editing: boolean
  canUndo: boolean
  canRedo: boolean
  code: string
}

type LogEntry = {
  id: number
  time: string
  level: 'info' | 'error'
  text: string
}

function emptyStatus(): Status {
  return {
    kind: 'not mounted',
    readyToEdit: false,
    editing: false,
    canUndo: false,
    canRedo: false,
    code: '',
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function EditingApiDemo() {
  const block = useRef<CodeBlockNodeHandle | null>(null)
  const logIdRef = useRef(0)
  const [code, setCode] = useState(INITIAL_CODE)
  const [surfaceKey, setSurfaceKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(emptyStatus)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hookContent, setHookContent] = useState('(complete an edit session to capture onEditComplete)')

  const node = useMemo(
    () => ({
      type: 'code_block',
      language: 'typescript',
      code,
      raw: `\`\`\`typescript\n${code}\n\`\`\``,
    }) as CodeBlockNodeProps['node'],
    [code],
  )

  const appendLog = useCallback((level: LogEntry['level'], text: string) => {
    const entry: LogEntry = {
      id: ++logIdRef.current,
      time: new Date().toLocaleTimeString(),
      level,
      text,
    }
    setLogs(previous => [entry, ...previous].slice(0, 60))
  }, [])

  const codeBlockOptions = useMemo<CodeBlockOptions>(() => ({
    useTokenTransformer: true,
    onEditComplete: (event) => {
      const finalCode = readEditCompleteContent(event)
      setHookContent(finalCode)
      appendLog('info', `onEditComplete payload (${finalCode.split('\n').length} lines); returning "accept".`)
      return 'accept'
    },
  }), [appendLog])

  const refreshStatus = useCallback(() => {
    const handle = block.current
    if (!handle) {
      setStatus(emptyStatus())
      return
    }

    let kind = 'none'
    try {
      const input = handle.getSurface()?.getInput?.() as { kind?: string } | undefined
      kind = input?.kind ?? 'none'
    }
    catch {
      kind = 'unavailable'
    }

    let currentCode = ''
    try {
      currentCode = handle.getCode()
    }
    catch (error) {
      currentCode = `getCode() failed: ${errorMessage(error)}`
    }

    setStatus({
      kind,
      readyToEdit: handle.isReadyToEdit(),
      editing: handle.isEditing(),
      canUndo: handle.canUndo(),
      canRedo: handle.canRedo(),
      code: currentCode,
    })
  }, [])

  useEffect(() => {
    refreshStatus()
    const timer = window.setInterval(refreshStatus, 250)
    return () => window.clearInterval(timer)
  }, [refreshStatus, surfaceKey])

  const run = useCallback(async (label: string, action: () => void | Promise<void>) => {
    setBusy(label)
    try {
      await action()
    }
    catch (error) {
      appendLog('error', `${label} failed: ${errorMessage(error)}`)
    }
    finally {
      setBusy(null)
      refreshStatus()
    }
  }, [appendLog, refreshStatus])

  const startEditing = () => run('startEditing', async () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'startEditing failed: CodeBlockNode is not mounted')
      return
    }
    const editor = await handle.startEditing({}, EDIT_STATE_KEY)
    handle.focusEditor()
    appendLog('info', `startEditing(): editor attached (${editor.getText().split('\n').length} lines)`)
  })

  const applyEdit = () => run('applyEdits', () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'applyEdits failed: CodeBlockNode is not mounted')
      return
    }
    if (!handle.isEditing()) {
      appendLog('error', 'applyEdits needs an active session. Click "Start editing" first.')
      return
    }
    handle.applyEdits([{
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
      },
      newText: `// added ${new Date().toLocaleTimeString()} via applyEdits()\n`,
    }], true)
    appendLog('info', 'applyEdits(): inserted a comment on line 1 (undoable)')
  })

  const undo = () => run('undo', () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'undo failed: CodeBlockNode is not mounted')
      return
    }
    if (!handle.isEditing()) {
      appendLog('error', 'undo needs an active session. Click "Start editing" first.')
      return
    }
    handle.undo()
    appendLog('info', 'undo() requested')
  })

  const redo = () => run('redo', () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'redo failed: CodeBlockNode is not mounted')
      return
    }
    if (!handle.isEditing()) {
      appendLog('error', 'redo needs an active session. Click "Start editing" first.')
      return
    }
    handle.redo()
    appendLog('info', 'redo() requested')
  })

  const complete = () => run('complete', () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'stopEditing(complete) failed: CodeBlockNode is not mounted')
      return
    }
    if (!handle.isEditing()) {
      appendLog('error', 'Complete needs an active session. Click "Start editing" first.')
      return
    }
    const finalCode = handle.getCode()
    handle.stopEditing('complete')
    // Keep the accepted result across surface rebuilds and host re-renders.
    setCode(finalCode)
    appendLog('info', `stopEditing("complete"): accepted ${finalCode.split('\n').length} lines`)
  })

  const discard = () => run('discard', () => {
    const handle = block.current
    if (!handle) {
      appendLog('error', 'stopEditing(discard) failed: CodeBlockNode is not mounted')
      return
    }
    if (!handle.isEditing()) {
      appendLog('error', 'Discard needs an active session. Click "Start editing" first.')
      return
    }
    handle.stopEditing('discard')
    appendLog('info', 'stopEditing("discard"): restored the last accepted input')
  })

  const reset = () => run('reset', () => {
    const handle = block.current
    if (handle?.isEditing())
      handle.stopEditing('discard')
    setCode(INITIAL_CODE)
    setSurfaceKey(key => key + 1)
    appendLog('info', 'reset: original TypeScript restored and CodeBlockNode remounted')
  })

  const actions = [
    { label: 'Start editing', handler: startEditing, primary: true },
    { label: 'Apply edit', handler: applyEdit },
    { label: 'Undo', handler: undo },
    { label: 'Redo', handler: redo },
    { label: 'Complete', handler: complete },
    { label: 'Discard', handler: discard },
    { label: 'Reset', handler: reset },
  ]

  return (
    <main className="editing-api-demo">
      <header className="demo-header">
        <h1>CodeBlockNode editing API</h1>
        <p>
          Direct markstream-octane CodeBlockNode with a non-loading TypeScript block, real stream-diffs 0.0.5, and useTokenTransformer: true.
        </p>
      </header>

      <section className="demo-panel">
        <div className="demo-actions">
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? 'is-primary' : undefined}
              disabled={busy !== null}
              onClick={() => void action.handler()}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="demo-status" aria-live="polite">
          <div className="status-row">
            <span className="status-label">surface kind</span>
            <code data-testid="surface-kind">{status.kind}</code>
          </div>
          <div className="status-row">
            <span className="status-label">isReadyToEdit()</span>
            <code data-testid="ready-to-edit">{String(status.readyToEdit)}</code>
          </div>
          <div className="status-row">
            <span className="status-label">isEditing()</span>
            <code data-testid="is-editing">{String(status.editing)}</code>
          </div>
          <div className="status-row">
            <span className="status-label">canUndo / canRedo</span>
            <code data-testid="history">{`${status.canUndo} / ${status.canRedo}`}</code>
          </div>
          <div className="status-code">
            <span className="status-label">getCode()</span>
            <pre data-testid="code">{status.code}</pre>
          </div>
          <div className="status-code">
            <span className="status-label">onEditComplete payload</span>
            <pre data-testid="hook-code">{hookContent}</pre>
          </div>
        </div>

        <div className="demo-editor markstream-octane">
          <CodeBlockNode
            key={surfaceKey}
            ref={block}
            node={node}
            loading={false}
            isDark={false}
            codeBlockOptions={codeBlockOptions}
          />
        </div>

        <div className="demo-log">
          <div className="log-title">
            Action log
            <button type="button" className="log-clear" onClick={() => setLogs([])}>
              Clear
            </button>
          </div>
          {logs.length === 0
            ? <p className="log-empty">No actions yet. Click "Start editing", then type in the code or use Apply edit.</p>
            : (
                <ol>
                  {logs.map(entry => (
                    <li key={entry.id} className={entry.level === 'error' ? 'is-error' : undefined}>
                      <span className="log-time">{entry.time}</span>
                      {entry.text}
                    </li>
                  ))}
                </ol>
              )}
        </div>

        <p className="demo-hint">
          URL: http://localhost:4176/editing-api.html — run pnpm play:octane from the repository root.
        </p>
      </section>
    </main>
  )
}
