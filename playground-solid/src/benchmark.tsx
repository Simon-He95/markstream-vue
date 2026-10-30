import MarkdownRender from 'markstream-solid'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createDocument } from './fixtures'
import VueMarkdownRender from './VueBaseline.vue'

interface BenchmarkResult {
  framework: string
  scenario: string
  round: number
  characters: number
  totalMs: number
  updateP95Ms: number
  domNodes: number
  longTaskCount: number
  maxLongTaskMs: number
  frameP95Ms: number
  batchSizes: number[]
}

declare global {
  interface Window {
    __markstreamBenchmark: {
      run: (rounds?: number, profile?: { scenarios?: string[], frameworks?: string[], debug?: boolean }) => Promise<BenchmarkResult[]>
    }
  }
}

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

export function mountBenchmark(root: HTMLElement) {
  root.innerHTML = '<main><h1>Vue 3 / Solid performance</h1><p>Same parser, fixture, viewport and rendering options. Run via the browser regression script.</p><div id="benchmark-output"></div></main>'
  const output = root.querySelector<HTMLElement>('#benchmark-output')!
  window.__markstreamBenchmark = {
    async run(rounds = 3, profile = {}) {
      const results: BenchmarkResult[] = []
      for (let round = -1; round < rounds; round++) {
        for (const framework of (round % 2 === 0 ? ['vue3', 'solid'] : ['solid', 'vue3']).filter(framework => !profile.frameworks || profile.frameworks.includes(framework))) {
          for (const scenario of (profile.scenarios ?? ['restore', 'restore-virtual', 'restore-batched', 'streaming', 'restore-rich', 'streaming-rich', 'streaming-history'])) {
            const host = document.createElement('div')
            output.append(host)
            const rich = scenario.endsWith('-rich')
            const streaming = scenario.startsWith('streaming')
            const history = scenario === 'streaming-history'
            const content = rich ? ['# Rich renderer parity', '```ts\nconst answer = 42\n```', '```diff ts:answer.ts\n-const answer = 41\n+const answer = 42\n```', '$$\nx^2 + y^2 = z^2\n$$', '```mermaid\nflowchart LR\nStream --> Render\n```'].join('\n\n') : history ? `${createDocument(250)}\n\nStreaming tail ${'追加内容 🚀 stable prefix. '.repeat(32)}` : createDocument(streaming ? 12 : 250)
            const options = { debugPerformance: profile.debug && framework === 'solid', smoothStreaming: false, batchRendering: scenario === 'restore-batched', maxLiveNodes: scenario === 'restore-virtual' ? 64 : 0, deferNodesUntilVisible: false, fade: false, typewriter: false, renderCodeBlocksAsPre: !rich, viewportPriority: false }
            let update: (content: string, final: boolean) => void
            let dispose: () => void
            if (framework === 'solid') {
              const [value, setValue] = createSignal({ content: '', final: false })
              dispose = render(() => <MarkdownRender {...value()} {...options} />, host)
              update = (content, final) => {
                setValue({ content, final })
              }
            }
            else {
              const value = shallowRef({ content: '', final: false })
              const app = createApp({ render: () => h(VueMarkdownRender, { ...value.value, ...options }) })
              app.mount(host)
              dispose = () => app.unmount()
              update = (content, final) => {
                value.value = { content, final }
              }
            }
            const initialLength = history ? createDocument(250).length : 0
            if (initialLength) {
              update(content.slice(0, initialLength), false)
              await nextTick()
            }
            await frame()
            const longTasks: number[] = []
            const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
            observer.observe({ type: 'longtask' })
            const gaps: number[] = []
            const started = performance.now()
            let sampling = true
            let previousFrame = started
            let sampleFrame: number
            const sample = () => {
              if (!sampling)
                return
              const now = performance.now()
              gaps.push(now - previousFrame)
              previousFrame = now
              sampleFrame = requestAnimationFrame(sample)
            }
            sampleFrame = requestAnimationFrame(sample)
            const durations: number[] = []
            const size = streaming ? rich ? 32 : 128 : content.length
            for (let end = initialLength + size; end < content.length + size; end += size) {
              const before = performance.now()
              update(content.slice(0, end), end >= content.length)
              await nextTick()
              durations.push(performance.now() - before)
              if (streaming) {
                await frame()
              }
            }
            const batchSizes: number[] = []
            if (scenario === 'restore-batched') {
              let previousCount = 0
              const deadline = performance.now() + 10000
              while (host.querySelectorAll('.markdown-renderer > .node-slot').length < 1000) {
                const count = host.querySelectorAll('.markdown-renderer > .node-slot').length
                if (count > previousCount)
                  batchSizes.push(count - previousCount)
                previousCount = count
                if (performance.now() > deadline)
                  throw new Error(`${framework} batch restoration did not finish`)
                await frame()
              }
            }
            if (rich) {
              const deadline = performance.now() + 20000
              while (true) {
                const code = [...host.querySelectorAll('diffs-container')]
                const diagram = [...host.querySelectorAll('svg')].some(svg => svg.textContent?.includes('Stream') && svg.querySelector('g'))
                if (code.length >= 2 && code.every(element => element.shadowRoot?.querySelector('pre')) && host.querySelector('.katex') && diagram)
                  break
                if (performance.now() > deadline)
                  throw new Error(`${framework} ${scenario} did not settle`)
                await frame()
              }
            }
            await frame()
            sampling = false
            cancelAnimationFrame(sampleFrame)
            if (!gaps.length)
              gaps.push(performance.now() - started)
            longTasks.push(...observer.takeRecords().map(entry => entry.duration))
            observer.disconnect()
            const totalMs = performance.now() - started
            durations.sort((a, b) => a - b)
            gaps.sort((a, b) => a - b)
            if (round >= 0) {
              results.push({ batchSizes, framework, scenario, round, characters: content.length, totalMs, updateP95Ms: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))], domNodes: host.querySelectorAll('*').length, longTaskCount: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks), frameP95Ms: gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))] })
            }
            dispose()
            host.remove()
            await frame()
          }
        }
      }
      output.textContent = JSON.stringify(results, null, 2)
      return results
    },
  }
}
