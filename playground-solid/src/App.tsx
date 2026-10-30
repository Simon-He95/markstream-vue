import type { MarkdownRenderProps, MarkstreamRendererHandle, NodeComponentProps } from 'markstream-solid'
import type { StreamSettings } from './createPlaygroundStream'
import MarkdownRender, { enableInfographic, MarkstreamVirtualTimeline } from 'markstream-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { brandThemes, themes } from '../../playground-shared/options'
import { normalizeStreamRange } from '../../playground-shared/stream-scheduler'
import heroUrl from '../../playground/public/markstream-hero.webp'
import logoUrl from '../../playground/public/vue-markdown-icon.svg'
import { STREAM_PRESETS } from '../../playground/src/composables/streamPresets'
import { streamContent } from '../../playground/src/const/markdown'
import { createAutoScrollChaseController } from '../../playground/src/utils/autoScrollChase'
import { createPlaygroundStream } from './createPlaygroundStream'
import { createDocument, paritySample } from './fixtures'
import { Icon } from './Icon'
import { StreamSpeedPanel } from './StreamSpeedPanel'

import '../../playground-shared/chat.css'
import '../../playground-shared/speed-panel.css'
import '../../themes/index.css'

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
  return <div class="thinking-node"><MarkdownRender content={String(props.node.content ?? '')} final={!props.node.loading} isDark={props.context?.isDark} customComponents={{}} smoothStreaming={false} maxLiveNodes={0} viewportPriority={false} class="thinking-node__content" /></div>
}

