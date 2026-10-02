import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceRenderedHtml } from '../packages/markstream-angular/src/enhanceRenderedHtml'
import { disableMermaid, enableMermaid } from '../packages/markstream-angular/src/optional/mermaid'

// Mermaid deletes any `#d<id>` container and resolves the produced `<svg id>`
// by the id it is given, so every diagram on a page needs its own id. The block
// component and `enhanceRenderedHtml` used to count independently, which made
// their first renders collide on `markstream-angular-mermaid-1` and left one of
// the diagrams blank (issue #775). This test drives both paths on one page.
//
// @angular/core and @angular/compiler are only installed for the angular
// package, so they are resolved from there (same pattern as the other angular
// tests). The block is instantiated instead of rendered through TestBed for the
// same reason: @angular/platform-browser is not a workspace dependency.
const require = createRequire(import.meta.url)
const angularPaths = [
  resolve(process.cwd(), 'packages/markstream-angular'),
  resolve(process.cwd(), 'node_modules/.pnpm/node_modules'),
]
await import(require.resolve('@angular/compiler', { paths: angularPaths }))
const { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } = await import(
  require.resolve('@angular/core', { paths: angularPaths }),
) as any

const renderIds: string[] = []

vi.mock('../packages/markstream-angular/src/workers/mermaidWorkerClient', () => ({
  canParseOffthread: async () => true,
  findPrefixOffthread: async () => null,
}))

const { MermaidBlockNodeComponent } = await import('../packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component')

const cdrStub = {
  markForCheck: () => {},
  detectChanges: () => {},
  detach: () => {},
  reattach: () => {},
  checkNoChanges: () => {},
}

const hosts: HTMLElement[] = []

function createHost() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  return host
}

async function flush() {
  for (let turn = 0; turn < 8; turn++)
    await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

function createBlock(node: any, props: Record<string, any>) {
  const injector = Injector.create({
    providers: [{ provide: ChangeDetectorRef, useValue: cdrStub }],
  })
  const component: any = runInInjectionContext(injector, () => new MermaidBlockNodeComponent())
  const previewHost = createHost()
  const modalHost = createHost()

  // The template's #previewHost / #modalHost refs, filled in by hand because no
  // template is rendered here.
  component.previewHost = new ElementRef(previewHost)
  component.modalHost = new ElementRef(modalHost)
  component.node = node
  component.props = props

  return { component, previewHost }
}

async function waitForSvg(host: HTMLElement, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await flush()
    if (host.querySelector('svg'))
      return
  }
  throw new Error('The stubbed mermaid render never produced an svg.')
}

afterEach(() => {
  disableMermaid()
  while (hosts.length)
    hosts.pop()?.remove()
  renderIds.length = 0
})

describe('mermaid render ids', () => {
  it('keeps the block component and the enhanced-HTML path on distinct ids', async () => {
    renderIds.length = 0
    enableMermaid(() => ({
      initialize() {},
      parse: async () => true,
      render: async (id: string, source: string) => {
        renderIds.push(id)
        return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"><text>${source.length}</text></svg>` }
      },
    }))

    // 1) Streamed HTML path: `enhanceRenderedHtml` upgrades a mermaid fence.
    const shellHost = createHost()
    shellHost.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph TD; A-->B;</code></pre>
      </div>
    `
    const shell = shellHost.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: true })
    expect(renderIds).toHaveLength(1)

    // 2) Component path: a block rendered next to the enhanced HTML.
    const first = createBlock({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }, { loading: false })
    first.component.ngAfterViewInit()
    await waitForSvg(first.previewHost)
    expect(renderIds).toHaveLength(2)

    // 3) A second block instance on the same page.
    const second = createBlock({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nC-->D\n',
      raw: '```mermaid\ngraph LR\nC-->D\n```',
    }, { loading: false })
    second.component.ngAfterViewInit()
    await waitForSvg(second.previewHost)
    expect(renderIds).toHaveLength(3)

    expect(new Set(renderIds).size).toBe(renderIds.length)
  })
})
