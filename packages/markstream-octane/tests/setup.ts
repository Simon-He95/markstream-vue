import { Buffer } from 'node:buffer'
import { vi } from 'vitest'

class WorkerStub {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.Worker)
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: WorkerStub })

if (!globalThis.ResizeObserver)
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })

if (!globalThis.btoa) {
  Object.defineProperty(globalThis, 'btoa', {
    configurable: true,
    value: (input: string) => Buffer.from(input, 'utf8').toString('base64'),
  })
}

if (!globalThis.atob) {
  Object.defineProperty(globalThis, 'atob', {
    configurable: true,
    value: (input: string) => Buffer.from(input, 'base64').toString('utf8'),
  })
}

const editorView = {
  getModel: () => ({ getLineCount: () => 1 }),
  getOption: () => 14,
  updateOptions: vi.fn(),
  layout: vi.fn(),
}

const streamMonaco = {
  useMonaco: vi.fn(),
  createEditor: vi.fn(async () => {}),
  createDiffEditor: vi.fn(async () => {}),
  updateCode: vi.fn(),
  updateDiff: vi.fn(),
  getEditor: vi.fn(() => null),
  getEditorView: vi.fn(() => editorView),
  getDiffEditorView: vi.fn(() => editorView),
  cleanupEditor: vi.fn(),
  safeClean: vi.fn(),
  refreshDiffPresentation: vi.fn(),
  setTheme: vi.fn(async () => {}),
}

streamMonaco.useMonaco.mockImplementation(() => streamMonaco)

vi.mock('stream-diffs', () => ({
  ...streamMonaco,
  preloadMonacoWorkers: vi.fn(async () => {}),
  getOrCreateHighlighter: vi.fn(async () => ({
    codeToTokens: vi.fn(() => ({
      tokens: [],
      fg: '#000000',
      bg: '#ffffff',
      themeName: 'vitesse-dark',
      rootStyle: {},
      grammarState: null,
    })),
  })),
  detectLanguage: () => 'plaintext',
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, code: string) => `<svg data-testid="mermaid-svg">${code}</svg>`),
    parse: vi.fn(),
  },
}))
