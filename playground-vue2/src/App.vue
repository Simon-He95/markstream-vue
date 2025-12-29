<script>
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'
import { streamContent } from '../../playground/src/const/markdown'
import ThinkingNode from './components/ThinkingNode.vue'

const markdownSource = typeof streamContent === 'string' ? streamContent : String(streamContent || '')
setCustomComponents('vue2-demo', { thinking: ThinkingNode })

export default {
  name: 'Vue2Playground',
  components: {
    MarkdownRender,
  },
  data() {
    return {
      content: '',
      delay: 16,
      chunkSize: 2,
      timer: null,
      running: true,
    }
  },
  computed: {
    totalLength() {
      return markdownSource.length
    },
    progress() {
      if (!this.totalLength)
        return 0
      return Math.min(100, Math.round((this.content.length / this.totalLength) * 100))
    },
    normalizedChunkSize() {
      const n = Math.floor(Number(this.chunkSize) || 1)
      return Math.max(1, n)
    },
    isDone() {
      return this.content.length >= this.totalLength
    },
  },
  watch: {
    delay() {
      if (this.running)
        this.restartStream()
    },
  },
  mounted() {
    this.startStream()
  },
  beforeUnmount() {
    this.stopStream()
  },
  methods: {
    tick() {
      if (this.isDone) {
        this.stopStream()
        return
      }
      const start = this.content.length
      const nextChunk = markdownSource.slice(start, start + this.normalizedChunkSize)
      this.content += nextChunk
    },
    startStream() {
      this.stopStream()
      this.running = true
      this.timer = window.setInterval(() => this.tick(), this.delay)
    },
    stopStream() {
      if (this.timer != null) {
        window.clearInterval(this.timer)
        this.timer = null
      }
      this.running = false
    },
    toggleStream() {
      if (this.running)
        this.stopStream()
      else this.startStream()
    },
    restartStream() {
      if (!this.running)
        return
      this.startStream()
    },
    resetStream() {
      this.content = ''
      this.startStream()
    },
    fillAll() {
      this.content = markdownSource
      this.stopStream()
    },
  },
}
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="title">
        markstream-vue2 playground
      </div>
      <div class="sub">
        Vue 2.6 demo: streaming markdown into the renderer
      </div>
    </header>

    <div class="layout">
      <section class="panel controls">
        <h2>Stream controls</h2>
        <div class="field">
          <label for="delay">Delay (ms)</label>
          <input id="delay" v-model.number="delay" type="number" min="4" max="200">
        </div>
        <div class="field">
          <label for="chunk">Chunk size</label>
          <input id="chunk" v-model.number="chunkSize" type="number" min="1" max="16">
        </div>
        <div class="actions">
          <button type="button" class="btn" @click="toggleStream">
            {{ running ? 'Pause' : 'Resume' }}
          </button>
          <button type="button" class="btn" @click="resetStream">
            Reset
          </button>
          <button type="button" class="btn ghost" @click="fillAll">
            Render all
          </button>
        </div>
        <div class="status">
          <div class="progress">
            <div class="bar" :style="{ width: `${progress}%` }" />
          </div>
          <div class="meta">
            {{ content.length }} / {{ totalLength }} ({{ progress }}%)
          </div>
        </div>
        <p class="note">
          This demo focuses on baseline Vue 2 rendering. Mermaid and KaTeX are
          optional peer dependencies and render when installed.
        </p>
      </section>

      <section class="panel preview">
        <MarkdownRender
          :content="content"
          :final="isDone"
          :typewriter="false"
          custom-id="vue2-demo"
          :custom-html-tags="['thinking']"
        />
      </section>
    </div>
  </div>
</template>
