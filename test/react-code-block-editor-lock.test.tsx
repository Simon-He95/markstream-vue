import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeBlockNode } from '../packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode'

interface StreamMonacoHelpers {
  useMonaco: ReturnType<typeof vi.fn>
  createEditor: ReturnType<typeof vi.fn>
  createDiffEditor: ReturnType<typeof vi.fn>
  updateCode: ReturnType<typeof vi.fn>
  updateDiff: ReturnType<typeof vi.fn>
  getEditor: ReturnType<typeof vi.fn>
  getEditorView: ReturnType<typeof vi.fn>
  getDiffEditorView: ReturnType<typeof vi.fn>
  cleanupEditor: ReturnType<typeof vi.fn>
  safeClean: ReturnType<typeof vi.fn>
  refreshDiffPresentation: ReturnType<typeof vi.fn>
  setTheme: ReturnType<typeof vi.fn>
}

function getStreamMonacoHelpers(): StreamMonacoHelpers {
  return (globalThis as any).__streamMonacoHelpers
}

function resetStreamMonacoHelpers() {
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })

  helpers.useMonaco.mockReset().mockImplementation(() => helpers)
  helpers.createEditor.mockReset().mockImplementation(async () => {})
  helpers.createDiffEditor.mockReset().mockImplementation(async () => {})
  helpers.updateCode.mockReset()
  helpers.updateDiff.mockReset()
  helpers.getEditor.mockReset().mockImplementation(() => null)
  helpers.getEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.cleanupEditor.mockReset().mockImplementation(() => {})
  helpers.safeClean.mockReset().mockImplementation(() => {})
  helpers.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  helpers.setTheme.mockReset().mockImplementation(async () => {})
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
}

async function waitForCallCount(fn: ReturnType<typeof vi.fn>, expected: number, timeout = 1000) {
  const start = Date.now()
  while (fn.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for mock call')
    await flushReact()
  }
}

async function waitForEditorVisible(getEditorHost: () => HTMLElement | null, timeout = 1000) {
  const start = Date.now()
  while (getEditorHost()?.style.visibility !== 'visible') {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for the editor handoff')
    await flushReact()
  }
}

