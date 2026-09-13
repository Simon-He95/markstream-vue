<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Discussion765Message from '../components/Discussion765Message.vue'
import { createAutoScrollChaseController } from '../utils/autoScrollChase'

const source = ref([
  '```json',
  JSON.stringify({
    edits: Array.from({ length: 400 }, (_, index) => ({
      path: `src/example-${index}.ts`,
      newText: `export const example${index} = ${JSON.stringify('Streaming code block scroll position reproduction. '.repeat(3))}`,
    })),
  }, null, 2),
  '```',
  '',
  'Streaming complete.',
].join('\n'))
const content = ref('')
const isEnd = ref(true)
const running = ref(false)
const delay = ref(16)
const chunkSize = ref(64)
const followOuter = ref(false)
const shouldStick = ref(true)
const scrollRoot = ref<HTMLElement | null>(null)
const messageRoot = ref<HTMLElement | null>(null)
const codeScrollTop = ref(0)
const outerScrollTop = ref(0)
const outerBottomGap = ref(0)
const codeSurface = ref('Waiting')
const preReplacements = ref(0)
const blockReplacements = ref(0)
let activeSource = ''
let timer: ReturnType<typeof setTimeout> | undefined
let metricsTimer: ReturnType<typeof setInterval> | undefined
let previousPre: HTMLElement | null = null
let previousBlock: Element | null = null
let resizeObserver: ResizeObserver | undefined

const autoScroll = createAutoScrollChaseController({
  getRoot: () => scrollRoot.value!,
  getShouldStick: () => followOuter.value && shouldStick.value,
  setShouldStick: value => shouldStick.value = value,
})

function readMetrics() {
  const root = messageRoot.value
  const block = root?.querySelector('[data-markstream-code-block]') ?? null
  const pre = root?.querySelector<HTMLElement>('pre.code-pre-fallback') ?? null
  if (block && previousBlock && block !== previousBlock)
    blockReplacements.value++
  if (pre && previousPre && pre !== previousPre)
    preReplacements.value++
  if (block)
    previousBlock = block
  if (pre)
    previousPre = pre
  codeSurface.value = pre ? 'Streaming <pre>' : block ? 'Enhanced surface' : 'Waiting'
  codeScrollTop.value = Math.round(pre?.scrollTop ?? 0)
  if (scrollRoot.value) {
    outerScrollTop.value = Math.round(scrollRoot.value.scrollTop)
    outerBottomGap.value = Math.round(scrollRoot.value.scrollHeight - scrollRoot.value.clientHeight - scrollRoot.value.scrollTop)
  }
}

function pause() {
  clearTimeout(timer)
  running.value = false
}

function appendChunk() {
  content.value = activeSource.slice(0, content.value.length + chunkSize.value)
  if (content.value.length === activeSource.length) {
    isEnd.value = true
    pause()
  }
}

function tick() {
  appendChunk()
  if (running.value)
    timer = setTimeout(tick, delay.value)
}

function resume() {
  running.value = true
  tick()
}

async function replay() {
  pause()
  autoScroll.cancel()
  content.value = ''
  isEnd.value = false
  activeSource = source.value
  previousPre = null
  previousBlock = null
  preReplacements.value = 0
  blockReplacements.value = 0
  shouldStick.value = true
  await nextTick()
  resume()
}

function finish() {
  pause()
  content.value = activeSource
  isEnd.value = true
}

watch(content, () => autoScroll.schedule(), { flush: 'post' })
watch(followOuter, (enabled) => {
  shouldStick.value = true
  if (enabled)
    autoScroll.schedule()
  else
    autoScroll.cancel()
})

onMounted(() => {
  metricsTimer = setInterval(readMetrics, 100)
  resizeObserver = new ResizeObserver(() => autoScroll.schedule())
  resizeObserver.observe(messageRoot.value!)
})

onBeforeUnmount(() => {
  pause()
  autoScroll.cancel()
  clearInterval(metricsTimer)
  resizeObserver?.disconnect()
})
</script>

