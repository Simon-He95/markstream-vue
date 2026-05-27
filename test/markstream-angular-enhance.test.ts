import { describe, expect, it, vi } from 'vitest'
import { enhanceRenderedHtml } from '../packages/markstream-angular/src/enhanceRenderedHtml'

const {
  monacoCleanup,
  canParseOffthread,
  findPrefixOffthread,
  mermaidState,
} = vi.hoisted(() => ({
  monacoCleanup: vi.fn(),
  canParseOffthread: vi.fn(async () => true),
  findPrefixOffthread: vi.fn(async () => null),
  mermaidState: { failOnBToC: false },
}))

vi.mock('../packages/markstream-angular/src/optional/katex', () => ({
  isKatexEnabled: vi.fn(() => true),
  getKatex: vi.fn(async () => ({
    renderToString(source: string, options?: { displayMode?: boolean }) {
      return options?.displayMode
        ? `<span class="katex-display">${source}</span>`
        : `<span class="katex">${source}</span>`
    },
  })),
}))

vi.mock('../packages/markstream-angular/src/optional/mermaid', () => ({
  isMermaidEnabled: vi.fn(() => true),
  getMermaid: vi.fn(async () => ({
    render: vi.fn(async (_id: string, source: string) => {
      if (mermaidState.failOnBToC && source.includes('B-->C'))
        throw new Error('Incomplete mermaid graph')
      return {
        svg: `<svg data-mermaid="1"><text>${source}</text></svg>`,
      }
    }),
  })),
}))

vi.mock('../packages/markstream-angular/src/workers/mermaidWorkerClient', () => ({
  canParseOffthread,
  findPrefixOffthread,
}))

vi.mock('../packages/markstream-angular/src/optional/d2', () => ({
  getD2: vi.fn(async () => class MockD2 {
    async compile(code: string) {
      return { diagram: { code }, renderOptions: {} }
    }

    async render(diagram: { code: string }) {
      return {
        svg: `<svg data-d2="1"><text>${diagram.code}</text></svg>`,
      }
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/infographic', () => ({
  getInfographic: vi.fn(async () => class MockInfographic {
    container: HTMLElement

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    render(source: string) {
      this.container.innerHTML = `<svg data-infographic="1"><text>${source}</text></svg>`
    }

    destroy() {
      this.container.dataset.infographicDestroyed = '1'
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/monaco', () => ({
  getUseMonaco: vi.fn(async () => ({
    useMonaco: vi.fn(() => ({
      async createEditor(container: HTMLElement, code: string, language: string) {
        container.innerHTML = `<div data-monaco="1" data-language="${language}">${code}</div>`
      },
      async setTheme() {},
      cleanupEditor: monacoCleanup,
    })),
  })),
}))

describe('markstream-angular enhanceRenderedHtml', () => {
  it('hydrates math, mermaid, monaco, infographic, and d2 blocks in place', async () => {
    monacoCleanup.mockReset()
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const onCopy = vi.fn()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">E = mc^2</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>\\int_0^1 x^2 dx</code></pre><div class="markstream-nested-math-block__render"></div></div>
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph TD; A-->B;</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="ts" data-markstream-diff="1" data-markstream-original="Y29uc3QgdmFsdWUgPSAx" data-markstream-updated="Y29uc3QgdmFsdWU6IG51bWJlciA9IDE="><code class="language-ts">-const value = 1
+const value: number = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="infographic"><code class="language-infographic">infographic list-row-simple-horizontal-arrow</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    const handle = await enhanceRenderedHtml(shell, { final: true, isDark: true, onCopy, showTooltips: true })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('class="katex-display"')
    expect(shell.innerHTML).toContain('data-mermaid="1"')
    expect(shell.innerHTML).toContain('markstream-angular-mermaid')
    expect(shell.innerHTML).toContain('data-monaco="1"')
    expect(shell.innerHTML).toContain('data-markstream-monaco-diff="1"')
    expect(shell.innerHTML).toContain('data-infographic="1"')
    expect(shell.innerHTML).toContain('data-d2="1"')
    expect(shell.innerHTML).toContain('markstream-angular-enhanced-block__action')

    const copyButton = shell.querySelector<HTMLButtonElement>('.markstream-angular-enhanced-block__action')
    copyButton?.click()
    expect(onCopy).toHaveBeenCalled()

    handle.dispose()
    expect(monacoCleanup).toHaveBeenCalledTimes(2)
  })

  it('skips heavy code/diagram upgrades while content is still streaming', async () => {
    monacoCleanup.mockReset()
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">a+b</span><span class="markstream-nested-math__render"></span></span>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('language-ts')
    expect(shell.innerHTML).not.toContain('data-monaco="1"')
    expect(shell.innerHTML).not.toContain('data-d2="1"')
    expect(monacoCleanup).not.toHaveBeenCalled()
  })

  it('does not re-render KaTeX from already-rendered output', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">x = a</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>f(x) = x^2</code></pre><div class="markstream-nested-math-block__render"></div></div>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })
    const firstPass = shell.innerHTML

    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toBe(firstPass)
    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('class="katex-display"')
  })

  it('re-renders KaTeX when the source text changes during streaming', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async () => true)
    findPrefixOffthread.mockImplementation(async () => null)
    mermaidState.failOnBToC = false
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline"><span class="markstream-nested-math__source">x = a</span><span class="markstream-nested-math__render"></span></span>
        <div class="markstream-nested-math-block"><pre class="markstream-nested-math-block__source"><code>f(x) = x^2</code></pre><div class="markstream-nested-math-block__render"></div></div>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('x = a')
    expect(shell.innerHTML).toContain('f(x) = x^2')

    const inlineSource = shell.querySelector('.markstream-nested-math__source')
    const blockSource = shell.querySelector('.markstream-nested-math-block__source code')
    inlineSource!.textContent = 'x = a + b'
    blockSource!.textContent = 'f(x) = x^3'

    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('x = a + b')
    expect(shell.innerHTML).toContain('f(x) = x^3')
    expect(shell.querySelector('.markstream-nested-math')?.getAttribute('data-markstream-katex-source')).toBe('x = a + b')
    expect(shell.querySelector('.markstream-nested-math-block')?.getAttribute('data-markstream-katex-source')).toBe('f(x) = x^3')
  })

  it('renders a mermaid prefix preview while streaming when the full diagram is not yet valid', async () => {
    canParseOffthread.mockReset()
    findPrefixOffthread.mockReset()
    canParseOffthread.mockImplementation(async (source: string) => !source.includes('B-->C'))
    findPrefixOffthread.mockImplementation(async () => 'graph LR\nA-->B\n')
    mermaidState.failOnBToC = true

    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph LR
A-->B
B-->C
</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(canParseOffthread).toHaveBeenCalled()
    expect(findPrefixOffthread).toHaveBeenCalled()
    expect(shell.innerHTML).toContain('data-mermaid="1"')
    expect(shell.innerHTML).toContain('markstream-angular-mermaid')
    const previewHost = shell.querySelector('.markstream-angular-mermaid')
    expect(previewHost?.innerHTML).toContain('A--&gt;B')
    expect(previewHost?.innerHTML).not.toContain('B--&gt;C')

    mermaidState.failOnBToC = false
  })
})
