import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../src/index'
import { disableStreamDiffs, enableStreamDiffs, setStreamDiffsLoader } from '../src/optional-streamDiffs'

const flushAsyncRendering = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function installRuntime() {
  const createEditor = vi.fn(async () => {})
  const createDiffEditor = vi.fn(async () => {})
  const updateCode = vi.fn(async () => {})
  const updateDiff = vi.fn(async () => {})
  const cleanupEditor = vi.fn()
  const setTheme = vi.fn(async () => {})
  const updateOptions = vi.fn(async () => {})
  const forceTokenization = vi.fn()
  const setSelection = vi.fn()
  const getSelection = vi.fn(() => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }))
  const getScrollTop = vi.fn(() => 8)
  const setScrollTop = vi.fn()
  const onDidContentSizeChange = vi.fn((callback: () => void) => {
    callback()
    return { dispose: vi.fn() }
  })
  const layout = vi.fn()
  const getEditorView = vi.fn(() => ({
    getSelection,
    setSelection,
    getScrollTop,
    setScrollTop,
    getScrollLeft: vi.fn(() => 0),
    setScrollLeft: vi.fn(),
    getContentHeight: vi.fn(() => 40),
    getModel: () => ({
      forceTokenization,
      setValue: vi.fn(),
      getLineCount: () => 2,
    }),
    onDidContentSizeChange,
    onDidLayoutChange: vi.fn((callback: () => void) => {
      callback()
      return { dispose: vi.fn() }
    }),
    layout,
    updateOptions: vi.fn(),
    render: vi.fn(),
  }))
  const getDiffEditorView = vi.fn(() => ({
    getModifiedEditor: getEditorView,
    getOriginalEditor: getEditorView,
    onDidUpdateDiff: vi.fn((callback: () => void) => {
      callback()
      return { dispose: vi.fn() }
    }),
    layout,
    updateOptions: vi.fn(),
  }))
  const createCodeBlockRuntime = vi.fn(() => ({
    createEditor,
    createDiffEditor,
    updateCode,
    updateDiff,
    cleanupEditor,
    setTheme,
    updateOptions,
    getEditorView,
    getDiffEditorView,
  }))
  setStreamDiffsLoader(() => ({ createCodeBlockRuntime }))
  return {
    createEditor,
    createDiffEditor,
    updateCode,
    updateDiff,
    cleanupEditor,
    setTheme,
    updateOptions,
    createCodeBlockRuntime,
    forceTokenization,
    setSelection,
    getSelection,
    layout,
    onDidContentSizeChange,
    getEditorView,
  }
}