<template>
  <main class="discussion-repro">
    <header>
      <RouterLink to="/">
        ← Playground
      </RouterLink>
      <h1>Discussion #765 · Streaming scroll</h1>
      <p>
        Uses the reporter's original MarkdownRender props, with no dynamic key.
        <a href="https://github.com/Simon-He95/markstream-vue/discussions/765" target="_blank" rel="noreferrer">Open discussion ↗</a>
      </p>
    </header>

    <section class="controls" aria-label="Stream controls">
      <label>Interval
        <select v-model.number="delay">
          <option v-for="value in [4, 8, 16, 50]" :key="value" :value="value">{{ value }} ms</option>
        </select>
      </label>
      <label>Chunk size
        <select v-model.number="chunkSize">
          <option v-for="value in [16, 64, 256, 1024]" :key="value" :value="value">{{ value }} chars</option>
        </select>
      </label>
      <button type="button" @click="replay">
        Replay
      </button>
      <button v-if="running" type="button" @click="pause">
        Pause
      </button>
      <button v-else type="button" :disabled="isEnd" @click="resume">
        Resume
      </button>
      <button type="button" :disabled="isEnd" @click="finish">
        Finish now
      </button>
      <label><input v-model="followOuter" type="checkbox"> Playground outer auto-scroll</label>
    </section>

    <p class="instructions">
      Replay, then drag the code block's scrollbar after it overflows. Its position should survive further chunks.
      Outer auto-scroll is off initially; enable it to compare with the playground's scroll controller.
      Pause keeps isEnd=false. Finish also exercises the switch to highlighted code.
      DOM counters sample the first code block every 100 ms, including the initial async loading shell transition.
    </p>

    <dl class="metrics" aria-label="Scroll observations">
      <div>
        <dt>Stream</dt><dd data-testid="stream-state">
          {{ isEnd ? 'Ended' : running ? 'Running' : 'Paused' }} · {{ content.length }} chars
        </dd>
      </div>
      <div><dt>Code surface</dt><dd>{{ codeSurface }}</dd></div>
      <div>
        <dt>Code scrollTop (pre only)</dt><dd data-testid="code-scroll-top">
          {{ codeScrollTop }} px
        </dd>
      </div>
      <div>
        <dt>Code block replacements</dt><dd data-testid="block-replacements">
          {{ blockReplacements }}
        </dd>
      </div>
      <div>
        <dt>Pre replacements</dt><dd data-testid="pre-replacements">
          {{ preReplacements }}
        </dd>
      </div>
      <div><dt>Outer scroll / bottom gap</dt><dd>{{ outerScrollTop }} / {{ outerBottomGap }} px</dd></div>
      <div><dt>Outer follow</dt><dd>{{ !followOuter ? 'Off' : shouldStick ? 'Following' : 'Detached' }}</dd></div>
    </dl>

    <div
      ref="scrollRoot"
      class="scroll-root"
      data-testid="scroll-root"
      @scroll.passive="autoScroll.handleScroll"
      @wheel.passive="autoScroll.handleWheel($event.deltaY)"
      @touchmove.passive="autoScroll.handleTouchMove"
      @touchend.passive="autoScroll.handleTouchEnd"
      @touchcancel.passive="autoScroll.handleTouchEnd"
    >
      <div ref="messageRoot" data-testid="message-root">
        <Discussion765Message :content="content" :is-end="isEnd" />
      </div>
    </div>

    <details>
      <summary>Markdown input · paste a failing payload, then Replay</summary>
      <textarea v-model="source" aria-label="Markdown input" spellcheck="false" />
    </details>
  </main>
</template>

<style scoped>
.discussion-repro {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
  color: #172033;
  font-family: system-ui, sans-serif;
}
h1 { font-size: 26px; margin: 12px 0; }
a { color: #2563eb; }
.controls, .metrics { display: flex; flex-wrap: wrap; gap: 12px 20px; margin: 20px 0; }
.controls { align-items: center; }
button, select { border: 1px solid #94a3b8; border-radius: 4px; padding: 6px 10px; background: white; }
button:disabled { opacity: 0.4; }
button:not(:disabled), summary { cursor: pointer; }
dt, .instructions { color: #526078; font-size: 13px; }
dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; }
.scroll-root { height: 560px; overflow: auto; border: 1px solid #cbd5e1; padding: 16px; background: white; }
details { margin-top: 20px; }
textarea { width: 100%; height: 240px; margin-top: 12px; padding: 12px; border: 1px solid #cbd5e1; font-family: monospace; }
</style>
