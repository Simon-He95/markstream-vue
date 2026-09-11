import type { SolidDemoId } from '../shared/demoSamples'
import type { StreamPresetId } from '../shared/streamPresets'
import type { StreamSliceMode, StreamTransportMode } from '../shared/useStreamSimulator'
import { NodeRenderer } from 'markstream-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Icon } from '../components/Icon'
import { ControllerDemo } from '../demos/ControllerDemo'
import { ObservationPanel } from '../demos/ObservationPanel'
import { ScopedRenderersDemo } from '../demos/ScopedRenderersDemo'
import { getSolidDemo, SOLID_DEMOS } from '../shared/demoSamples'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from '../shared/markstreamPlayground'
import { formatThemeName, THEMES } from '../shared/settings'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../shared/streamPresets'
import { useChatAutoScroll } from '../shared/useChatAutoScroll'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../shared/useStreamSimulator'

export interface HomePageProps {
  isDark: boolean
  setIsDark: (value: boolean | ((current: boolean) => boolean)) => void
  selectedTheme: string
  setSelectedTheme: (theme: string) => void
  streamChunkDelayMin: number
  setStreamChunkDelayMin: (value: number) => void
  streamChunkDelayMax: number
  setStreamChunkDelayMax: (value: number) => void
  streamChunkSizeMin: number
  setStreamChunkSizeMin: (value: number) => void
  streamChunkSizeMax: number
  setStreamChunkSizeMax: (value: number) => void
  streamBurstiness: number
  setStreamBurstiness: (value: number) => void
  streamTransportMode: StreamTransportMode
  setStreamTransportMode: (value: StreamTransportMode) => void
  streamSliceMode: StreamSliceMode
  setStreamSliceMode: (value: StreamSliceMode) => void
  onGoTest: () => void
  onGoMigration: () => void
}

