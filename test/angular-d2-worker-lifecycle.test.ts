import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { enableD2 } from '../packages/markstream-angular/src/optional/d2'

// @angular/platform-browser is only installed for the angular playground, so the
// testing platform is resolved from there (same pattern as the other angular tests).
const require = createRequire(resolve(process.cwd(), 'playground-angular/package.json'))
await import(require.resolve('@angular/compiler'))
const { provideZonelessChangeDetection } = await import(require.resolve('@angular/core')) as any
const { TestBed } = await import(require.resolve('@angular/core/testing')) as any
const { BrowserTestingModule, platformBrowserTesting } = await import(require.resolve('@angular/platform-browser/testing')) as any
const { D2BlockNodeComponent } = await import('../packages/markstream-angular/src/components/D2BlockNode/D2BlockNode.component')

const node = {
  type: 'code_block',
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
}

const render = () => '<svg viewBox="0 0 100 100"><text>a</text></svg>'

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()))

afterEach(() => {
  enableD2()
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

afterAll(() => TestBed.resetTestEnvironment())

function mountBlock() {
  TestBed.configureTestingModule({
    imports: [D2BlockNodeComponent],
    providers: [provideZonelessChangeDetection()],
  })
  const fixture = TestBed.createComponent(D2BlockNodeComponent)
  fixture.componentRef.setInput('node', node)
  fixture.componentRef.setInput('props', { loading: false, showHeader: false })
  fixture.detectChanges()
  return fixture
}

async function flushAngular(fixture: any) {
  fixture.detectChanges()
  await fixture.whenStable()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  fixture.detectChanges()
}

async function waitForElement(fixture: any, selector: string, timeout = 1000) {
  const start = Date.now()
  while (!fixture.nativeElement.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushAngular(fixture)
  }
}

describe('markstream-angular d2 worker lifecycle', () => {
  it('releases the instance constructed for a render and not again on destroy', async () => {
    const terminate = vi.fn()
    enableD2(() => class {
      worker = { terminate }
      compile = () => ({ diagram: {} })
      render = render
    })

    const fixture = mountBlock()
    await waitForElement(fixture, '.d2-svg svg')

    expect(terminate).toHaveBeenCalledOnce()

    fixture.destroy()

    expect(terminate).toHaveBeenCalledOnce()
  })

  it.each(['resolves', 'rejects'])('terminates a worker assigned while initialization %s', async (result) => {
    const terminate = vi.fn()
    const compile = vi.fn()
    let finishInit: (() => void) | undefined

    enableD2(() => class {
      worker?: { terminate: typeof terminate }
      ready = new Promise<void>((resolve, reject) => {
        finishInit = () => {
          this.worker = { terminate }
          if (result === 'rejects')
            reject(new Error('D2 initialization failed'))
          else
            resolve()
        }
      })

      async compile() {
        compile()
        await this.ready
        return { diagram: {} }
      }

      render = render
    })

    const fixture = mountBlock()
    const start = Date.now()
    while (!compile.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for the D2 compile')
      await flushAngular(fixture)
    }

    fixture.destroy()
    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
    expect(fixture.nativeElement.querySelector('.d2-svg svg')).toBeNull()
  })

  it('leaves a loader-provided instance running after destroy', async () => {
    const terminate = vi.fn()
    enableD2(() => ({ worker: { terminate }, compile: () => ({ diagram: {} }), render }))

    const fixture = mountBlock()
    await waitForElement(fixture, '.d2-svg svg')

    fixture.destroy()

    expect(terminate).not.toHaveBeenCalled()
  })

  it('does not construct an instance when the loader resolves after destroy', async () => {
    const construct = vi.fn()
    const terminate = vi.fn()
    let resolveLoader: ((constructor: any) => void) | undefined
    const loader = vi.fn(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    enableD2(loader)

    const fixture = mountBlock()
    const start = Date.now()
    while (!loader.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for the D2 loader')
      await flushAngular(fixture)
    }

    fixture.destroy()
    resolveLoader?.(class {
      worker = { terminate }

      constructor() {
        construct()
      }

      compile = () => ({ diagram: {} })
      render = render
    })
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    expect(construct).not.toHaveBeenCalled()
  })
})