export default function App() {
  const [source, setSource] = createSignal(streamContent)
  const [props, setProps] = createSignal<Partial<MarkdownRenderProps>>({})
  const [settings, setSettings] = createStore<StreamSettings & { dark: boolean, smooth: boolean, brand: string, codeTheme: string, htmlPolicy: 'trusted' | 'safe' | 'escape' }>({
    mode: 'tps',
    targetTps: 300,
    chunkSizeMin: 2,
    chunkSizeMax: 7,
    chunkDelayMin: 14,
    chunkDelayMax: 34,
    burstiness: 35,
    transport: 'readable-stream',
    sliceMode: 'pure-random',
    dark: false,
    smooth: true,
    brand: '',
    codeTheme: 'vitesse-dark',
    htmlPolicy: 'trusted',
  })
  const stream = createPlaygroundStream(source, () => settings)
  const [showSettings, setShowSettings] = createSignal(false)
  const [compact, setCompact] = createSignal(matchMedia('(max-width: 1023px)').matches)
  const [showSource, setShowSource] = createSignal(false)
  const [timeline, setTimeline] = createSignal(false)
  const timelineItems = Array.from({ length: 1000 }, (_, index) => ({ key: `message-${index}`, content: `## Message ${index}\n\nStreaming history with **Solid**.` }))
  const sizeRange = createMemo(() => normalizeStreamRange(settings.chunkSizeMin, settings.chunkSizeMax, 1, 24, 2, 7))
  const delayRange = createMemo(() => normalizeStreamRange(settings.chunkDelayMin, settings.chunkDelayMax, 8, 240, 14, 34))
  const preset = createMemo(() => STREAM_PRESETS.find(item => item.chunkSizeMin === settings.chunkSizeMin && item.chunkSizeMax === settings.chunkSizeMax && item.chunkDelayMin === settings.chunkDelayMin && item.chunkDelayMax === settings.chunkDelayMax && item.burstiness === settings.burstiness))
  const description = () => preset()?.description ?? 'Custom min/max window with your own burst profile.'
  const status = () => stream.running() ? stream.paused() ? 'Paused' : 'Streaming' : 'Ready'
  let renderer!: MarkstreamRendererHandle
  let scrollRoot!: HTMLDivElement
  let messages!: HTMLElement
  let shouldStick = true
  const chase = createAutoScrollChaseController({ getRoot: () => scrollRoot, getShouldStick: () => shouldStick, setShouldStick: value => shouldStick = value })
  function start() {
    setTimeline(false)
    shouldStick = true
    stream.start()
  }
  function restore(next = source()) {
    setTimeline(false)
    setSource(next)
    stream.restore(next)
    shouldStick = false
    chase.cancel()
    scrollRoot.scrollTop = 0
  }
  function selectMode(mode: 'tps' | 'chunks') {
    setSettings('mode', mode)
    start()
  }
  const selectSpeed = (speed: number) => {
    setSettings('targetTps', speed)
    start()
  }
  createEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark)
  })
  createEffect(() => {
    stream.content()
    if (stream.running())
      chase.schedule()
  })
  window.__markstreamSolid = {
    update: (next) => {
      stream.stop()
      setProps(previous => ({ ...previous, ...next }))
    },
    restore,
    start,
    pause: stream.pause,
    resume: stream.resume,
    getSource: source,
    getRenderer: () => renderer,
  }
  onMount(() => {
    const media = matchMedia('(max-width: 1023px)')
    const change = () => setCompact(media.matches)
    media.addEventListener('change', change)
    const observer = new ResizeObserver(() => {
      if (stream.running())
        chase.schedule()
    })
    observer.observe(messages)
    start()
    onCleanup(() => {
      media.removeEventListener('change', change)
      observer.disconnect()
      chase.cancel()
      document.documentElement.classList.remove('dark')
    })
  })
  const openThemes = () => {
    setShowSettings(true)
    requestAnimationFrame(() => document.getElementById('brand-theme')?.focus())
  }
  return (
    <div class="playground-root" classList={{ dark: settings.dark }} data-theme={settings.brand || undefined}>
      <div class="playground-bg" aria-hidden="true">
        <div class="playground-bg__beam" />
        <div class="playground-bg__orb playground-bg__orb--1" />
        <div class="playground-bg__orb playground-bg__orb--2" />
        <div class="playground-bg__grid" />
        <div class="playground-bg__grain" />
      </div>
      <Show when={compact()}><button class="settings-fab" classList={{ 'settings-fab--active': showSettings() }} aria-label="Toggle controls" aria-expanded={showSettings()} onClick={() => setShowSettings(value => !value)}><Icon name="settings-adjust" class="settings-fab__icon" /></button></Show>
      <Show when={!compact() || showSettings()}>
        <aside class="settings-sidebar" classList={{ 'settings-sidebar--docked': !compact(), 'settings-sidebar--floating': compact() }} aria-label="Controls">
          <div class="settings-sidebar__header">
            <Icon name="settings-adjust" class="settings-sidebar__header-icon" />
            <span class="settings-sidebar__title">Controls</span>
          </div>
          <div class="setting-group">
            <label for="brand-theme" class="setting-label">Brand Theme</label>
            <div class="setting-select-wrap">
              <select id="brand-theme" class="setting-select" value={settings.brand} onChange={event => setSettings('brand', event.currentTarget.value)}><For each={brandThemes}>{name => <option value={name}>{name ? name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ') : 'Default'}</option>}</For></select>
              <Icon name="chevron-down" class="setting-select-icon" />
            </div>
          </div>
          <div class="setting-group">
            <label for="code-theme" class="setting-label">Code Theme</label>
            <div class="setting-select-wrap">
              <select id="code-theme" aria-label="Code block theme" class="setting-select" value={settings.codeTheme} onChange={event => setSettings('codeTheme', event.currentTarget.value)}><For each={themes}>{name => <option value={name}>{name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</option>}</For></select>
              <Icon name="chevron-down" class="setting-select-icon" />
            </div>
          </div>
          <div class="setting-group">
            <label for="html-policy" class="setting-label">HTML Policy</label>
            <div class="setting-select-wrap">
              <select id="html-policy" aria-label="HTML policy" class="setting-select" value={settings.htmlPolicy} onChange={event => setSettings('htmlPolicy', event.currentTarget.value as typeof settings.htmlPolicy)}>
                <option value="trusted">Trusted</option>
                <option value="safe">Safe</option>
                <option value="escape">Escape</option>
              </select>
              <Icon name="chevron-down" class="setting-select-icon" />
            </div>
          </div>
          <Show when={settings.mode === 'chunks'}>
            <div class="setting-group">
              <label for="stream-profile" class="setting-label">Stream Profile</label>
              <div class="setting-select-wrap">
                <select
                  id="stream-profile"
                  class="setting-select"
                  value={preset()?.id ?? 'custom'}
                  onChange={(event) => {
                    const item = STREAM_PRESETS.find(item => item.id === event.currentTarget.value)
                    if (item)
                      setSettings(item)
                  }}
                >
                  <For each={STREAM_PRESETS}>{item => <option value={item.id}>{item.label}</option>}</For>
                  <option value="custom">Custom</option>
                </select>
                <Icon name="chevron-down" class="setting-select-icon" />
              </div>
              <p class="setting-hint">
                {description()}
                {' '}
                Settings apply on replay.
              </p>
            </div>
            <div class="setting-group">
              <label for="transport" class="setting-label">Transport</label>
              <div class="setting-select-wrap">
                <select id="transport" class="setting-select" value={settings.transport} onChange={event => setSettings('transport', event.currentTarget.value as typeof settings.transport)}>
                  <option value="readable-stream">ReadableStream</option>
                  <option value="scheduler">Scheduler</option>
                </select>
                <Icon name="chevron-down" class="setting-select-icon" />
              </div>
            </div>
            <div class="setting-group">
              <label for="slice-mode" class="setting-label">Slice Mode</label>
              <div class="setting-select-wrap">
                <select id="slice-mode" class="setting-select" value={settings.sliceMode} onChange={event => setSettings('sliceMode', event.currentTarget.value as typeof settings.sliceMode)}>
                  <option value="pure-random">Pure Random</option>
                  <option value="boundary-aware">Boundary Aware</option>
                </select>
                <Icon name="chevron-down" class="setting-select-icon" />
              </div>
            </div>
            <div class="settings-divider" />
            <For each={['chunkDelay', 'chunkSize'] as const}>
              {kind => (
                <div class="setting-group">
                  <span class="setting-label">{kind === 'chunkDelay' ? 'Chunk Delay' : 'Chunk Size'}</span>
                  <For each={['Min', 'Max'] as const}>
                    {bound => (
                      <label class="setting-slider-row">
                        <span class="setting-slider-label">{bound}</span>
                        <input aria-label={`${kind === 'chunkDelay' ? 'Chunk delay' : 'Chunk size'} ${bound.toLowerCase()}`} type="range" min={kind === 'chunkDelay' ? 8 : 1} max={kind === 'chunkDelay' ? 240 : 24} step={kind === 'chunkDelay' ? 4 : 1} class="setting-slider" value={settings[`${kind}${bound}`]} onInput={event => setSettings(`${kind}${bound}`, event.currentTarget.valueAsNumber)} />
                        <span class="setting-slider-value">
                          {settings[`${kind}${bound}`]}
                          {kind === 'chunkDelay' ? 'ms' : ''}
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              )}
            </For>
            <Show when={settings.transport === 'scheduler' && settings.sliceMode === 'boundary-aware'}>
              <div class="setting-group">
                <label for="burstiness" class="setting-label">Burstiness</label>
                <div class="setting-slider-row">
                  <input id="burstiness" type="range" min="0" max="100" class="setting-slider" value={settings.burstiness} onInput={event => setSettings('burstiness', event.currentTarget.valueAsNumber)} />
                  <span class="setting-slider-value">
                    {settings.burstiness}
                    %
                  </span>
                </div>
              </div>
            </Show>
            <p class="setting-hint">Stream settings apply when you replay.</p>
            <div class="settings-divider" />
          </Show>
          <For each={['dark', 'smooth'] as const}>
            {key => (
              <div class="setting-row-inline">
                <span id={`${key}-mode-label`} class="setting-label">{key === 'dark' ? 'Dark Mode' : 'Smooth Stream'}</span>
                <button class="theme-toggle" classList={{ 'theme-toggle--dark': settings[key] }} aria-labelledby={`${key}-mode-label`} aria-pressed={settings[key]} onClick={() => setSettings(key, value => !value)}><span class="theme-toggle__thumb"><Icon name={key === 'dark' ? settings.dark ? 'moon' : 'sun' : settings.smooth ? 'checkmark' : 'close'} class={`theme-toggle__icon theme-toggle__icon--${settings[key] ? 'moon' : 'sun'}`} /></span></button>
              </div>
            )}
          </For>
          <div class="settings-divider" />
          <details class="document-tools">
            <summary class="setting-label">Document</summary>
            <div class="setting-group">
              <button class="nav-btn" data-testid="restore" onClick={() => restore()}>Restore full document</button>
              <button class="nav-btn" data-testid="large" onClick={() => restore(createDocument())}>Load 1,000 nodes</button>
              <button class="nav-btn" onClick={() => restore(streamContent)}>Reset sample</button>
              <button class="nav-btn" data-testid="parity" onClick={() => restore(paritySample)}>Toolbar &amp; preview fixtures</button>
              <button class="nav-btn" aria-pressed={showSource()} onClick={() => setShowSource(value => !value)}>Markdown source</button>
              <a class="nav-btn" href="/line-number-handoff-check">Pre → highlight check</a>
            </div>
          </details>
        </aside>
      </Show>
      <div ref={scrollRoot} class="chat-wrapper" classList={{ 'chat-wrapper--with-sidebar': !compact() }} onScroll={() => chase.handleScroll()} onWheel={event => chase.handleWheel(event.deltaY)} onTouchMove={() => chase.handleTouchMove()} onTouchEnd={() => chase.handleTouchEnd()}>
        <div class="chat-container">
          <header class="chat-header">
            <div class="chat-header__brand">
              <div class="chat-header__logo"><img src={logoUrl} alt="" class="chat-header__logo-icon" /></div>
              <div class="chat-header__info">
                <h1 class="chat-header__title">markstream-solid</h1>
                <p class="chat-header__subtitle">Streaming Markdown Renderer</p>
                <div class="chat-header__meta">
                  <span class="chat-header__meta-pill" classList={{ 'chat-header__meta-pill--active': stream.running() && !stream.paused(), 'chat-header__meta-pill--paused': stream.paused() }}>
                    <span class="chat-header__status-dot" />
                    {status()}
                  </span>
                  <span class="chat-header__meta-pill">{settings.codeTheme || 'Auto Theme'}</span>
                </div>
              </div>
            </div>
            <nav class="chat-header__nav" aria-label="Playground navigation">
              <a class="nav-btn nav-btn--github" href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noreferrer" aria-label="Star">
                <Icon name="logo-github" class="nav-btn__icon" />
                <span class="nav-btn__text">Star</span>
              </a>
              <a class="nav-btn nav-btn--docs" href="https://markstream.simonhe.me/" target="_blank" rel="noreferrer" aria-label="Docs">
                <Icon name="book" class="nav-btn__icon" />
                <span class="nav-btn__text">Docs</span>
              </a>
              <button class="nav-btn nav-btn--themes" aria-label="Themes" onClick={openThemes}>
                <Icon name="color-palette" class="nav-btn__icon" />
                <span class="nav-btn__text">Themes</span>
              </button>
              <button class="nav-btn nav-btn--virtual" aria-label="Virtual scroll lab" onClick={() => restore(createDocument())}>
                <Icon name="list" class="nav-btn__icon" />
                <span class="nav-btn__text">Virtual scroll lab</span>
              </button>
              <button
                class="nav-btn nav-btn--virtual"
                aria-label="Virtual timeline"
                onClick={() => {
                  stream.stop()
                  setTimeline(value => !value)
                }}
              >
                <Icon name="flow" class="nav-btn__icon" />
                <span class="nav-btn__text">Virtual timeline</span>
              </button>
              <a class="nav-btn nav-btn--virtual" aria-label="Vue scroller" href="https://markstream-vue.simonhe.me/virtual-scroller-markstream" target="_blank" rel="noreferrer">
                <Icon name="data-vis-1" class="nav-btn__icon" />
                <span class="nav-btn__text">Vue scroller</span>
              </a>
              <button class="nav-btn nav-btn--retry" data-testid="start" aria-label="Retry" onClick={start}>
                <Icon name="restart" class="nav-btn__icon" />
                <span class="nav-btn__text">Retry</span>
              </button>
              <button class="nav-btn nav-btn--stream" data-testid={stream.paused() ? 'resume' : 'pause'} aria-label={stream.paused() ? 'Resume' : 'Pause'} disabled={!stream.running()} onClick={() => stream.paused() ? stream.resume() : stream.pause()}>
                <Icon name={stream.paused() ? 'play-filled-alt' : 'pause-filled'} class="nav-btn__icon" />
                <span class="nav-btn__text">{stream.paused() ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                class="nav-btn nav-btn--test"
                aria-label="Test"
                onClick={() => {
                  restore(paritySample)
                  setShowSource(true)
                }}
              >
                <Icon name="rocket" class="nav-btn__icon" />
                <span class="nav-btn__text">Test</span>
              </button>
              <a class="nav-btn nav-btn--cdn" aria-label="CDN" href="https://markstream-vue.simonhe.me/cdn-peers" target="_blank" rel="noreferrer">
                <Icon name="cloud" class="nav-btn__icon" />
                <span class="nav-btn__text">CDN</span>
              </a>
            </nav>
          </header>
          <StreamSpeedPanel mode={settings.mode} targetTps={settings.targetTps} actualTps={stream.actualTps()} totalTokens={stream.totalTokens()} elapsedMs={stream.elapsed()} progress={stream.progress()} isStreaming={stream.running()} isPaused={stream.paused()} smoothStreaming={settings.smooth} onMode={selectMode} onSpeed={selectSpeed} />
          <Show when={settings.mode === 'chunks'}>
            <section class="chat-overview">
              <div class="chat-overview__intro">
                <span class="chat-overview__eyebrow">Live Playground</span>
                <p class="chat-overview__summary">
                  {description()}
                  {' '}
                  Settings apply on replay.
                </p>
              </div>
              <div class="chat-overview__stats">
                <For each={[['Chunk', `${sizeRange().min}-${sizeRange().max}`], ['Delay', `${delayRange().min}-${delayRange().max}ms`], ['Transport', settings.transport === 'readable-stream' ? 'Reader' : 'Scheduler'], ['Burst', settings.transport === 'scheduler' && settings.sliceMode === 'boundary-aware' ? `${settings.burstiness}%` : 'Off']]}>
                  {item => (
                    <div class="chat-overview__stat">
                      <span class="chat-overview__stat-label">{item[0]}</span>
                      <strong class="chat-overview__stat-value">{item[1]}</strong>
                    </div>
                  )}
                </For>
              </div>
              <img src={heroUrl} alt="Streaming Markdown illustration" class="chat-overview__visual" />
            </section>
          </Show>
          <Show when={showSource()}>
            <section class="source-panel">
              <label for="markdown-source" class="setting-label">Markdown source</label>
              <textarea id="markdown-source" aria-label="Markdown source" value={source()} spellcheck={false} onInput={event => restore(event.currentTarget.value)} />
            </section>
          </Show>
          <main ref={messages} class="chat-messages chatbot-messages" data-testid="preview">
            <Show when={timeline()}><MarkstreamVirtualTimeline style={{ height: '70vh' }} items={timelineItems} threadKey="solid-playground" renderItem={item => <MarkdownRender content={item.content} final isDark={settings.dark} />} /></Show>
            <MarkdownRender ref={value => renderer = value} style={{ display: timeline() ? 'none' : undefined }} content={stream.content()} final={stream.final()} isDark={settings.dark} smoothStreaming={settings.smooth} codeBlockDarkTheme={settings.codeTheme} codeBlockLightTheme={settings.codeTheme} themes={[settings.codeTheme, settings.codeTheme]} htmlPolicy={settings.htmlPolicy} customHtmlTags={['thinking']} customComponents={{ thinking: Thinking }} class="chat-messages__content" data-theme={settings.brand || undefined} {...props()} />
          </main>
        </div>
      </div>
    </div>
  )
}