describe('markstream-solid code-block runtime lifecycle', () => {
  afterEach(() => {
    enableStreamDiffs()
  })

  it('reuses one editor across ordinary append and cleans it up with the owner', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('const a = 1')
      setCode = set
      return <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: code() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    const host = container.querySelector('.code-block-node__editor')
    setCode('const a = 1\nconst b = 2')
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.updateCode).toHaveBeenCalledWith('const a = 1\nconst b = 2', 'typescript')
    expect(container.querySelector('.code-block-node__editor')).toBe(host)
    dispose()
    expect(runtime.cleanupEditor).toHaveBeenCalledTimes(1)
  })

  it('updates a diff editor in place and recreates only on single/diff mode switch', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setNode!: (node: any) => void
    const App = () => {
      const [node, set] = createSignal<any>({
        type: 'code_block',
        language: 'typescript',
        diff: true,
        originalCode: 'const a = 1',
        updatedCode: 'const a = 2',
        code: 'const a = 2',
      })
      setNode = set
      return <CodeBlockNode node={node()} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).not.toHaveBeenCalled()
    setNode({
      type: 'code_block',
      language: 'typescript',
      diff: true,
      originalCode: 'const a = 1',
      updatedCode: 'const a = 3',
      code: 'const a = 3',
    })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1)
    expect(runtime.updateDiff).toHaveBeenCalledWith('const a = 1', 'const a = 3', 'typescript')
    setNode({
      type: 'code_block',
      language: 'typescript',
      diff: false,
      code: 'const a = 3',
    })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.cleanupEditor).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('keeps the runtime across finalization', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setLoading!: (value: boolean) => void
    const App = () => {
      const [loading, set] = createSignal(true)
      setLoading = set
      return <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: 'done()', loading: loading() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    setLoading(false)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.updateCode).toHaveBeenCalled()
    dispose()
  })

  it('applies live theme updates without recreating the editor', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setDark!: (value: boolean) => void
    const App = () => {
      const [isDark, setIsDark] = createSignal(false)
      setDark = setIsDark
      return (
        <CodeBlockNode
          node={{ type: 'code_block', language: 'typescript', code: 'const theme = 1' } as any}
          isDark={isDark()}
          darkTheme="vitesse-dark"
          lightTheme="vitesse-light"
        />
      )
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    setDark(true)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('recreates the runtime when line numbers change, matching Svelte', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setLineNumbers!: (value: boolean) => void
    const App = () => {
      const [showLineNumbers, setShowLineNumbers] = createSignal(true)
      setLineNumbers = setShowLineNumbers
      return (
        <CodeBlockNode
          node={{ type: 'code_block', language: 'typescript', code: 'const theme = 1' } as any}
          showLineNumbers={showLineNumbers()}
        />
      )
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    setLineNumbers(false)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createCodeBlockRuntime).toHaveBeenCalledTimes(2)
    expect(runtime.createEditor).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('forwards preview clicks to onHandleArtifactClick without opening the iframe', async () => {
    disableStreamDiffs()
    const onHandleArtifactClick = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = render(() => (
      <CodeBlockNode
        node={{ type: 'code_block', language: 'html', code: '<p>preview</p>' } as any}
        context={{ events: { onHandleArtifactClick } }}
      />
    ), container)
    const preview = container.querySelector('[data-markstream-code-preview]') as HTMLButtonElement
    expect(preview).toBeTruthy()
    expect(container.querySelector('[data-markstream-artifact-handler]')?.getAttribute('data-markstream-artifact-handler')).toBe('true')
    preview.click()
    expect(onHandleArtifactClick).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: 'text/html',
      artifactTitle: 'HTML Preview',
    }))
    expect(container.querySelector('.html-preview-frame')).toBeNull()
    dispose()
    container.remove()
    enableStreamDiffs()
  })

  it('keeps source visible in the pre fallback while the runtime loader is delayed', async () => {
    const deferred = Promise.withResolvers<any>()
    const createEditor = vi.fn()
    setStreamDiffsLoader(() => deferred.promise)
    const container = document.createElement('div')
    const dispose = render(() => (
      <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: 'await runtime()' } as any} />
    ), container)
    await flushAsyncRendering()
    expect(container.querySelector('.pre-code-node')?.textContent).toContain('await runtime()')
    expect(createEditor).not.toHaveBeenCalled()
    deferred.resolve({ createCodeBlockRuntime: () => ({ createEditor, updateCode: vi.fn() }) })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(createEditor).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('tokenizes and binds height sync through the runtime view after append', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('const a = 1')
      setCode = set
      return <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: code() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    setCode('const a = 1\nconst b = 2')
    await flushAsyncRendering()
    await vi.waitFor(() => expect(runtime.forceTokenization).toHaveBeenCalled(), { timeout: 500 })
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.onDidContentSizeChange).toHaveBeenCalled()
    dispose()
  })

  it('defers a streaming language prefix until it becomes a real language', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setNode!: (node: any) => void
    const App = () => {
      const [node, set] = createSignal<any>({
        type: 'code_block',
        language: 'typ',
        code: 'const value = 1',
        loading: true,
      })
      setNode = set
      return <CodeBlockNode node={node()} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(container.querySelector('.pre-code-node')?.textContent).toContain('const value = 1')
    setNode({
      type: 'code_block',
      language: 'typescript',
      code: 'const value = 1',
      loading: false,
    })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.createEditor).toHaveBeenCalledWith(expect.any(HTMLElement), 'const value = 1', 'typescript')
    dispose()
  })

  it('restores selection through the editor view APIs when refreshing the model', async () => {
    const runtime = installRuntime()
    const container = document.createElement('div')
    let setLoading!: (value: boolean) => void
    const App = () => {
      const [loading, set] = createSignal(true)
      setLoading = set
      return <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: 'select me', loading: loading() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    setLoading(false)
    await flushAsyncRendering()
    await vi.waitFor(() => expect(runtime.setSelection).toHaveBeenCalled(), { timeout: 800 })
    expect(runtime.getSelection).toHaveBeenCalled()
    dispose()
  })
})
