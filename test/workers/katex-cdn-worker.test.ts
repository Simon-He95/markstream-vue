import { describe, expect, it } from 'vitest'
import { buildKaTeXCDNWorkerSource, createKaTeXWorkerFromCDN } from '../../src/workers/katexCdnWorker'

describe('katex CDN worker factory', () => {
  it('builds classic worker source with importScripts', () => {
    const src = buildKaTeXCDNWorkerSource({
      katexUrl: 'https://cdn.example.com/katex.min.js',
      mhchemUrl: 'https://cdn.example.com/mhchem.min.js',
      mode: 'classic',
    })
    expect(src).toContain('importScripts(')
    expect(src).toContain('katex.min.js')
    expect(src).toContain('mhchem.min.js')
  })

  it('builds module worker source with dynamic import(url)', () => {
    const src = buildKaTeXCDNWorkerSource({
      katexUrl: 'https://cdn.example.com/katex.mjs',
      mhchemUrl: 'https://cdn.example.com/mhchem.mjs',
      mode: 'module',
      workerOptions: { type: 'module' },
    })
    expect(src).toContain('await import(')
    expect(src).toContain('katex.mjs')
    expect(src).toContain('mhchem.mjs')
  })

  it('is SSR-safe and returns null worker when Worker is unavailable', () => {
    const prev = (globalThis as any).Worker
    try {
      ;(globalThis as any).Worker = undefined
      const handle = createKaTeXWorkerFromCDN({
        katexUrl: 'https://cdn.example.com/katex.min.js',
        mode: 'classic',
      })
      expect(handle.worker).toBeNull()
      expect(typeof handle.dispose).toBe('function')
    }
    finally {
      ;(globalThis as any).Worker = prev
    }
  })

  it('creates a Worker instance when Worker exists (stubbed in tests)', () => {
    const handle = createKaTeXWorkerFromCDN({
      katexUrl: 'https://cdn.example.com/katex.min.js',
      mode: 'classic',
      debug: true,
    })
    expect(handle.worker).toBeTruthy()
    expect(typeof handle.dispose).toBe('function')
  })

  it('defaults module workerOptions.type to "module"', () => {
    const prev = (globalThis as any).Worker
    const calls: any[] = []
    class CaptureWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      constructor(_url: string, opts?: WorkerOptions) {
        calls.push({ opts })
      }

      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      terminate() {}
    }
    try {
      ;(globalThis as any).Worker = CaptureWorker as any
      const handle = createKaTeXWorkerFromCDN({
        katexUrl: 'https://cdn.example.com/katex.mjs',
        mode: 'module',
      })
      expect(handle.worker).toBeTruthy()
      expect(calls[0]?.opts?.type).toBe('module')
    }
    finally {
      ;(globalThis as any).Worker = prev
    }
  })
})