export function HomePage(props: HomePageProps) {
  const [showSettings, setShowSettings] = createSignal(false)
  const [isCompactSettings, setIsCompactSettings] = createSignal(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  )
  const [activeDemoId, setActiveDemoId] = createSignal<SolidDemoId>('mixed')
  const [codeBlockIdentity, setCodeBlockIdentity] = createSignal('none')
  const [codeBlockCount, setCodeBlockCount] = createSignal(0)
  const [appendNonce, setAppendNonce] = createSignal(0)
  let settingsRoot: HTMLDivElement | undefined
  let messagesEl: HTMLElement | undefined
  let knownCodeBlock: Element | null = null

  const activeDemo = createMemo(() => getSolidDemo(activeDemoId()))
  const sourceContent = createMemo(() => {
    const extra = appendNonce() > 0 && activeDemoId() === 'code-identity'
      ? `\n\nAppended line ${appendNonce()}.\n`
      : ''
    return `${activeDemo().content}${extra}`
  })

  const normalizedChunkDelayRange = createMemo(() => normalizeStreamRange(
    props.streamChunkDelayMin,
    props.streamChunkDelayMax,
    8,
    240,
    14,
    34,
  ))
  const normalizedChunkSizeRange = createMemo(() => normalizeStreamRange(
    props.streamChunkSizeMin,
    props.streamChunkSizeMax,
    1,
    24,
    2,
    7,
  ))
  const normalizedBurstiness = createMemo(() => Math.round(clampStreamControl(props.streamBurstiness, 0, 100, 35)))
  const activeStreamPreset = createMemo(() => findMatchingStreamPreset({
    chunkDelayMin: normalizedChunkDelayRange().min,
    chunkDelayMax: normalizedChunkDelayRange().max,
    chunkSizeMin: normalizedChunkSizeRange().min,
    chunkSizeMax: normalizedChunkSizeRange().max,
    burstiness: normalizedBurstiness(),
  }))
  const selectedStreamPresetId = createMemo(() => activeStreamPreset()?.id ?? CUSTOM_STREAM_PRESET_ID)
  const streamPresetDescription = createMemo(() => activeStreamPreset()?.description ?? 'Custom min/max window with your own burst profile.')
  const shouldShowSettingsPanel = createMemo(() => !isCompactSettings() || showSettings())

  const simulator = useStreamSimulator(() => ({
    source: sourceContent(),
    chunkSizeMin: normalizedChunkSizeRange().min,
    chunkSizeMax: normalizedChunkSizeRange().max,
    chunkDelayMin: normalizedChunkDelayRange().min,
    chunkDelayMax: normalizedChunkDelayRange().max,
    burstiness: normalizedBurstiness() / 100,
    sliceMode: props.streamSliceMode,
    transportMode: props.streamTransportMode,
  }))

  const rendererContent = createMemo(() => simulator.isStreaming() ? simulator.content() : sourceContent())

  useChatAutoScroll(() => messagesEl, () => rendererContent())
  const smoothEnabled = createMemo(() => activeDemoId() === 'smooth')
  const usesSimulatorRenderer = createMemo(() => activeDemoId() !== 'controller' && activeDemoId() !== 'scoped')

  createEffect(() => {
    const min = normalizedChunkDelayRange().min
    const max = normalizedChunkDelayRange().max
    if (props.streamChunkDelayMin !== min)
      props.setStreamChunkDelayMin(min)
    if (props.streamChunkDelayMax !== max)
      props.setStreamChunkDelayMax(max)
  })
  createEffect(() => {
    const min = normalizedChunkSizeRange().min
    const max = normalizedChunkSizeRange().max
    if (props.streamChunkSizeMin !== min)
      props.setStreamChunkSizeMin(min)
    if (props.streamChunkSizeMax !== max)
      props.setStreamChunkSizeMax(max)
  })
  createEffect(() => {
    if (props.streamBurstiness !== normalizedBurstiness())
      props.setStreamBurstiness(normalizedBurstiness())
  })

  onMount(() => {
    simulator.start()
  })

  onMount(() => {
    if (typeof window === 'undefined')
      return
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const update = () => {
      setIsCompactSettings(mediaQuery.matches)
      if (!mediaQuery.matches)
        setShowSettings(false)
    }
    update()
    mediaQuery.addEventListener('change', update)
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!isCompactSettings() || !showSettings() || !settingsRoot)
        return
      if (settingsRoot.contains(event.target as Node))
        return
      setShowSettings(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    onCleanup(() => {
      mediaQuery.removeEventListener('change', update)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    })
  })

  createEffect(() => {
    if (!usesSimulatorRenderer())
      return
    rendererContent()
    const root = messagesEl
    const blocks = root?.querySelectorAll('[data-markstream-code-block="1"]') ?? []
    setCodeBlockCount(blocks.length)
    const first = blocks[0] ?? null
    if (!first) {
      knownCodeBlock = null
      setCodeBlockIdentity('none')
      return
    }
    if (!knownCodeBlock) {
      knownCodeBlock = first
      setCodeBlockIdentity('captured')
      return
    }
    setCodeBlockIdentity(first === knownCodeBlock ? 'same' : 'rebuilt')
  })

  function handleStreamPresetChange(presetId: StreamPresetId) {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return
    const preset = getStreamPreset(presetId)
    if (!preset)
      return
    props.setStreamChunkDelayMin(preset.chunkDelayMin)
    props.setStreamChunkDelayMax(preset.chunkDelayMax)
    props.setStreamChunkSizeMin(preset.chunkSizeMin)
    props.setStreamChunkSizeMax(preset.chunkSizeMax)
    props.setStreamBurstiness(preset.burstiness)
  }

  function loadDemo(id: SolidDemoId) {
    simulator.reset()
    knownCodeBlock = null
    setAppendNonce(0)
    setCodeBlockIdentity('none')
    setActiveDemoId(id)
    if (id !== 'controller' && id !== 'scoped')
      simulator.start()
  }

  return (
    <div class="markstream-solid h-full">
      <div class="flex items-center justify-center p-4 lg:pr-[304px] app-container h-full bg-gray-50 dark:bg-gray-900">
        <div ref={el => (settingsRoot = el)} class="fixed top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-2">
          <Show when={isCompactSettings()}>
            <button
              type="button"
              class={`pointer-events-auto settings-toggle w-10 h-10 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-lg dark:shadow-gray-900/20 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${showSettings() ? 'ring-2 ring-blue-500/50' : ''}`}
              onClick={() => setShowSettings(value => !value)}
            >
              <Icon icon="carbon:settings" class={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${showSettings() ? 'rotate-90' : ''}`} />
            </button>
          </Show>

          <Show when={shouldShowSettingsPanel()}>
            <div class={`pointer-events-auto settings-panel bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl dark:shadow-gray-900/30 p-4 space-y-4 min-w-[220px] w-[280px] overflow-y-auto ${isCompactSettings() ? 'absolute top-12 right-0 mt-2 max-h-[calc(100vh-5rem)] origin-top-right' : 'max-h-[calc(100vh-2rem)]'}`}>
              <Show when={!isCompactSettings()}>
                <div class="flex items-center gap-2 border-b border-gray-200/70 pb-2 dark:border-gray-700/70">
                  <Icon icon="carbon:settings" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Settings</span>
                </div>
              </Show>

              <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Code Theme</label>
              <div class="relative theme-selector">
                <select
                  value={props.selectedTheme}
                  onChange={event => props.setSelectedTheme(event.currentTarget.value)}
                  class="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  <For each={[...THEMES]}>{theme => <option value={theme}>{formatThemeName(theme)}</option>}</For>
                </select>
              </div>

              <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Stream Profile</label>
              <select
                value={selectedStreamPresetId()}
                onChange={event => handleStreamPresetChange(event.currentTarget.value as StreamPresetId)}
                class="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
              >
                <For each={STREAM_PRESETS}>{preset => <option value={preset.id}>{preset.label}</option>}</For>
                <option value={CUSTOM_STREAM_PRESET_ID}>Custom</option>
              </select>
              <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">{streamPresetDescription()}</p>

              <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Transport</label>
              <select
                value={props.streamTransportMode}
                onChange={event => props.setStreamTransportMode(event.currentTarget.value as StreamTransportMode)}
                class="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
              >
                <option value="readable-stream">ReadableStream</option>
                <option value="scheduler">Scheduler</option>
              </select>

              <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Slice Mode</label>
              <select
                value={props.streamSliceMode}
                onChange={event => props.setStreamSliceMode(event.currentTarget.value as StreamSliceMode)}
                class="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
              >
                <option value="pure-random">Pure Random</option>
                <option value="boundary-aware">Boundary Aware</option>
              </select>

              <div class="space-y-2">
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">chunkDelayMin</label>
                <div class="flex items-center gap-3">
                  <input type="range" min="8" max="240" step="4" value={props.streamChunkDelayMin} onInput={event => props.setStreamChunkDelayMin(Number(event.currentTarget.value))} class="flex-1 cursor-pointer" />
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkDelayRange().min}
                    ms
                  </span>
                </div>
              </div>
              <div class="space-y-2">
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">chunkDelayMax</label>
                <div class="flex items-center gap-3">
                  <input type="range" min="8" max="240" step="4" value={props.streamChunkDelayMax} onInput={event => props.setStreamChunkDelayMax(Number(event.currentTarget.value))} class="flex-1 cursor-pointer" />
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">
                    {normalizedChunkDelayRange().max}
                    ms
                  </span>
                </div>
              </div>
              <div class="space-y-2">
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">chunkSizeMin</label>
                <div class="flex items-center gap-3">
                  <input type="range" min="1" max="24" step="1" value={props.streamChunkSizeMin} onInput={event => props.setStreamChunkSizeMin(Number(event.currentTarget.value))} class="flex-1 cursor-pointer" />
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">{normalizedChunkSizeRange().min}</span>
                </div>
              </div>
              <div class="space-y-2">
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">chunkSizeMax</label>
                <div class="flex items-center gap-3">
                  <input type="range" min="1" max="24" step="1" value={props.streamChunkSizeMax} onInput={event => props.setStreamChunkSizeMax(Number(event.currentTarget.value))} class="flex-1 cursor-pointer" />
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-14 text-right">{normalizedChunkSizeRange().max}</span>
                </div>
              </div>
              <div class="space-y-2">
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Burstiness</label>
                <div class="flex items-center gap-3">
                  <input type="range" min="0" max="100" step="1" value={props.streamBurstiness} onInput={event => props.setStreamBurstiness(Number(event.currentTarget.value))} class="flex-1 cursor-pointer" />
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                    {normalizedBurstiness()}
                    %
                  </span>
                </div>
              </div>

              <p class="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                SSE / WebSocket names are cadence presets. Transport is scheduler or ReadableStream.
              </p>

              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Dark Mode</label>
                <button
                  type="button"
                  class="relative w-12 h-6 rounded-full"
                  style={{ 'background-color': props.isDark ? '#3b82f6' : '#e5e7eb' }}
                  onClick={() => props.setIsDark(value => !value)}
                >
                  <div class="absolute top-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md" style={{ left: props.isDark ? '26px' : '2px' }}>
                    {props.isDark
                      ? <Icon icon="carbon:moon" class="w-3 h-3 text-blue-600" />
                      : <Icon icon="carbon:sun" class="w-3 h-3 text-yellow-500" />}
                  </div>
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="chatbot-container max-w-5xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
          <div class="chatbot-header px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Icon icon="carbon:chat" class="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100">markstream-solid</h1>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Streaming markdown demo</p>
                </div>
              </div>
              <div class="flex flex-wrap">
                <a href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noreferrer" class="github-star-btn flex items-center gap-2 px-3 py-1.5 bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium rounded-lg">
                  <Icon icon="carbon:star" class="w-4 h-4" />
                  <span>Star</span>
                </a>
                <button type="button" class="ml-2 test-page-btn flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg" onClick={props.onGoTest}>
                  <Icon icon="carbon:rocket" class="w-4 h-4" />
                  <span>Test</span>
                </button>
                <button type="button" class="ml-2 migration-demo-btn flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 text-sm font-medium rounded-lg border border-slate-200" onClick={props.onGoMigration}>
                  <Icon icon="carbon:data-structured" class="w-4 h-4" />
                  <span>Migration</span>
                </button>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-2" data-stream-controls>
              <button type="button" data-stream-start class="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg" onClick={() => simulator.start()}>Start</button>
              <button type="button" data-stream-pause class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-lg" disabled={!simulator.isStreaming() || simulator.isPaused()} onClick={() => simulator.pause()}>Pause</button>
              <button type="button" data-stream-resume class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-lg" disabled={!simulator.isStreaming() || !simulator.isPaused()} onClick={() => simulator.resume()}>Resume</button>
              <button type="button" data-stream-stop class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-lg" onClick={() => simulator.stop()}>Stop</button>
              <button type="button" data-stream-reset class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-medium rounded-lg" onClick={() => simulator.reset()}>Reset</button>
              <Show when={activeDemoId() === 'code-identity'}>
                <button type="button" data-append-code class="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg" onClick={() => setAppendNonce(value => value + 1)}>
                  Append code line
                </button>
              </Show>
            </div>

            <div class="mt-3 flex flex-wrap gap-2" data-solid-demos>
              <For each={[...SOLID_DEMOS]}>
                {demo => (
                  <button
                    type="button"
                    class={`px-3 py-1.5 text-xs rounded-full border ${activeDemoId() === demo.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'}`}
                    data-demo-chip={demo.id}
                    onClick={() => loadDemo(demo.id)}
                  >
                    {demo.label}
                  </button>
                )}
              </For>
            </div>
            <p class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{activeDemo().hint}</p>
            <ObservationPanel
              demoId={activeDemoId()}
              sourceLength={sourceContent().length}
              visibleLength={rendererContent().length}
              pendingChars={Math.max(0, sourceContent().length - rendererContent().length)}
              caughtUp={rendererContent().length >= sourceContent().length}
              final={!simulator.isStreaming() && rendererContent().length >= sourceContent().length}
              isStreaming={simulator.isStreaming()}
              isPaused={simulator.isPaused()}
              lastChunkSize={simulator.lastChunkSize()}
              lastDelayMs={simulator.lastDelayMs()}
              codeBlockCount={codeBlockCount()}
              codeBlockIdentity={codeBlockIdentity()}
            />
          </div>

          <main ref={el => (messagesEl = el)} class="chatbot-messages flex-1 overflow-y-auto mr-[1px] mb-4 flex flex-col" data-chat-surface>
            <div class="chatbot-renderer-shell">
              <Show when={activeDemoId() === 'controller'}>
                <ControllerDemo isDark={props.isDark} />
              </Show>
              <Show when={activeDemoId() === 'scoped'}>
                <ScopedRenderersDemo isDark={props.isDark} content={sourceContent()} />
              </Show>
              <Show when={usesSimulatorRenderer()}>
                <NodeRenderer
                  content={rendererContent()}
                  codeBlockDarkTheme={props.selectedTheme as any}
                  codeBlockLightTheme={props.selectedTheme as any}
                  themes={[props.selectedTheme, props.selectedTheme] as any}
                  isDark={props.isDark}
                  customId={PLAYGROUND_CUSTOM_ID}
                  customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                  deferNodesUntilVisible={false}
                  maxLiveNodes={2000}
                  liveNodeBuffer={200}
                  viewportPriority={false}
                  smoothStreaming={smoothEnabled()}
                  typewriter={smoothEnabled()}
                  fade={smoothEnabled()}
                  batchRendering={activeDemoId() === 'batch'}
                  final={activeDemoId() === 'batch' ? true : undefined}
                />
              </Show>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
