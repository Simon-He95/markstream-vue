import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { TestPageViewMode } from '../../../playground-shared/testPageState'
import type { StreamPresetId } from '../shared/streamPresets'
import type { StreamSliceMode, StreamTransportMode } from '../shared/useStreamSimulator'
import { NodeRenderer } from 'markstream-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount } from 'solid-js'
import { resolveMarkdownTextareaPaste } from '../../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { buildTestPageHref, decodeMarkdownHash, resolveFrameworkTestHref, resolveTestPageViewMode } from '../../../playground-shared/testPageState'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from '../shared/markstreamPlayground'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../shared/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../shared/useStreamSimulator'

const CURRENT_FRAMEWORK: TestLabFrameworkId = 'solid'
const DARK_MODE_KEY = 'vmr-test-dark'

export interface TestLabProps {
  frameworkLabel: string
  onGoHome: () => void
}

export function TestLab(props: TestLabProps) {
  let streamSettingsDialog: HTMLDialogElement | undefined
  let previewCard: HTMLElement | undefined
  let previewShareTimer: number | null = null

  const [selectedSampleId, setSelectedSampleId] = createSignal<TestLabSampleId>('baseline')
  const [input, setInput] = createSignal(TEST_LAB_SAMPLES[0].content)
  const [viewMode, setViewMode] = createSignal<TestPageViewMode>(
    typeof window === 'undefined' ? 'lab' : resolveTestPageViewMode(window.location.search),
  )
  const [isDark, setIsDark] = createSignal(
    typeof window !== 'undefined' && window.localStorage.getItem(DARK_MODE_KEY) === 'dark',
  )
  const [isPreviewFullscreen, setIsPreviewFullscreen] = createSignal(false)
  const [isPreviewShareCopied, setIsPreviewShareCopied] = createSignal(false)
  const [streamChunkSizeMin, setStreamChunkSizeMin] = createSignal(2)
  const [streamChunkSizeMax, setStreamChunkSizeMax] = createSignal(7)
  const [streamChunkDelayMin, setStreamChunkDelayMin] = createSignal(14)
  const [streamChunkDelayMax, setStreamChunkDelayMax] = createSignal(34)
  const [streamBurstiness, setStreamBurstiness] = createSignal(35)
  const [streamTransportMode, setStreamTransportMode] = createSignal<StreamTransportMode>('readable-stream')
  const [streamSliceMode, setStreamSliceMode] = createSignal<StreamSliceMode>('pure-random')

  const activeSample = createMemo(() => TEST_LAB_SAMPLES.find(sample => sample.id === selectedSampleId()) ?? TEST_LAB_SAMPLES[0])
  const normalizedChunkSizeRange = createMemo(() => normalizeStreamRange(streamChunkSizeMin(), streamChunkSizeMax(), 1, 80, 2, 7))
  const normalizedChunkDelayRange = createMemo(() => normalizeStreamRange(streamChunkDelayMin(), streamChunkDelayMax(), 8, 600, 14, 34))
  const normalizedBurstiness = createMemo(() => Math.round(clampStreamControl(streamBurstiness(), 0, 100, 35)))
  const simulator = useStreamSimulator(() => ({
    source: input(),
    chunkSizeMin: normalizedChunkSizeRange().min,
    chunkSizeMax: normalizedChunkSizeRange().max,
    chunkDelayMin: normalizedChunkDelayRange().min,
    chunkDelayMax: normalizedChunkDelayRange().max,
    burstiness: normalizedBurstiness() / 100,
    sliceMode: streamSliceMode(),
    transportMode: streamTransportMode(),
  }))
  const previewContent = createMemo(() => simulator.isStreaming() ? simulator.content() : input())
  const progress = createMemo(() => input().length ? Math.min(100, Math.round((previewContent().length / input().length) * 100)) : 0)
  const charCount = createMemo(() => input().length)
  const lineCount = createMemo(() => input() ? input().split('\n').length : 0)
  const activeStreamPreset = createMemo(() => findMatchingStreamPreset({
    chunkDelayMin: normalizedChunkDelayRange().min,
    chunkDelayMax: normalizedChunkDelayRange().max,
    chunkSizeMin: normalizedChunkSizeRange().min,
    chunkSizeMax: normalizedChunkSizeRange().max,
    burstiness: normalizedBurstiness(),
  }))
  const selectedStreamPresetId = createMemo(() => activeStreamPreset()?.id ?? CUSTOM_STREAM_PRESET_ID)
  const streamPresetDescription = createMemo(() => activeStreamPreset()?.description ?? 'Current values are outside the built-in presets.')
  const streamChunkRangeLabel = createMemo(() => `${normalizedChunkSizeRange().min}-${normalizedChunkSizeRange().max} chars`)
  const streamDelayRangeLabel = createMemo(() => `${normalizedChunkDelayRange().min}-${normalizedChunkDelayRange().max}ms`)
  const streamStatusLabel = createMemo(() => simulator.isStreaming() ? (simulator.isPaused() ? 'Paused' : 'Streaming') : 'Ready')
  const activeStreamPresetLabel = createMemo(() => activeStreamPreset()?.label ?? 'Custom window')
  const isSharePreviewMode = createMemo(() => viewMode() === 'preview')
  const showImmersivePreviewControls = createMemo(() => isSharePreviewMode() || isPreviewFullscreen())
  const immersiveBackLabel = createMemo(() => isSharePreviewMode() ? '打开 Test Page' : '返回编辑')
  const themeToggleLabel = createMemo(() => isDark() ? '切换浅色' : '切换暗色')

  onMount(() => {
    if (typeof window === 'undefined')
      return
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      setInput(restored)
    setViewMode(resolveTestPageViewMode(window.location.search))
  })

  createEffect(() => {
    if (typeof window === 'undefined')
      return
    window.localStorage.setItem(DARK_MODE_KEY, isDark() ? 'dark' : 'light')
  })

  onMount(() => {
    if (typeof document === 'undefined')
      return
    function syncPreviewFullscreenState() {
      setIsPreviewFullscreen(document.fullscreenElement === previewCard)
    }
    document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
    onCleanup(() => document.removeEventListener('fullscreenchange', syncPreviewFullscreenState))
  })

  onCleanup(() => {
    if (previewShareTimer != null && typeof window !== 'undefined')
      window.clearTimeout(previewShareTimer)
  })

  createEffect(() => {
    const range = normalizedChunkSizeRange()
    if (streamChunkSizeMin() !== range.min)
      setStreamChunkSizeMin(range.min)
    if (streamChunkSizeMax() !== range.max)
      setStreamChunkSizeMax(range.max)
  })
  createEffect(() => {
    const range = normalizedChunkDelayRange()
    if (streamChunkDelayMin() !== range.min)
      setStreamChunkDelayMin(range.min)
    if (streamChunkDelayMax() !== range.max)
      setStreamChunkDelayMax(range.max)
  })
  createEffect(() => {
    if (streamBurstiness() !== normalizedBurstiness())
      setStreamBurstiness(normalizedBurstiness())
  })

  function applySample(id: TestLabSampleId) {
    const sample = TEST_LAB_SAMPLES.find(item => item.id === id)
    if (!sample)
      return
    simulator.reset()
    setSelectedSampleId(sample.id)
    setInput(sample.content)
  }

  function toggleStream() {
    if (simulator.isStreaming()) {
      simulator.stop()
      return
    }
    simulator.start()
  }

  function resetEditor() {
    applySample(selectedSampleId())
  }

  function clearEditor() {
    simulator.reset()
    setInput('')
    setIsPreviewShareCopied(false)
  }

  function handleEditorPaste(event: ClipboardEvent & { currentTarget: HTMLTextAreaElement }) {
    const textarea = event.currentTarget
    const pasted = event.clipboardData?.getData('text/plain') ?? ''
    const next = resolveMarkdownTextareaPaste(textarea, pasted)
    if (!next)
      return
    event.preventDefault()
    textarea.value = next.nextValue
    textarea.selectionStart = next.selectionStart
    textarea.selectionEnd = next.selectionEnd
    setInput(next.nextValue)
  }

  function handleStreamPresetChange(presetId: StreamPresetId) {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return
    const preset = getStreamPreset(presetId)
    if (!preset)
      return
    setStreamChunkDelayMin(preset.chunkDelayMin)
    setStreamChunkDelayMax(preset.chunkDelayMax)
    setStreamChunkSizeMin(preset.chunkSizeMin)
    setStreamChunkSizeMax(preset.chunkSizeMax)
    setStreamBurstiness(preset.burstiness)
  }

  function frameworkHref(id: TestLabFrameworkId) {
    const framework = TEST_LAB_FRAMEWORKS.find(item => item.id === id)
    if (!framework)
      return '/test'
    return resolveFrameworkTestHref(
      framework,
      CURRENT_FRAMEWORK,
      input(),
      typeof window !== 'undefined'
        ? { hostname: window.location.hostname, protocol: window.location.protocol }
        : undefined,
    )
  }

  function currentBasePageUrl() {
    const url = new URL(window.location.href)
    url.hash = ''
    url.search = ''
    return url.toString()
  }

  async function copyPreviewShareLink() {
    if (typeof window === 'undefined')
      return
    const target = buildTestPageHref(currentBasePageUrl(), input(), 'preview')
    await navigator.clipboard.writeText(target)
    setIsPreviewShareCopied(true)
    if (previewShareTimer != null)
      window.clearTimeout(previewShareTimer)
    previewShareTimer = window.setTimeout(() => setIsPreviewShareCopied(false), 1800)
  }

  async function togglePreviewFullscreen() {
    if (typeof document === 'undefined' || !previewCard)
      return
    if (document.fullscreenElement === previewCard) {
      await document.exitFullscreen?.()
      return
    }
    await previewCard.requestFullscreen?.()
  }

  function returnToEditableTestPage() {
    if (isSharePreviewMode()) {
      window.location.href = buildTestPageHref(currentBasePageUrl(), input(), 'lab')
      return
    }
    if (typeof document !== 'undefined' && document.fullscreenElement === previewCard)
      void document.exitFullscreen?.()
  }

  return (
    <div class={`test-lab ${isDark() ? 'test-lab--dark dark' : ''} ${isSharePreviewMode() ? 'test-lab--share-preview' : ''}`} data-test-lab>
      {!isSharePreviewMode() && <div class="test-lab__glow test-lab__glow--cyan" />}
      {!isSharePreviewMode() && <div class="test-lab__glow test-lab__glow--amber" />}

      <div class={`test-lab__shell ${isSharePreviewMode() ? 'test-lab__shell--share-preview' : ''}`}>
        {!isSharePreviewMode() && (
          <section class="hero-panel">
            <div class="hero-panel__copy">
              <span class="eyebrow">
                {props.frameworkLabel}
                {' '}
                Regression Lab
              </span>
              <h1>markstream-solid /test</h1>
              <p>专门用来和 Vue 3、Vue 2、React、Angular、Svelte 的 test page 做对照，快速定位框架层差异。</p>
            </div>
            <div class="hero-panel__actions">
              <div class="hero-panel__status-row">
                <span class="mini-pill">{props.frameworkLabel}</span>
                <span class={`mini-pill ${simulator.isStreaming() ? 'mini-pill--active' : ''}`}>{streamStatusLabel()}</span>
                <span class="mini-pill">{activeStreamPresetLabel()}</span>
              </div>
              <div class="hero-panel__metrics">
                <div class="metric-card">
                  <span>当前框架</span>
                  <strong>{props.frameworkLabel}</strong>
                </div>
                <div class="metric-card">
                  <span>字符数</span>
                  <strong>{charCount()}</strong>
                </div>
                <div class="metric-card">
                  <span>行数</span>
                  <strong>{lineCount()}</strong>
                </div>
                <div class="metric-card">
                  <span>进度</span>
                  <strong>
                    {progress()}
                    %
                  </strong>
                </div>
              </div>
            </div>
            <div class="framework-switcher">
              <For each={[...TEST_LAB_FRAMEWORKS]}>
                {framework => (
                  <a class={`framework-chip ${framework.id === CURRENT_FRAMEWORK ? 'framework-chip--current' : ''}`} href={frameworkHref(framework.id)}>
                    <span class="framework-chip__label">{framework.label}</span>
                    <span class="framework-chip__note">{framework.note}</span>
                  </a>
                )}
              </For>
            </div>
          </section>
        )}

        <div class={`lab-layout ${isSharePreviewMode() ? 'lab-layout--share-preview' : ''}`}>
          {!isSharePreviewMode() && (
            <section class="panel-card panel-card--samples">
              <div class="panel-card__head">
                <div>
                  <h2>样例</h2>
                  <p>同一段输入，切到别的框架继续比。</p>
                </div>
                <span class="mini-pill">{activeSample().title}</span>
              </div>
              <div class="sample-list">
                <For each={[...TEST_LAB_SAMPLES]}>
                  {sample => (
                    <button type="button" class={`sample-card ${sample.id === selectedSampleId() ? 'sample-card--active' : ''}`} data-sample={sample.id} onClick={() => applySample(sample.id)}>
                      <strong>{sample.title}</strong>
                      <span>{sample.summary}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          )}

          {!isSharePreviewMode() && (
            <section class="panel-card panel-card--stream">
              <div class="panel-card__head">
                <div>
                  <h2>流式控制</h2>
                  <p>主卡片只保留节奏摘要，详细参数放到更多设置里。</p>
                </div>
                <button type="button" class="ghost-button" onClick={() => streamSettingsDialog?.showModal()}>更多设置</button>
              </div>
              <div class="stream-summary">
                <div class="stream-summary__row">
                  <span class="mini-pill mini-pill--active">{activeStreamPresetLabel()}</span>
                  <span class="mini-pill">{streamTransportMode() === 'readable-stream' ? 'ReadableStream' : 'Scheduler'}</span>
                  <span class="mini-pill">{streamSliceMode() === 'boundary-aware' ? 'Boundary Aware' : 'Pure Random'}</span>
                  <span class={`mini-pill ${simulator.isStreaming() ? 'mini-pill--active' : ''}`}>{streamStatusLabel()}</span>
                </div>
                <div class="stream-summary__row stream-summary__row--dense">
                  <span class="stream-summary__item">
                    Chunk
                    {streamChunkRangeLabel()}
                  </span>
                  <span class="stream-summary__item">
                    Delay
                    {streamDelayRangeLabel()}
                  </span>
                  <span class="stream-summary__item">
                    Burst
                    {normalizedBurstiness()}
                    %
                  </span>
                  <span class={`stream-summary__item ${simulator.isPaused() ? 'stream-summary__item--active' : ''}`}>{simulator.isPaused() ? '已暂停' : '连续输出'}</span>
                </div>
              </div>
              <div class="button-grid">
                <button type="button" class="testlab-btn testlab-btn--primary" data-testlab-stream onClick={toggleStream}>
                  {simulator.isStreaming() ? '停止流式渲染' : '开始流式渲染'}
                </button>
                <button type="button" class="testlab-btn" disabled={!simulator.isStreaming()} onClick={() => simulator.togglePause()}>
                  {simulator.isPaused() ? '继续流式渲染' : '暂停流式渲染'}
                </button>
                <button type="button" class="testlab-btn" onClick={resetEditor}>重置样例</button>
                <button type="button" class="testlab-btn" onClick={clearEditor}>清空输入</button>
                <button type="button" class="testlab-btn" onClick={props.onGoHome}>返回主 demo</button>
              </div>
              <div class="progress-block">
                <div class="progress-track">
                  <div class="progress-fill" style={{ width: `${progress()}%` }} />
                </div>
                <div class="progress-meta">
                  <span>
                    {previewContent().length}
                    {' '}
                    /
                    {' '}
                    {input().length || 0}
                  </span>
                  <span>{simulator.isStreaming() ? `${simulator.lastChunkSize()} chars / ${simulator.lastDelayMs()}ms` : 'Static preview'}</span>
                </div>
              </div>
            </section>
          )}

          <section class={`workspace-grid ${isSharePreviewMode() ? 'workspace-grid--share-preview' : ''}`}>
            {!isSharePreviewMode() && (
              <article class="workspace-card workspace-card--pane workspace-card--editor">
                <header class="workspace-card__head">
                  <div>
                    <h2>Markdown 输入</h2>
                    <p>把 markdown 粘进来，右侧立即对照 Solid 渲染结果。</p>
                  </div>
                  <span class="mini-pill">Live editor</span>
                </header>
                <textarea
                  value={input()}
                  onInput={event => setInput(event.currentTarget.value)}
                  onPaste={handleEditorPaste}
                  class="editor-textarea"
                  spellcheck={false}
                  placeholder="Paste markdown here..."
                />
                <footer class="workspace-card__foot">
                  <span>可直接粘贴 issue 复现内容</span>
                  <span>
                    {charCount()}
                    {' '}
                    chars
                  </span>
                </footer>
              </article>
            )}

            <article
              ref={el => (previewCard = el)}
              class={`workspace-card workspace-card--pane workspace-card--preview ${isSharePreviewMode() ? 'workspace-card--share-preview' : ''}`}
            >
              {showImmersivePreviewControls() && (
                <div class="preview-immersive-shell">
                  <div class="preview-immersive-toolbar">
                    <button type="button" class="ghost-button preview-immersive-toolbar__button" onClick={returnToEditableTestPage}>{immersiveBackLabel()}</button>
                    <button type="button" class="ghost-button preview-immersive-toolbar__button" onClick={() => setIsDark(value => !value)}>{themeToggleLabel()}</button>
                    {!isSharePreviewMode() && (
                      <button type="button" class="ghost-button preview-immersive-toolbar__button" onClick={() => void togglePreviewFullscreen()}>
                        {isPreviewFullscreen() ? '退出全屏' : '全屏预览'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!isSharePreviewMode() && (
                <header class="workspace-card__head">
                  <div>
                    <h2>实时预览</h2>
                    <p>{`${simulator.isStreaming() ? (simulator.isPaused() ? '流式已暂停' : 'Streaming 中') : '已显示完整输入'}${isPreviewFullscreen() ? ' · 按 Esc 退出全屏' : ''}`}</p>
                  </div>
                  <div class="workspace-card__head-actions">
                    <button type="button" class="ghost-button" onClick={() => setIsDark(value => !value)}>{themeToggleLabel()}</button>
                    <button type="button" class="ghost-button" onClick={() => void copyPreviewShareLink()}>{isPreviewShareCopied() ? '已复制预览链接' : '复制预览链接'}</button>
                    <button type="button" class="ghost-button" onClick={() => void togglePreviewFullscreen()}>{isPreviewFullscreen() ? '退出全屏' : '全屏预览'}</button>
                    <span class={`mini-pill ${simulator.isStreaming() ? 'mini-pill--active' : ''}`}>{streamStatusLabel()}</span>
                  </div>
                </header>
              )}

              <div class="preview-surface" data-testlab-preview>
                <NodeRenderer
                  content={previewContent()}
                  typewriter={false}
                  codeBlockStream
                  isDark={isDark()}
                  customId={PLAYGROUND_CUSTOM_ID}
                  customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                  codeBlockDarkTheme="vitesse-dark"
                  codeBlockLightTheme="vitesse-light"
                />
              </div>

              {!isSharePreviewMode() && (
                <footer class="workspace-card__foot">
                  <span>
                    {previewContent().length}
                    {' '}
                    /
                    {' '}
                    {input().length || 0}
                  </span>
                  <span>{simulator.isStreaming() ? `${streamTransportMode()} · ${simulator.lastChunkSize()} chars / ${simulator.lastDelayMs()}ms` : 'Solid renderer'}</span>
                </footer>
              )}
            </article>
          </section>
        </div>

        {!isSharePreviewMode() && (
          <dialog ref={el => (streamSettingsDialog = el)} class="settings-dialog">
            <div class="settings-dialog__panel">
              <header class="settings-dialog__head">
                <div>
                  <h2>流式详细设置</h2>
                  <p>这里调整 transport、分片策略和 chunk 窗口。</p>
                </div>
                <button type="button" class="ghost-button" onClick={() => streamSettingsDialog?.close()}>关闭</button>
              </header>
              <div class="control-grid control-grid--stream">
                <label class="input-card">
                  <span>Preset</span>
                  <select value={selectedStreamPresetId()} onChange={event => handleStreamPresetChange(event.currentTarget.value as StreamPresetId)}>
                    <For each={STREAM_PRESETS}>{preset => <option value={preset.id}>{preset.label}</option>}</For>
                    <option value={CUSTOM_STREAM_PRESET_ID}>Custom</option>
                  </select>
                </label>
                <label class="input-card">
                  <span>Transport</span>
                  <select value={streamTransportMode()} onChange={event => setStreamTransportMode(event.currentTarget.value as StreamTransportMode)}>
                    <option value="readable-stream">ReadableStream</option>
                    <option value="scheduler">Scheduler</option>
                  </select>
                </label>
                <label class="input-card">
                  <span>Slice Mode</span>
                  <select value={streamSliceMode()} onChange={event => setStreamSliceMode(event.currentTarget.value as StreamSliceMode)}>
                    <option value="pure-random">Pure Random</option>
                    <option value="boundary-aware">Boundary Aware</option>
                  </select>
                </label>
                <label class="input-card">
                  <span>chunkSizeMin</span>
                  <input type="number" min="1" max="80" value={streamChunkSizeMin()} onInput={event => setStreamChunkSizeMin(Number(event.currentTarget.value))} />
                </label>
                <label class="input-card">
                  <span>chunkSizeMax</span>
                  <input type="number" min="1" max="80" value={streamChunkSizeMax()} onInput={event => setStreamChunkSizeMax(Number(event.currentTarget.value))} />
                </label>
                <label class="input-card">
                  <span>chunkDelayMin</span>
                  <input type="number" min="8" max="600" value={streamChunkDelayMin()} onInput={event => setStreamChunkDelayMin(Number(event.currentTarget.value))} />
                </label>
                <label class="input-card">
                  <span>chunkDelayMax</span>
                  <input type="number" min="8" max="600" value={streamChunkDelayMax()} onInput={event => setStreamChunkDelayMax(Number(event.currentTarget.value))} />
                </label>
                <label class="input-card">
                  <span>Burstiness (%)</span>
                  <input type="number" min="0" max="100" value={streamBurstiness()} onInput={event => setStreamBurstiness(Number(event.currentTarget.value))} />
                </label>
              </div>
              <p class="control-note">{streamPresetDescription()}</p>
              <p class="control-note">
                Active window:
                {streamChunkRangeLabel()}
                ,
                {streamDelayRangeLabel()}
                . When min=max, the cadence becomes fixed.
              </p>
              <p class="control-note">
                <code>Pure Random</code>
                {' '}
                uses raw random
                {' '}
                <code>slice</code>
                ;
                {' '}
                <code>Boundary Aware</code>
                {' '}
                snaps toward word and punctuation boundaries.
              </p>
            </div>
          </dialog>
        )}
      </div>
    </div>
  )
}
