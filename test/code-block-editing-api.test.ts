import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import { clearStreamDiffsWorkerPool } from '../src/components/CodeBlockNode/streamDiffsWorker'
import { provideOffscreenHeavyNodeDeferral, provideViewportPriority } from '../src/composables/viewportPriority'

interface VisibilityObserver {
  emit: () => void
}

const observers: VisibilityObserver[] = []

class IntersectionObserverStub {
  private target?: Element

  constructor(private callback: IntersectionObserverCallback) {
    observers.push({
      emit: () => {
        if (!this.target)
          return
        this.callback([
          {
            target: this.target,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ], this as unknown as IntersectionObserver)
      },
    })
  }

  observe(target: Element) {
    this.target = target
  }

  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

function helpers() {
  return (globalThis as any).__streamDiffsHelpers
}

function makeNode(code: string, loading: boolean) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const DeferredCodeBlockNode = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs }) {
    provideOffscreenHeavyNodeDeferral(computed(() => true))
    provideViewportPriority(() => null, true)
    return () => h(CodeBlockNode as any, attrs)
  },
})

describe('codeBlockNode editing API', () => {
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    resetCodeBlockRuntimeReadyForTest()
    clearStreamDiffsWorkerPool()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearStreamDiffsWorkerPool()
  })

  it('exposes editing, reveal, scroll, and code accessors through the component ref', async () => {
    const runtime = helpers()
    const editor = {
      getText: () => 'edited',
      canUndo: true,
      canRedo: false,
      undo: vi.fn(),
      redo: vi.fn(),
      applyEdits: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
    }
    const surface = {
      isReadyToEdit: vi.fn(() => true),
      isEditing: vi.fn(() => false),
      startEditing: vi.fn(async () => editor),
      stopEditing: vi.fn(),
      getEditor: vi.fn(() => editor),
      getEditingFile: vi.fn(() => ({ name: 'code.ts', contents: 'edited', lang: 'typescript' })),
      getEditingText: vi.fn(() => 'edited'),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      applyEdits: vi.fn(),
      focusEditor: vi.fn(),
      blurEditor: vi.fn(),
      revealLine: vi.fn(() => true),
      expandLine: vi.fn(),
      expandHunk: vi.fn(),
      setEditorActiveLine: vi.fn(),
      getCodeScrollLeft: vi.fn(() => 12),
      setCodeScrollLeft: vi.fn(),
      getResolvedFile: vi.fn(() => ({ contents: 'settled' })),
    }
    runtime.getSurface.mockReturnValue(surface)

    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })
    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.createEditor).toHaveBeenCalled()
    })
    await flush()

    await vi.waitFor(() => {
      expect(wrapper.findComponent(CodeBlockNode as any).exists()).toBe(true)
    })
    const vm = wrapper.findComponent(CodeBlockNode as any).vm as any
    expect(vm.getSurface()).toBe(surface)
    expect(vm.isReadyToEdit()).toBe(true)
    expect(vm.isEditing()).toBe(false)

    await expect(vm.startEditing({}, 'draft')).resolves.toBe(editor)
    expect(surface.startEditing).toHaveBeenCalledWith({}, 'draft')

    expect(vm.getEditor()).toBe(editor)
    expect(vm.getEditingText()).toBe('edited')
    expect(vm.getCode()).toBe('edited')
    expect(vm.canUndo()).toBe(true)
    expect(vm.canRedo()).toBe(false)

    vm.undo()
    vm.redo()
    vm.applyEdits([{ newText: 'x' }], false)
    vm.focusEditor()
    vm.blurEditor()
    expect(surface.undo).toHaveBeenCalledTimes(1)
    expect(surface.redo).toHaveBeenCalledTimes(1)
    expect(surface.applyEdits).toHaveBeenCalledWith([{ newText: 'x' }], false)
    expect(surface.focusEditor).toHaveBeenCalledTimes(1)
    expect(surface.blurEditor).toHaveBeenCalledTimes(1)

    expect(vm.revealLine(3, 'additions')).toBe(true)
    vm.expandLine({ additionLineNumber: 3 })
    vm.expandHunk(0, 'both')
    vm.setEditorActiveLine(3)
    expect(surface.revealLine).toHaveBeenCalledWith(3, 'additions')
    expect(surface.expandLine).toHaveBeenCalledWith({ additionLineNumber: 3 })
    expect(surface.expandHunk).toHaveBeenCalledWith(0, 'both', undefined)
    expect(surface.setEditorActiveLine).toHaveBeenCalledWith(3, undefined)

    expect(vm.getCodeScrollLeft()).toBe(12)
    vm.setCodeScrollLeft(40)
    expect(surface.setCodeScrollLeft).toHaveBeenCalledWith(40)

    vm.stopEditing('complete')
    expect(surface.stopEditing).toHaveBeenCalledWith('complete')

    surface.isReadyToEdit.mockReturnValue(false)
    surface.prepareForEditing = vi.fn(async () => {})
    await vm.startEditing()
    expect(surface.prepareForEditing).toHaveBeenCalledTimes(1)

    const runtimeOptions = runtime.createCodeBlockRuntime.mock.calls
      .map(([options]: [Record<string, any>]) => options)
      .find(options => options?.stream === false)
    expect(runtimeOptions?.onEditComplete?.({})).toBe('accept')

    surface.getEditingFile.mockReturnValue(undefined)
    surface.getResolvedFile.mockReturnValue(undefined)
    surface.getNativeInstance = vi.fn(() => ({ file: { contents: 'completed native code\n' } }))
    expect(vm.getCode()).toBe('completed native code')

    surface.getNativeInstance = vi.fn(() => ({ fileDiff: { additionLines: ['completed diff code\n'] } }))
    expect(vm.getCode()).toBe('completed diff code')
    wrapper.unmount()
  })

  it('reports a clear error when no finalized surface exists', async () => {
    const runtime = helpers()
    runtime.getSurface.mockReturnValue(null)
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const pending = true', true),
        loading: true,
        stream: true,
        showHeader: false,
      },
    })
    await flush()
    const vm = wrapper.findComponent(CodeBlockNode as any).vm as any
    expect(vm.getSurface()).toBeNull()
    expect(vm.isReadyToEdit()).toBe(false)
    await expect(vm.startEditing()).rejects.toThrow(/finish streaming/)
    expect(() => vm.applyEdits([], false)).toThrow(/not ready for edits/)
    wrapper.unmount()
  })
})
