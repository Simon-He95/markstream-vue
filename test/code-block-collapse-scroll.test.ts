import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

function helpers() {
  return (globalThis as any).__streamMonacoHelpers
}

let reportedContentHeight = 0
let triggerEditorContentSizeChange = () => {}

function makeNode(lineCount: number) {
  const code = Array.from({ length: lineCount }, (_, index) => `const line${index} = ${index}`).join('\n')
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading: false,
  }
}

function installHostMetrics(host: HTMLElement, visibleHeight: number, contentHeight: number) {
  Object.defineProperties(host, {
    clientHeight: {
      configurable: true,
      get: () => visibleHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => contentHeight,
    },
  })
  host.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: visibleHeight,
    width: 800,
    height: visibleHeight,
    toJSON: () => ({}),
  }) as DOMRect
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

function resetHelpers(contentHeight: number) {
  resetCodeBlockRuntimeReadyForTest()
  const runtime = helpers()
  reportedContentHeight = contentHeight
  triggerEditorContentSizeChange = () => {}
  const editorView = {
    getModel: () => ({ getValue: () => '', getLineCount: () => 100 }),
    getOption: () => 18,
    updateOptions: vi.fn(),
    layout: vi.fn(),
    getContentHeight: () => reportedContentHeight,
    onDidContentSizeChange: (callback: () => void) => {
      triggerEditorContentSizeChange = callback
      return { dispose: vi.fn() }
    },
  }

  runtime.useMonaco.mockReset().mockImplementation(() => runtime)
  runtime.createEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
    container.replaceChildren(document.createElement('diffs-container'))
  })
  runtime.createDiffEditor.mockReset()
  runtime.updateCode.mockReset()
  runtime.updateDiff.mockReset()
  runtime.getEditor.mockReset().mockReturnValue(null)
  runtime.getEditorView.mockReset().mockReturnValue(editorView)
  runtime.getDiffEditorView.mockReset().mockReturnValue(editorView)
  runtime.cleanupEditor.mockReset()
  runtime.safeClean.mockReset()
  runtime.refreshDiffPresentation.mockReset()
  runtime.setTheme.mockReset()
  runtime.whenVisualReady = vi.fn(() => Promise.resolve(true))
}

function mountCodeBlock(lineCount: number) {
  return mount(CodeBlockNode, {
    props: {
      node: makeNode(lineCount),
      loading: false,
      stream: true,
      showCopyButton: false,
      showExpandButton: false,
      showFontSizeButtons: false,
      showPreviewButton: false,
      showTooltips: false,
    },
  })
}

describe('code block scroll restoration after collapse', () => {
  beforeEach(() => {
    resetHelpers(1200)
  })

  afterEach(() => {
    delete helpers().whenVisualReady
    vi.restoreAllMocks()
  })

  it('keeps a long code block scrollable after collapsing and re-expanding', async () => {
    const wrapper = mountCodeBlock(100)

    await vi.waitFor(() => {
      expect(helpers().createEditor).toHaveBeenCalledTimes(1)
      expect((wrapper.get('.code-editor-container').element as HTMLElement).style.overflow).toBe('auto')
    })

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    installHostMetrics(host, 500, 1200)
    host.scrollTop = 180

    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await wrapper.get('button[aria-pressed="true"]').trigger('click')
    await flush()

    reportedContentHeight = 500
    triggerEditorContentSizeChange()
    await flush()
    await flush()

    expect(host.clientHeight).toBe(500)
    expect(host.scrollHeight).toBe(1200)
    expect(host.scrollTop).toBe(180)
    expect(host.style.overflow).toBe('auto')

    wrapper.unmount()
  })

  it('keeps a short code block non-scrollable after collapsing and re-expanding', async () => {
    resetHelpers(120)
    const wrapper = mountCodeBlock(5)

    await vi.waitFor(() => {
      expect(helpers().createEditor).toHaveBeenCalledTimes(1)
      expect((wrapper.get('.code-editor-container').element as HTMLElement).style.overflow).toBe('hidden')
    })

    const host = wrapper.get('.code-editor-container').element as HTMLElement
    installHostMetrics(host, 120, 120)

    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await wrapper.get('button[aria-pressed="true"]').trigger('click')
    await flush()

    expect(host.style.height).toBe('120px')
    expect(host.style.overflow).toBe('hidden')

    wrapper.unmount()
  })
})