function setElementRect(element: Element, rect: { top: number, bottom: number, height: number, width?: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: rect.top,
      top: rect.top,
      bottom: rect.bottom,
      left: 0,
      right: rect.width ?? 1000,
      width: rect.width ?? 1000,
      height: rect.height,
      toJSON: () => ({}),
    }) as DOMRect,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react codeBlockNode theme updates', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('updates single-editor themes without recreating the editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const baseProps = {
      node: {
        type: 'code_block',
        language: 'json',
        code: '{"hello":"world"}',
        raw: '```json\n{"hello":"world"}\n```',
      },
      loading: false,
      showHeader: false,
      isDark: false,
      darkTheme: 'vitesse-dark',
      lightTheme: 'vitesse-light',
    }

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, baseProps))
    })
    await waitForCallCount(helpers.createEditor, 1)
    await flushReact()

    helpers.createEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.setTheme.mockClear()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        ...baseProps,
        isDark: true,
      }))
    })
    await flushReact()

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')

    await act(async () => {
      root.unmount()
    })
  })

  it('updates diff themes without recreating the diff editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const baseProps = {
      node: {
        type: 'code_block',
        language: 'diff',
        code: '@@ -1 +1 @@',
        diff: true,
        originalCode: 'const a = 1\nconst b = 2\n',
        updatedCode: 'const a = 1\nconst c = 3\n',
        raw: '```diff\n-const b = 2\n+const c = 3\n```',
      },
      loading: false,
      showHeader: false,
      isDark: false,
      darkTheme: 'vitesse-dark',
      lightTheme: 'vitesse-light',
    }

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, baseProps))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)
    await flushReact()

    helpers.createDiffEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.setTheme.mockClear()

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        ...baseProps,
        isDark: true,
      }))
    })
    await flushReact()

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(helpers.refreshDiffPresentation).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('applies Vue-parity diff defaults when monacoOptions are omitted', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\nconst b = 2\n',
          updatedCode: 'const a = 1\nconst c = 3\n',
          raw: '```diff\n-const b = 2\n+const c = 3\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      }))
    })
    await waitForCallCount(helpers.useMonaco, 1)

    const options = helpers.useMonaco.mock.calls[0]?.[0] as Record<string, any> | undefined

    expect(options?.diffLineStyle).toBe('background')
    expect(options?.diffUnchangedRegionStyle).toBe('line-info')
    expect(options?.diffAppearance).toBe('light')
    expect(options?.diffHideUnchangedRegions).toEqual({
      enabled: true,
      contextLineCount: 2,
      minimumLineCount: 4,
      revealLineCount: 5,
    })
    expect(options?.fontSize).toBe(12)
    expect(options?.lineHeight).toBe(18)
    expect(options?.padding).toEqual({ top: 0, bottom: 0 })

    await act(async () => {
      root.unmount()
    })
  })

  it('resyncs diff height after a diff update settles', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let editorHost: HTMLElement | null = null
    let updateDiffListener: (() => void) | null = null

    const diffView = {
      getContentHeight: vi.fn(() => 300),
      updateOptions: vi.fn(),
      layout: vi.fn(),
      onDidUpdateDiff: vi.fn((callback: () => void) => {
        updateDiffListener = callback
        return { dispose: vi.fn() }
      }),
      getOriginalEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      })),
      getModifiedEditor: vi.fn(() => ({
        onDidContentSizeChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() })),
      })),
    }
    helpers.getDiffEditorView.mockReturnValue(diffView)
    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      editorHost = el
      setElementRect(el, { top: 0, bottom: 500, height: 500 })
      const shell = document.createElement('div')
      shell.className = 'stream-diffs-shell'
      setElementRect(shell, { top: 0, bottom: 300, height: 300 })
      el.appendChild(shell)
    })

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
      }))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)
    await waitForEditorVisible(() => editorHost)

    // Content height (300) is below the max (500); the host should reflect it.
    await act(async () => {
      updateDiffListener?.()
      await Promise.resolve()
    })
    await flushReact()

    const syncedHeight = Number.parseInt(editorHost?.style.height || '0', 10)
    expect(syncedHeight).toBeGreaterThanOrEqual(286)
    expect(syncedHeight).toBeLessThan(500)

    await act(async () => {
      root.unmount()
    })
  })

  it('renders a two-pane diff fallback with stream-diffs-aligned metrics before the diff editor is ready', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let resolveCreateDiffEditor: (() => void) | undefined

    helpers.createDiffEditor.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCreateDiffEditor = resolve
    }))

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
      }))
    })
    await waitForCallCount(helpers.createDiffEditor, 1)

    const fallback = host.querySelector('pre.code-fallback-plain.markstream-pre--diff-preview') as HTMLElement | null
    expect(fallback).not.toBeNull()
    expect(fallback?.dataset.language).toBe('json')
    expect(fallback?.style.fontSize).toBe('12px')
    expect(fallback?.style.lineHeight).toBe('18px')
    expect(fallback?.style.paddingTop).toBe('0px')
    expect(fallback?.style.paddingBottom).toBe('0px')
    expect(fallback?.style.tabSize).toBe('4')

    const panes = host.querySelectorAll('.markstream-pre__diff-pane')
    expect(panes).toHaveLength(2)
    expect(host.querySelector('.markstream-pre__diff-pane--original')?.textContent).toContain('"version": "0.0.49"')
    expect(host.querySelector('.markstream-pre__diff-pane--modified')?.textContent).toContain('"version": "0.0.54-beta.1"')
    expect(host.querySelector('.markstream-pre__diff-pane--original .markstream-pre__diff-line--removed')?.textContent).toContain('"version": "0.0.49"')
    expect(host.querySelector('.markstream-pre__diff-pane--modified .markstream-pre__diff-line--added')?.textContent).toContain('"version": "0.0.54-beta.1"')

    await act(async () => {
      resolveCreateDiffEditor?.()
    })
    await flushReact()

    await act(async () => {
      root.unmount()
    })
  })
})

describe('markstream-react codeBlockNode plain text theme fallback', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  it('keeps dark plain text blocks on the fallback dark surface when Monaco reports light colors', async () => {
    const helpers = getStreamMonacoHelpers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    helpers.createEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      editor.style.backgroundColor = 'rgb(255, 255, 255)'
      editor.style.color = 'rgb(17, 24, 39)'

      const background = document.createElement('div')
      background.className = 'monaco-editor-background'
      background.style.backgroundColor = 'rgb(255, 255, 255)'

      const lines = document.createElement('div')
      lines.className = 'view-lines'
      lines.style.color = 'rgb(17, 24, 39)'

      editor.append(background, lines)
      el.appendChild(editor)
    })

    await act(async () => {
      root.render(React.createElement(CodeBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'plaintext',
          code: 'packages/',
          raw: '```text\npackages/\n```',
        },
        loading: false,
        isDark: true,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      }))
    })
    await waitForCallCount(helpers.createEditor, 1)
    await flushReact()

    const container = host.querySelector('.code-block-container') as HTMLElement | null
    expect(container?.classList.contains('is-dark')).toBe(true)
    expect(container?.classList.contains('is-plain-text')).toBe(true)
    expect(container?.style.getPropertyValue('--vscode-editor-background')).toBe('')
    expect(container?.style.getPropertyValue('--vscode-editor-foreground')).toBe('')

    await act(async () => {
      root.unmount()
    })
  })
})
