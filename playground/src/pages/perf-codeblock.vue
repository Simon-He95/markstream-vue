<script setup lang="ts">
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'
import { getStreamDiffsWorkerPool, setStreamDiffsWorkerPool } from '../../../src/exports'

// Same singleton the playground wires in main.ts; calling it again returns the
// shared instance, so toggling here re-injects the same pool.
const pool = getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4),
    workerFactory: () => new DiffsWorker(),
  },
  highlighterOptions: {
    theme: 'vitesse-dark',
  },
})

const workerOn = ref(true)
const renderKey = ref(0)
const stats = ref<Record<string, unknown>>({})

function toggleWorker() {
  workerOn.value = !workerOn.value
  setStreamDiffsWorkerPool(workerOn.value ? pool : null)
  renderKey.value++
}

function reRender() {
  renderKey.value++
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    const p = getStreamDiffsWorkerPool() as any
    stats.value = {
      on: workerOn.value,
      working: p?.isWorkingPool?.(),
      initialized: p?.isInitialized?.(),
      workersFailed: p?.getStats?.().workersFailed,
      managerState: p?.getStats?.().managerState,
      totalWorkers: p?.getStats?.().totalWorkers,
      busyWorkers: p?.getStats?.().busyWorkers,
      activeTasks: p?.getStats?.().activeTasks,
    }
  }, 500)
})
onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})

function generateTsCode(lines = 12000) {
  const out: string[] = []
  for (let i = 0; i < lines; i++) {
    const n = i % 8
    switch (n) {
      case 0:
        out.push(`export function processItem_${i}(input: string, options: { retries: number; timeout: number } = { retries: 3, timeout: 1000 }): Promise<Result<${i}>> {`)
        break
      case 1:
        out.push(`  const start = performance.now() // begin timing request #${i}`)
        break
      case 2:
        out.push(`  if (input.length > 1024) {`)
        break
      case 3:
        out.push(`    console.warn(\`truncating oversized input (${i} bytes)\`, input.slice(0, 64))`)
        break
      case 4:
        out.push(`    input = input.slice(0, 1024)`)
        break
      case 5:
        out.push(`  }`)
        break
      case 6:
        out.push(`  return await retryWithBackoff(() => fetchData_${i}(input, options), options.retries, options.timeout)`)
        break
      default:
        out.push(`}`)
        break
    }
  }
  return out.join('\n')
}

function generateDiffCode(lines = 12000) {
  const out: string[] = []
  for (let i = 0; i < lines; i++) {
    if (i % 37 === 0) {
      out.push(`-   const value_${i} = computeLegacyValue(input, ${i})`)
      out.push(`+   const value_${i} = await computeValueAsync(input, ${i})`)
    }
    else {
      out.push(`    const value_${i} = computeValue(input, ${i}) // line ${i}`)
    }
  }
  return out.join('\n')
}

const tsCode = generateTsCode(12000)
const diffCode = generateDiffCode(12000)

const codeBlockMarkdown = computed(() => [
  '# 12,000-line TypeScript block',
  '',
  '```ts',
  tsCode,
  '```',
].join('\n'))

const diffMarkdown = computed(() => [
  '# 12,000-line diff',
  '',
  '```diff ts:worker.ts',
  diffCode,
  '```',
].join('\n'))
</script>

<template>
  <div class="perf">
    <header>
      <h1>Worker Pool A/B — 12,000-line code &amp; diff</h1>
      <p class="hint">
        打开 DevTools → Performance → 点 Record，再点「重新渲染」。对比 worker 开关两种情况下主线程的长任务。
      </p>
      <div class="controls">
        <button type="button" class="btn" :class="{ active: workerOn }" @click="toggleWorker">
          {{ workerOn ? 'Worker ON' : 'Worker OFF' }}
        </button>
        <button type="button" class="btn" @click="reRender">
          重新渲染 (key={{ renderKey }})
        </button>
        <code class="status">{{ JSON.stringify(stats) }}</code>
      </div>
    </header>

    <section class="block">
      <h2>代码块（12,000 行 TS）</h2>
      <MarkdownRender
        :key="`code-${renderKey}`"
        :content="codeBlockMarkdown"
        :final="true"
        code-block-dark-theme="vitesse-dark"
        code-block-light-theme="vitesse-light"
      />
    </section>

    <section class="block">
      <h2>Diff（12,000 行，每 37 行改一处）</h2>
      <MarkdownRender
        :key="`diff-${renderKey}`"
        :content="diffMarkdown"
        :final="true"
        code-block-dark-theme="vitesse-dark"
        code-block-light-theme="vitesse-light"
      />
    </section>
  </div>
</template>

<style scoped>
.perf {
  padding: 24px;
  font-family: system-ui, sans-serif;
  background: #f5f7fb;
  min-height: 100vh;
}
header {
  margin-bottom: 16px;
}
.hint {
  color: #64748b;
  font-size: 14px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 12px 0 4px;
}
.btn {
  padding: 8px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.btn.active {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}
.status {
  font-size: 12px;
  color: #334155;
  background: #e2e8f0;
  padding: 6px 10px;
  border-radius: 6px;
  max-width: 560px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.block {
  max-width: 900px;
  margin-bottom: 32px;
}
.block h2 {
  margin: 16px 0 8px;
}
</style>
