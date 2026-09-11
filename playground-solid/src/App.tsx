import type { StreamSliceMode, StreamTransportMode } from './shared/useStreamSimulator'
import { removeCustomComponents, setCustomComponents } from 'markstream-solid'
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ThinkingNode } from './components/ThinkingNode'
import { HomePage } from './pages/HomePage'
import { LineNumberHandoffCheck } from './pages/LineNumberHandoffCheck'
import { MigrationDemoPage } from './pages/MigrationDemoPage'
import { TestLab } from './pages/TestLab'
import { PLAYGROUND_CUSTOM_ID } from './shared/markstreamPlayground'
import {
  DARK_MODE_KEY,
  normalizePath,
  readNumber,
  readString,
  readThemeFromStorage,
  STREAM_BURSTINESS_KEY,
  STREAM_CHUNK_MAX_KEY,
  STREAM_CHUNK_MIN_KEY,
  STREAM_DELAY_MAX_KEY,
  STREAM_DELAY_MIN_KEY,
  STREAM_SLICE_MODE_KEY,
  STREAM_TRANSPORT_MODE_KEY,
  THEME_KEYS,
} from './shared/settings'
import { ensurePlaygroundWorkers, preloadPlaygroundCodeRuntime } from './workers'

ensurePlaygroundWorkers()

export default function App() {
  const [currentPath, setCurrentPath] = createSignal(
    typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname),
  )
  const [selectedTheme, setSelectedTheme] = createSignal(readThemeFromStorage('vitesse-dark'))
  const [streamChunkDelayMin, setStreamChunkDelayMin] = createSignal(readNumber(STREAM_DELAY_MIN_KEY, 14))
  const [streamChunkDelayMax, setStreamChunkDelayMax] = createSignal(readNumber(STREAM_DELAY_MAX_KEY, 34))
  const [streamChunkSizeMin, setStreamChunkSizeMin] = createSignal(readNumber(STREAM_CHUNK_MIN_KEY, 2))
  const [streamChunkSizeMax, setStreamChunkSizeMax] = createSignal(readNumber(STREAM_CHUNK_MAX_KEY, 7))
  const [streamBurstiness, setStreamBurstiness] = createSignal(readNumber(STREAM_BURSTINESS_KEY, 35))
  const [streamTransportMode, setStreamTransportMode] = createSignal<StreamTransportMode>(
    readString(STREAM_TRANSPORT_MODE_KEY, 'readable-stream') as StreamTransportMode,
  )
  const [streamSliceMode, setStreamSliceMode] = createSignal<StreamSliceMode>(
    readString(STREAM_SLICE_MODE_KEY, 'pure-random') as StreamSliceMode,
  )
  const [isDark, setIsDark] = createSignal((() => {
    if (typeof window === 'undefined')
      return false
    const stored = window.localStorage.getItem(DARK_MODE_KEY)
    if (stored)
      return stored === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })())

  const isTestPage = () => currentPath() === '/test'
  const isMigrationDemoPage = () => currentPath() === '/migration-demo'
  const isLineNumberHandoffCheck = () => currentPath() === '/line-number-handoff-check'

  setCustomComponents(PLAYGROUND_CUSTOM_ID, { thinking: ThinkingNode })
  onCleanup(() => removeCustomComponents(PLAYGROUND_CUSTOM_ID))

  onMount(() => {
    if (!isLineNumberHandoffCheck())
      preloadPlaygroundCodeRuntime()
  })

  onMount(() => {
    if (typeof window === 'undefined')
      return
    const handlePopState = () => setCurrentPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    onCleanup(() => window.removeEventListener('popstate', handlePopState))
  })

  createEffect(() => {
    if (typeof document === 'undefined')
      return
    document.documentElement.classList.toggle('dark', isDark())
    if (typeof window !== 'undefined')
      window.localStorage.setItem(DARK_MODE_KEY, isDark() ? 'dark' : 'light')
  })

  createEffect(() => {
    if (typeof window === 'undefined')
      return
    window.localStorage.setItem(STREAM_DELAY_MIN_KEY, String(streamChunkDelayMin()))
    window.localStorage.setItem(STREAM_DELAY_MAX_KEY, String(streamChunkDelayMax()))
    window.localStorage.setItem(STREAM_CHUNK_MIN_KEY, String(streamChunkSizeMin()))
    window.localStorage.setItem(STREAM_CHUNK_MAX_KEY, String(streamChunkSizeMax()))
    window.localStorage.setItem(STREAM_BURSTINESS_KEY, String(streamBurstiness()))
    window.localStorage.setItem(STREAM_TRANSPORT_MODE_KEY, streamTransportMode())
    window.localStorage.setItem(STREAM_SLICE_MODE_KEY, streamSliceMode())
    for (const key of THEME_KEYS)
      window.localStorage.setItem(key, selectedTheme())
  })

  function navigate(pathname: string) {
    if (typeof window === 'undefined')
      return
    const nextPath = normalizePath(pathname)
    if (nextPath !== normalizePath(window.location.pathname))
      window.history.pushState({}, '', nextPath)
    setCurrentPath(nextPath)
  }

  return (
    <div class="markstream-solid h-full">
      <Show when={isTestPage()}>
        <TestLab frameworkLabel="Solid" onGoHome={() => navigate('/')} />
      </Show>
      <Show when={isLineNumberHandoffCheck()}>
        <LineNumberHandoffCheck />
      </Show>
      <Show when={isMigrationDemoPage()}>
        <MigrationDemoPage isDark={isDark()} onGoHome={() => navigate('/')} onGoTest={() => navigate('/test')} />
      </Show>
      <Show when={!isTestPage() && !isLineNumberHandoffCheck() && !isMigrationDemoPage()}>
        <HomePage
          isDark={isDark()}
          setIsDark={setIsDark}
          selectedTheme={selectedTheme()}
          setSelectedTheme={setSelectedTheme}
          streamChunkDelayMin={streamChunkDelayMin()}
          setStreamChunkDelayMin={setStreamChunkDelayMin}
          streamChunkDelayMax={streamChunkDelayMax()}
          setStreamChunkDelayMax={setStreamChunkDelayMax}
          streamChunkSizeMin={streamChunkSizeMin()}
          setStreamChunkSizeMin={setStreamChunkSizeMin}
          streamChunkSizeMax={streamChunkSizeMax()}
          setStreamChunkSizeMax={setStreamChunkSizeMax}
          streamBurstiness={streamBurstiness()}
          setStreamBurstiness={setStreamBurstiness}
          streamTransportMode={streamTransportMode()}
          setStreamTransportMode={setStreamTransportMode}
          streamSliceMode={streamSliceMode()}
          setStreamSliceMode={setStreamSliceMode}
          onGoTest={() => navigate('/test')}
          onGoMigration={() => navigate('/migration-demo')}
        />
      </Show>
    </div>
  )
}
