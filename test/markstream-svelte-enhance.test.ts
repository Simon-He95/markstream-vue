import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceRenderedHtml } from '../packages/markstream-svelte/src/enhanceRenderedHtml'
import { enableD2 } from '../packages/markstream-svelte/src/optional/d2'

const { cleanupEditor, createDiffEditor, createEditor, setTheme, codeBlockRuntimeOptions } = vi.hoisted(() => ({
  cleanupEditor: vi.fn(),
  createEditor: vi.fn(),
  setTheme: vi.fn(async () => {}),
  codeBlockRuntimeOptions: [] as Array<Record<string, any>>,
  createDiffEditor: vi.fn(async (container: HTMLElement, _original: string, modified: string) => {
    const surface = document.createElement('div')
    surface.className = 'stream-diffs-shell'
    surface.textContent = modified
    surface.getBoundingClientRect = () => ({
      bottom: 40,
      height: 40,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    container.replaceChildren(surface)
  }),
}))

vi.mock('../packages/markstream-svelte/src/optional/streamDiffs', () => ({
  getStreamDiffsRuntime: vi.fn(async () => ({
    createCodeBlockRuntime: vi.fn((options: Record<string, any>) => {
      codeBlockRuntimeOptions.push(options)
      return {
        cleanupEditor,
        createDiffEditor,
        createEditor,
        setTheme,
      }
    }),
  })),
}))

describe('markstream-svelte enhanceRenderedHtml', () => {
  afterEach(() => {
    enableD2()
  })

  it('hydrates encoded diff pairs through createDiffEditor', async () => {
    cleanupEditor.mockClear()
    createDiffEditor.mockClear()
    createEditor.mockClear()
    setTheme.mockClear()
    codeBlockRuntimeOptions.length = 0
    const original = 'const value = 1'
    const updated = 'const value = 2'
    const root = document.createElement('div')
    root.innerHTML = `<pre data-markstream-code-block="1" data-markstream-language="ts" data-markstream-diff="1" data-markstream-original="${btoa(original)}" data-markstream-updated="${btoa(updated)}"><code>${updated}</code></pre>`

    const handle = await enhanceRenderedHtml(root, { final: true })

    expect(createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      original,
      updated,
      'typescript',
    )
    expect(createEditor).not.toHaveBeenCalled()
    expect(root.querySelector('[data-markstream-enhanced-diff="1"]')).not.toBeNull()

    handle.dispose()
    expect(cleanupEditor).toHaveBeenCalledTimes(1)
    expect((root.querySelector('pre') as HTMLElement | null)?.style.whiteSpace).toBe('pre-wrap')
  })

  it('uses component theme precedence and preserves scroll fallback whitespace', async () => {
    cleanupEditor.mockClear()
    createEditor.mockImplementationOnce(async (container: HTMLElement, code: string) => {
      const surface = document.createElement('div')
      surface.className = 'stream-diffs-shell'
      surface.textContent = code
      surface.getBoundingClientRect = () => ({
        bottom: 123,
        height: 123,
        left: 0,
        right: 200,
        top: 0,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      container.replaceChildren(surface)
    })
    setTheme.mockClear()
    codeBlockRuntimeOptions.length = 0
    const root = document.createElement('div')
    const source = Array.from({ length: 20 }, (_, index) => `const value${index} = ${index}`).join('\n')
    root.innerHTML = `<pre data-markstream-code-block="1" data-markstream-language="ts"><code>${source}</code></pre>`

    const handle = await enhanceRenderedHtml(root, {
      codeBlockOptions: { maxHeight: 123, overflow: 'scroll' },
      codeBlockProps: {
        theme: { dark: 'pair-dark', light: 'pair-light' },
        themes: ['tuple-dark', 'tuple-light'],
      },
      codeBlockDarkTheme: 'top-dark',
      codeBlockLightTheme: 'top-light',
      final: true,
      isDark: true,
      themes: ['top-tuple-dark', 'top-tuple-light'],
    })

    expect(codeBlockRuntimeOptions[0]).toMatchObject({
      theme: 'pair-dark',
      themes: ['tuple-dark', 'tuple-light'],
    })
    expect(setTheme).toHaveBeenCalledWith('pair-dark')
    const enhancedBody = root.querySelector<HTMLElement>('.markstream-svelte-enhanced-block__body--code')
    expect(enhancedBody).not.toBeNull()
    expect(enhancedBody?.style.maxHeight).toBe('123px')
    expect(enhancedBody?.style.minHeight).toBe('123px')
    expect(enhancedBody?.style.overflow).toBe('auto')

    handle.dispose()
    const fallback = root.querySelector('pre') as HTMLElement | null
    expect(fallback?.style.whiteSpace).toBe('pre')
    expect(fallback?.style.maxHeight).toBe('123px')
    expect(fallback?.style.overflow).toBe('auto')

    codeBlockRuntimeOptions.length = 0
    setTheme.mockClear()
    const tupleRoot = document.createElement('div')
    tupleRoot.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="ts"><code>const tuple = true</code></pre>'
    const tupleHandle = await enhanceRenderedHtml(tupleRoot, {
      final: true,
      isDark: false,
      themes: ['tuple-dark', 'tuple-light'],
    })
    expect(codeBlockRuntimeOptions[0]?.theme).toBe('tuple-light')
    expect(setTheme).toHaveBeenCalledWith('tuple-light')
    tupleHandle.dispose()
  })

  it('restores the fallback when cancelled during the render frame', async () => {
    cleanupEditor.mockClear()
    createEditor.mockImplementationOnce(async (container: HTMLElement, code: string) => {
      const surface = document.createElement('div')
      surface.textContent = code
      container.replaceChildren(surface)
    })
    let cancelled = false
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementationOnce((callback) => {
      cancelled = true
      callback(0)
      return 1
    })
    const root = document.createElement('div')
    root.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="ts"><code>const value = 1</code></pre><span title="tooltip">target</span>'

    await enhanceRenderedHtml(root, {
      final: true,
      isCancelled: () => cancelled,
    })

    expect(cleanupEditor).toHaveBeenCalledTimes(1)
    expect(root.querySelector('.markstream-svelte-enhanced-block')).toBeNull()
    expect(root.querySelector('pre[data-markstream-code-block="1"]')?.textContent).toContain('const value = 1')
    expect(root.querySelector('[title="tooltip"]')).not.toBeNull()
    requestAnimationFrame.mockRestore()
  })

  it('releases the d2 worker it constructed for an enhanced block', async () => {
    const terminate = vi.fn()
    enableD2(() => class MockD2 {
      worker = { terminate }

      compile() {
        return { diagram: {} }
      }

      render() {
        return { svg: '<svg data-d2="1"><text>a</text></svg>' }
      }
    })
    const root = document.createElement('div')
    root.innerHTML = '<pre data-markstream-code-block="1"><code class="language-d2">a -> b</code></pre>'

    await enhanceRenderedHtml(root, { final: true })

    expect(root.querySelector('[data-markstream-d2="1"]')?.innerHTML).toContain('data-d2="1"')
    expect(terminate).toHaveBeenCalledOnce()
  })
})
