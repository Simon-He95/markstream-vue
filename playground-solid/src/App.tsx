import type { MarkdownRenderProps, MarkstreamRendererHandle, NodeComponentProps } from 'markstream-solid'
import MarkdownRender, { enableInfographic } from 'markstream-solid'
import { createSignal, onCleanup } from 'solid-js'
import { createDocument, paritySample, sample } from './fixtures'

enableInfographic(() => import('@antv/infographic'))

export interface PlaygroundControl {
  update: (props: Partial<MarkdownRenderProps>) => void
  restore: (content?: string) => void
  start: () => void
  pause: () => void
  resume: () => void
  getSource: () => string
  getRenderer: () => MarkstreamRendererHandle
}

declare global {
  interface Window { __markstreamSolid: PlaygroundControl }
}

function Thinking(props: NodeComponentProps) {
  return (
    <details open class="thinking">
      <summary>Reasoning</summary>
      <MarkdownRender nodes={props.node.children as any} customComponents={{}} smoothStreaming={false} maxLiveNodes={0} />
    </details>
  )
}

export default function App() {
  const [source, setSource] = createSignal(sample)
  const [content, setContent] = createSignal(sample)
  const [final, setFinal] = createSignal(true)
  const [running, setRunning] = createSignal(false)
  const [dark, setDark] = createSignal(false)
  const [chunkSize, setChunkSize] = createSignal(24)
  const [interval, setIntervalMs] = createSignal(16)
  const [props, setProps] = createSignal<Partial<MarkdownRenderProps>>({})
  const [elapsed, setElapsed] = createSignal(0)
  let renderer!: MarkstreamRendererHandle
  let timer: ReturnType<typeof setTimeout> | undefined
  let position = 0
  let started = 0
  function pause() {
    clearTimeout(timer)
    timer = undefined
    setRunning(false)
  }
  function pump() {
    position = Math.min(source().length, position + chunkSize())
    setContent(source().slice(0, position))
    setElapsed(performance.now() - started)
    if (position >= source().length) {
      setFinal(true)
      setRunning(false)
      timer = undefined
    }
    else {
      timer = setTimeout(pump, interval())
    }
  }
  function start() {
    pause()
    position = 0
    started = performance.now()
    setContent('')
    setFinal(false)
    setRunning(true)
    timer = setTimeout(pump, interval())
  }
  function resume() {
    if (running() || position >= source().length)
      return
    setFinal(false)
    setRunning(true)
    timer = setTimeout(pump, interval())
  }
  function restore(next = source()) {
    pause()
    started = performance.now()
    setSource(next)
    setContent(next)
    setFinal(true)
    position = next.length
    requestAnimationFrame(() => setElapsed(performance.now() - started))
  }
  window.__markstreamSolid = {
    update: next => setProps(previous => ({ ...previous, ...next })),
    restore,
    start,
    pause,
    resume,
    getSource: source,
    getRenderer: () => renderer,
  }
  onCleanup(pause)
  return (
    <main classList={{ 'playground-dark': dark() }}>
      <header>
        <div>
          <a href="https://github.com/Simon-He95/markstream-vue">MARKSTREAM / SOLID</a>
          <h1>Streaming lab</h1>
          <p>Write, stream, pause, restore. The same document, at every pace.</p>
        </div>
        <label>
          <input type="checkbox" checked={dark()} onChange={event => setDark(event.currentTarget.checked)} />
          {' '}
          Dark
        </label>
      </header>
      <nav aria-label="Stream controls">
        <button onClick={start} data-testid="start">Stream from start</button>
        <button onClick={pause} disabled={!running()} data-testid="pause">Pause</button>
        <button onClick={resume} disabled={running()} data-testid="resume">Resume</button>
        <button onClick={() => restore()} data-testid="restore">Restore full document</button>
        <button onClick={() => restore(createDocument())} data-testid="large">Load 1,000 nodes</button>
        <button onClick={() => restore(sample)}>Reset sample</button>
        <button onClick={() => restore(paritySample)} data-testid="parity">Toolbar &amp; preview fixtures</button>
        <label>
          Chunk
          <input type="number" min="1" max="4096" value={chunkSize()} onInput={event => setChunkSize(Math.max(1, event.currentTarget.valueAsNumber || 1))} />
        </label>
        <label>
          Interval (ms)
          <input type="number" min="0" value={interval()} onInput={event => setIntervalMs(Math.max(0, event.currentTarget.valueAsNumber || 0))} />
        </label>
      </nav>
      <div class="status" role="status">
        <span>{running() ? 'Streaming' : final() ? 'Complete' : 'Paused'}</span>
        <span>
          {content().length.toLocaleString()}
          {' '}
          /
          {' '}
          {source().length.toLocaleString()}
          {' '}
          characters
        </span>
        <span>
          {elapsed().toFixed(1)}
          {' '}
          ms elapsed
        </span>
      </div>
      <section class="workspace">
        <label class="source-panel">
          Markdown source
          <textarea
            aria-label="Markdown source"
            value={source()}
            spellcheck={false}
            onInput={(event) => {
              pause()
              setSource(event.currentTarget.value)
              setContent(event.currentTarget.value)
              setFinal(true)
            }}
          />
        </label>
        <div class="preview-panel">
          <div class="panel-label">Live preview</div>
          <div class="preview" data-testid="preview"><MarkdownRender ref={value => renderer = value} content={content()} final={final()} isDark={dark()} customHtmlTags={['thinking']} customComponents={{ thinking: Thinking }} {...props()} /></div>
        </div>
      </section>
      <footer>Native Solid rendering · shared Markstream parser and stream controller</footer>
    </main>
  )
}
