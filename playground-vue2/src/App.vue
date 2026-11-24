<script>
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'
import { streamContent } from '../../playground/src/const/markdown'
import CodeBlockEditingDemo from './components/CodeBlockEditingDemo.vue'
import LineNumberHandoffCheck from './components/LineNumberHandoffCheck.vue'
import TestLab from './components/TestLab.vue'
import ThinkingNode from './components/ThinkingNode.vue'

const markdownSource = typeof streamContent === 'string' ? streamContent : String(streamContent || '')
setCustomComponents('vue2-demo', { thinking: ThinkingNode })

export default {
  name: 'Vue2Playground',
  components: {
    CodeBlockEditingDemo,
    LineNumberHandoffCheck,
    MarkdownRender,
    TestLab,
  },
  data() {
    return {
      content: '',
      delay: 16,
      chunkSize: 2,
      timer: null,
      running: true,
      currentPath: typeof window !== 'undefined' ? window.location.pathname : '/',
    }
  },
  computed: {
    isTestPage() {
      return this.normalizePath(this.currentPath) === '/test'
    },
    isLineNumberHandoffCheck() {
      return this.normalizePath(this.currentPath) === '/line-number-handoff-check'
    },
    isCodeBlockEditingDemo() {
      return this.normalizePath(this.currentPath) === '/codeblock-editing'
    },
    isStandaloneCheckPage() {
      return this.isTestPage || this.isLineNumberHandoffCheck || this.isCodeBlockEditingDemo
    },
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
      if (this.running && !this.isStandaloneCheckPage)
        this.restartStream()
    },
  },
  mounted() {
    this.syncPath()
    window.addEventListener('popstate', this.handlePopState)
    if (!this.isStandaloneCheckPage)
      this.startStream()
  },
  beforeUnmount() {
    window.removeEventListener('popstate', this.handlePopState)
    this.stopStream()
  },
  methods: {
    normalizePath(path) {
      if (!path)
        return '/'
      const normalized = path.replace(/\/+$/, '')
      return normalized || '/'
    },
    syncPath() {
      if (typeof window === 'undefined')
        return
      this.currentPath = this.normalizePath(window.location.pathname)
    },
    handlePopState() {
      this.syncPath()
      if (this.isStandaloneCheckPage)
        this.stopStream()
      else if (!this.content.length)
        this.startStream()
    },
    navigate(path) {
      const nextPath = this.normalizePath(path)
      if (typeof window === 'undefined') {
        this.currentPath = nextPath
        return
      }
      if (nextPath !== this.normalizePath(window.location.pathname))
        window.history.pushState({}, '', nextPath)
      this.currentPath = nextPath
      if (this.isStandaloneCheckPage)
        this.stopStream()
      else if (!this.content.length)
        this.startStream()
    },
    goToTest() {
      this.navigate('/test')
    },
    goToCodeBlockEditing() {
      this.navigate('/codeblock-editing')
    },
    goHome() {
      this.navigate('/')
    },
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
  <CodeBlockEditingDemo v-if="isCodeBlockEditingDemo" @navigate-home="goHome" />
  <TestLab v-else-if="isTestPage" @navigate-home="goHome" />
  <LineNumberHandoffCheck v-else-if="isLineNumberHandoffCheck" />

  <div v-else class="page">
    <header class="header">
      <div class="header-main">
        <div class="title">
          markstream-vue2 playground
        </div>
        <div class="header-actions">
          <button type="button" class="btn" @click="goToTest">
            Open /test
          </button>
          <button type="button" class="btn ghost" @click="goToCodeBlockEditing">
            Open /codeblock-editing
          </button>
        </div>
      </div>
      <div class="sub">
        Vue 2.6 demo: streaming markdown into the renderer, with a direct CodeBlockNode editing demo at /codeblock-editing.
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
