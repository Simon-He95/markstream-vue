import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Verifies the stream-diffs-only loader contract shared by all framework
 * packages: `stream-diffs` is the sole enhanced-code-block runtime, and a
 * null result lets callers degrade to <pre> rendering.
 */

interface LoaderModule {
  useMonaco?: (options?: unknown) => unknown
  preloadMonacoWorkers?: () => Promise<unknown>
  default?: LoaderModule
}

const LOADERS = [
  ['react', '../../packages/markstream-react/src/components/CodeBlockNode/monaco.ts', 'getStreamDiffsRuntime'],
  ['svelte', '../../packages/markstream-svelte/src/optional/monaco.ts', 'getUseMonaco'],
  ['angular', '../../packages/markstream-angular/src/optional/monaco.ts', 'getUseMonaco'],
  ['vue2', '../../packages/markstream-vue2/src/components/CodeBlockNode/streamDiffs.ts', 'getStreamDiffsRuntime'],
] as const

function runtimeModule(useMonacoResult: Record<string, string>) {
  const runtime = {
    useMonaco: () => useMonacoResult,
    preloadStreamDiffsWorkers: async () => {},
    preloadMonacoWorkers: async () => {},
  }
  // Loaders normalize through `mod.default ?? mod`, so expose both shapes.
  return {
    ...runtime,
    default: runtime,
  }
}

async function getLoader(loaderPath: string, exportName: string) {
  vi.resetModules()
  const mod = await import(loaderPath) as Record<string, () => Promise<LoaderModule | null>>
  const loader = mod[exportName]
  expect(typeof loader).toBe('function')
  return loader
}

afterEach(() => {
  vi.resetModules()
})

describe('stream-diffs-only code block loader', () => {
  it.each(LOADERS)('%s loader loads stream-diffs when available', async (_name, loaderPath, exportName) => {
    vi.doMock('stream-diffs', () => runtimeModule({ runtime: 'stream-diffs' }))

    const loader = await getLoader(loaderPath, exportName)
    const mod = await loader()
    expect(mod).not.toBeNull()
    expect(mod?.useMonaco?.()).toEqual({ runtime: 'stream-diffs' })
  })

  it.each(LOADERS)('%s loader returns null when stream-diffs is absent', async (_name, loaderPath, exportName) => {
    vi.doMock('stream-diffs', () => {
      throw new Error('stream-diffs not installed')
    })

    const loader = await getLoader(loaderPath, exportName)
    const mod = await loader()
    expect(mod).toBeNull()
  })
})
