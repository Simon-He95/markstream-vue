import type { ClipboardEvent as ReactClipboardEvent } from 'react'
import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { TestPageViewMode } from '../../../playground-shared/testPageState'
import type { StreamPresetId } from './streamPresets'
import type { StreamSliceMode, StreamTransportMode } from './useStreamSimulator'
import { NodeRenderer } from 'markstream-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { resolveMarkdownTextareaPaste } from '../../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { buildTestPageHref, decodeMarkdownHash, resolveFrameworkTestHref, resolveTestPageViewMode } from '../../../playground-shared/testPageState'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from './markstreamPlayground'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from './streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from './useStreamSimulator'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId

const CURRENT_FRAMEWORK: FrameworkId = 'react'
const DARK_MODE_KEY = 'vmr-test-dark'

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES

interface TestLabProps {
  frameworkLabel: string
  onGoHome: () => void
}

export function TestLab({ frameworkLabel, onGoHome }: TestLabProps) {
  const streamSettingsDialogRef = useRef<HTMLDialogElement>(null)
  const previewCardRef = useRef<HTMLElement>(null)
  const previewShareTimerRef = useRef<number | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState<SampleId>('baseline')
  const [input, setInput] = useState(sampleCards[0].content)
  const [viewMode, setViewMode] = useState<TestPageViewMode>(() => (
    typeof window === 'undefined' ? 'lab' : resolveTestPageViewMode(window.location.search)
  ))
  const [isDark, setIsDark] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(DARK_MODE_KEY) === 'dark'
  ))
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
  const [isPreviewShareCopied, setIsPreviewShareCopied] = useState(false)
  const [streamChunkSizeMin, setStreamChunkSizeMin] = useState(2)
  const [streamChunkSizeMax, setStreamChunkSizeMax] = useState(7)
  const [streamChunkDelayMin, setStreamChunkDelayMin] = useState(14)
  const [streamChunkDelayMax, setStreamChunkDelayMax] = useState(34)
  const [streamBurstiness, setStreamBurstiness] = useState(35)
  const [streamTransportMode, setStreamTransportMode] = useState<StreamTransportMode>('readable-stream')
  const [streamSliceMode, setStreamSliceMode] = useState<StreamSliceMode>('pure-random')

  const activeSample = sampleCards.find(sample => sample.id === selectedSampleId) ?? sampleCards[0]
  const normalizedChunkSizeRange = useMemo(() => normalizeStreamRange(
    streamChunkSizeMin,
    streamChunkSizeMax,
    1,
    80,
    2,
    7,
  ), [streamChunkSizeMax, streamChunkSizeMin])
  const normalizedChunkDelayRange = useMemo(() => normalizeStreamRange(
    streamChunkDelayMin,
    streamChunkDelayMax,
    8,
    600,
    14,
    34,
  ), [streamChunkDelayMax, streamChunkDelayMin])
  const normalizedBurstiness = useMemo(
    () => Math.round(clampStreamControl(streamBurstiness, 0, 100, 35)),
    [streamBurstiness],
  )
  const {
    content: streamContent,
    isPaused,
    isStreaming,
    lastChunkSize,
    lastDelayMs,
    reset: resetStreamState,
    start: startStreaming,
    stop: stopStreaming,
    togglePause: toggleStreamingPause,
  } = useStreamSimulator({
    source: input,
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    burstiness: normalizedBurstiness / 100,
    sliceMode: streamSliceMode,
    transportMode: streamTransportMode,
  })
  const previewContent = isStreaming ? streamContent : input
  const deferredPreview = useDeferredValue(previewContent)
  const progress = input.length ? Math.min(100, Math.round((previewContent.length / input.length) * 100)) : 0
  const charCount = input.length
  const lineCount = input ? input.split('\n').length : 0
  const activeStreamPreset = useMemo(() => findMatchingStreamPreset({
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    burstiness: normalizedBurstiness,
  }), [normalizedBurstiness, normalizedChunkDelayRange.max, normalizedChunkDelayRange.min, normalizedChunkSizeRange.max, normalizedChunkSizeRange.min])
  const selectedStreamPresetId = activeStreamPreset?.id ?? CUSTOM_STREAM_PRESET_ID
  const streamPresetDescription = activeStreamPreset?.description ?? 'Current values are outside the built-in presets.'
  const streamChunkRangeLabel = `${normalizedChunkSizeRange.min}-${normalizedChunkSizeRange.max} chars`
  const streamDelayRangeLabel = `${normalizedChunkDelayRange.min}-${normalizedChunkDelayRange.max}ms`
  const streamStatusLabel = isStreaming ? (isPaused ? 'Paused' : 'Streaming') : 'Ready'
  const activeStreamPresetLabel = activeStreamPreset?.label ?? 'Custom window'
  const isSharePreviewMode = viewMode === 'preview'
  const showImmersivePreviewControls = isSharePreviewMode || isPreviewFullscreen
  const immersiveBackLabel = isSharePreviewMode ? '打开 Test Page' : '返回编辑'
  const themeToggleLabel = isDark ? '切换浅色' : '切换暗色'

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      setInput(restored)
    setViewMode(resolveTestPageViewMode(window.location.search))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    window.localStorage.setItem(DARK_MODE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    if (typeof document === 'undefined')
      return

    function syncPreviewFullscreenState() {
      setIsPreviewFullscreen(document.fullscreenElement === previewCardRef.current)
    }

    document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncPreviewFullscreenState)
  }, [])

  useEffect(() => () => {
    if (previewShareTimerRef.current != null && typeof window !== 'undefined')
      window.clearTimeout(previewShareTimerRef.current)
  }, [])

  useEffect(() => {
    if (streamChunkSizeMin !== normalizedChunkSizeRange.min)
      setStreamChunkSizeMin(normalizedChunkSizeRange.min)
    if (streamChunkSizeMax !== normalizedChunkSizeRange.max)
      setStreamChunkSizeMax(normalizedChunkSizeRange.max)
  }, [normalizedChunkSizeRange.max, normalizedChunkSizeRange.min, streamChunkSizeMax, streamChunkSizeMin])

  useEffect(() => {
    if (streamChunkDelayMin !== normalizedChunkDelayRange.min)
      setStreamChunkDelayMin(normalizedChunkDelayRange.min)
    if (streamChunkDelayMax !== normalizedChunkDelayRange.max)
      setStreamChunkDelayMax(normalizedChunkDelayRange.max)
  }, [normalizedChunkDelayRange.max, normalizedChunkDelayRange.min, streamChunkDelayMax, streamChunkDelayMin])

  useEffect(() => {
    if (streamBurstiness !== normalizedBurstiness)
      setStreamBurstiness(normalizedBurstiness)
  }, [normalizedBurstiness, streamBurstiness])

  function applySample(id: SampleId) {
    const sample = sampleCards.find(item => item.id === id)
    if (!sample)
      return
    resetStreamState()
    setSelectedSampleId(sample.id)
    setInput(sample.content)
  }

  function toggleStream() {
    if (isStreaming) {
      stopStreaming()
      return
    }
    startStreaming()
  }

  function resetEditor() {
    applySample(selectedSampleId)
  }

  function clearEditor() {
    resetStreamState()
    setInput('')
    setIsPreviewShareCopied(false)
  }

  function handleEditorPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget
    const pasted = event.clipboardData.getData('text/plain')
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

  function frameworkHref(id: FrameworkId) {
    const framework = frameworkCards.find(item => item.id === id)
    if (!framework)
      return '/test'
    return resolveFrameworkTestHref(
      framework,
      CURRENT_FRAMEWORK,
      input,
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

  function toggleAppearance() {
    setIsDark(previous => !previous)
  }

  async function copyPreviewShareLink() {
    if (typeof window === 'undefined')
      return

    const target = buildTestPageHref(currentBasePageUrl(), input, 'preview')
    await navigator.clipboard.writeText(target)
    setIsPreviewShareCopied(true)

    if (previewShareTimerRef.current != null)
      window.clearTimeout(previewShareTimerRef.current)

    previewShareTimerRef.current = window.setTimeout(() => {
      setIsPreviewShareCopied(false)
    }, 1800)
  }

  async function togglePreviewFullscreen() {
    if (typeof document === 'undefined')
      return

    const previewCard = previewCardRef.current
    if (!previewCard)
      return

    if (document.fullscreenElement === previewCard) {
      if (document.exitFullscreen)
        await document.exitFullscreen()
      return
    }

    if (previewCard.requestFullscreen)
      await previewCard.requestFullscreen()
  }

  function returnToEditableTestPage() {
    if (isSharePreviewMode) {
      window.location.href = buildTestPageHref(currentBasePageUrl(), input, 'lab')
      return
    }

    if (typeof document !== 'undefined' && document.fullscreenElement === previewCardRef.current && document.exitFullscreen)
      void document.exitFullscreen()
  }

  function openStreamSettingsDialog() {
    if (!streamSettingsDialogRef.current)
      return
    if (!streamSettingsDialogRef.current.open)
      streamSettingsDialogRef.current.showModal()
  }

  function closeStreamSettingsDialog() {
    if (streamSettingsDialogRef.current?.open)
      streamSettingsDialogRef.current.close()
  }

  return (
    <div className={`test-lab ${isDark ? 'test-lab--dark dark' : ''} ${isSharePreviewMode ? 'test-lab--share-preview' : ''}`}>
      {!isSharePreviewMode && <div className="test-lab__glow test-lab__glow--cyan" />}
      {!isSharePreviewMode && <div className="test-lab__glow test-lab__glow--amber" />}

      <div className={`test-lab__shell ${isSharePreviewMode ? 'test-lab__shell--share-preview' : ''}`}>
        {!isSharePreviewMode && (
          <section className="hero-panel">
            <div className="hero-panel__copy">
              <span className="eyebrow">
                {frameworkLabel}
                {' '}
                Regression Lab
              </span>
              <h1>markstream-react /test</h1>
              <p>专门用来和 Vue 3、Vue 2、Angular 的 test page 做对照，快速定位框架层差异。</p>
            </div>

            <div className="hero-panel__actions">
              <div className="hero-panel__status-row">
                <span className="mini-pill">{frameworkLabel}</span>
                <span className={`mini-pill ${isStreaming ? 'mini-pill--active' : ''}`}>{streamStatusLabel}</span>
                <span className="mini-pill">{activeStreamPresetLabel}</span>
              </div>

              <div className="hero-panel__metrics">
                <div className="metric-card">
                  <span>当前框架</span>
                  <strong>{frameworkLabel}</strong>
                </div>
                <div className="metric-card">
                  <span>字符数</span>
                  <strong>{charCount}</strong>
                </div>
                <div className="metric-card">
                  <span>行数</span>
                  <strong>{lineCount}</strong>
                </div>
                <div className="metric-card">
                  <span>进度</span>
                  <strong>
                    {progress}
                    %
                  </strong>
                </div>
              </div>
            </div>

            <div className="framework-switcher">
              {frameworkCards.map(framework => (
                <a
                  key={framework.id}
                  className={`framework-chip ${framework.id === CURRENT_FRAMEWORK ? 'framework-chip--current' : ''}`}
                  href={frameworkHref(framework.id)}
                >
                  <span className="framework-chip__label">{framework.label}</span>
                  <span className="framework-chip__note">{framework.note}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <div className={`lab-layout ${isSharePreviewMode ? 'lab-layout--share-preview' : ''}`}>
          {!isSharePreviewMode && (
            <section className="panel-card panel-card--samples">
              <div className="panel-card__head">
                <div>
                  <h2>样例</h2>
                  <p>同一段输入，切到别的框架继续比。</p>
                </div>
                <span className="mini-pill">{activeSample.title}</span>
              </div>

              <div className="sample-list">
                {sampleCards.map(sample => (
                  <button
                    key={sample.id}
                    type="button"
                    className={`sample-card ${sample.id === selectedSampleId ? 'sample-card--active' : ''}`}
                    onClick={() => applySample(sample.id)}
                  >
                    <strong>{sample.title}</strong>
                    <span>{sample.summary}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!isSharePreviewMode && (
            <section className="panel-card panel-card--stream">
              <div className="panel-card__head">
                <div>
                  <h2>流式控制</h2>
                  <p>主卡片只保留节奏摘要，详细参数放到更多设置里。</p>
                </div>
                <button type="button" className="ghost-button" onClick={openStreamSettingsDialog}>
                  更多设置
                </button>
              </div>

              <div className="stream-summary">
                <div className="stream-summary__row">
                  <span className="mini-pill mini-pill--active">{activeStreamPresetLabel}</span>
                  <span className="mini-pill">{streamTransportMode === 'readable-stream' ? 'ReadableStream' : 'Scheduler'}</span>
                  <span className="mini-pill">{streamSliceMode === 'boundary-aware' ? 'Boundary Aware' : 'Pure Random'}</span>
                  <span className={`mini-pill ${isStreaming ? 'mini-pill--active' : ''}`}>{streamStatusLabel}</span>
                </div>

                <div className="stream-summary__row stream-summary__row--dense">
                  <span className="stream-summary__item">
                    Chunk
                    {' '}
                    {streamChunkRangeLabel}
                  </span>
                  <span className="stream-summary__item">
                    Delay
                    {' '}
                    {streamDelayRangeLabel}
                  </span>
                  <span className="stream-summary__item">
                    Burst
                    {' '}
                    {normalizedBurstiness}
                    %
                  </span>
                  <span className={`stream-summary__item ${isPaused ? 'stream-summary__item--active' : ''}`}>
                    {isPaused ? '已暂停' : '连续输出'}
                  </span>
                </div>
              </div>

              <div className="button-grid">
                <button type="button" className="testlab-btn testlab-btn--primary" onClick={toggleStream}>
                  {isStreaming ? '停止流式渲染' : '开始流式渲染'}
                </button>
                <button type="button" className="testlab-btn" disabled={!isStreaming} onClick={toggleStreamingPause}>
                  {isPaused ? '继续流式渲染' : '暂停流式渲染'}
                </button>
                <button type="button" className="testlab-btn" onClick={resetEditor}>
                  重置样例
                </button>
                <button type="button" className="testlab-btn" onClick={clearEditor}>
                  清空输入
                </button>
                <button type="button" className="testlab-btn" onClick={onGoHome}>
                  返回主 demo
                </button>
              </div>

              <div className="progress-block">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-meta">
                  <span>
                    {previewContent.length}
                    {' '}
                    /
                    {' '}
                    {input.length || 0}
                  </span>
                  <span>
                    {isStreaming ? `${lastChunkSize} chars / ${lastDelayMs}ms` : 'Static preview'}
                  </span>
                </div>
              </div>
            </section>
          )}

          <section className={`workspace-grid ${isSharePreviewMode ? 'workspace-grid--share-preview' : ''}`}>
            {!isSharePreviewMode && (
              <article className="workspace-card workspace-card--pane workspace-card--editor">
                <header className="workspace-card__head">
                  <div>
                    <h2>Markdown 输入</h2>
                    <p>把 markdown 粘进来，右侧立即对照 React 渲染结果。</p>
                  </div>
                  <span className="mini-pill">Live editor</span>
                </header>

                <textarea
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onPaste={handleEditorPaste}
                  className="editor-textarea"
                  spellCheck={false}
                  placeholder="Paste markdown here..."
                />

                <footer className="workspace-card__foot">
                  <span>可直接粘贴 issue 复现内容</span>
                  <span>
                    {charCount}
                    {' '}
                    chars
                  </span>
                </footer>
              </article>
            )}

            <article
              ref={previewCardRef}
              className={`workspace-card workspace-card--pane workspace-card--preview ${isSharePreviewMode ? 'workspace-card--share-preview' : ''}`}
            >
              {showImmersivePreviewControls && (
                <div className="preview-immersive-shell">
                  <div className="preview-immersive-toolbar">
                    <button type="button" className="ghost-button preview-immersive-toolbar__button" onClick={returnToEditableTestPage}>
                      {immersiveBackLabel}
                    </button>
                    <button type="button" className="ghost-button preview-immersive-toolbar__button" onClick={toggleAppearance}>
                      {themeToggleLabel}
                    </button>
                    {!isSharePreviewMode && (
                      <button type="button" className="ghost-button preview-immersive-toolbar__button" onClick={() => void togglePreviewFullscreen()}>
                        {isPreviewFullscreen ? '退出全屏' : '全屏预览'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!isSharePreviewMode && (
                <header className="workspace-card__head">
                  <div>
                    <h2>实时预览</h2>
                    <p>{`${isStreaming ? (isPaused ? '流式已暂停' : 'Streaming 中') : '已显示完整输入'}${isPreviewFullscreen ? ' · 按 Esc 退出全屏' : ''}`}</p>
                  </div>
                  <div className="workspace-card__head-actions">
                    <button type="button" className="ghost-button" onClick={toggleAppearance}>
                      {themeToggleLabel}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => void copyPreviewShareLink()}>
                      {isPreviewShareCopied ? '已复制预览链接' : '复制预览链接'}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => void togglePreviewFullscreen()}>
                      {isPreviewFullscreen ? '退出全屏' : '全屏预览'}
                    </button>
                    <span className={`mini-pill ${isStreaming ? 'mini-pill--active' : ''}`}>{streamStatusLabel}</span>
                  </div>
                </header>
              )}

              <div className="preview-surface">
                <NodeRenderer
                  content={deferredPreview}
                  final={!isStreaming}
                  typewriter={false}
                  codeBlockStream
                  isDark={isDark}
                  customId={PLAYGROUND_CUSTOM_ID}
                  customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                  codeBlockDarkTheme="vitesse-dark"
                  codeBlockLightTheme="vitesse-light"
                  renderCodeBlocksAsPre={false}
                />
              </div>

              {!isSharePreviewMode && (
                <footer className="workspace-card__foot">
                  <span>
                    {deferredPreview.length}
                    {' '}
                    /
                    {' '}
                    {input.length || 0}
                  </span>
                  <span>
                    {isStreaming ? `${streamTransportMode} · ${lastChunkSize} chars / ${lastDelayMs}ms` : 'React renderer'}
                  </span>
                </footer>
              )}
            </article>
          </section>
        </div>

        {!isSharePreviewMode && (
          <dialog ref={streamSettingsDialogRef} className="settings-dialog">
            <div className="settings-dialog__panel">
              <header className="settings-dialog__head">
                <div>
                  <h2>流式详细设置</h2>
                  <p>这里调整 transport、分片策略和 chunk 窗口。</p>
                </div>
                <button type="button" className="ghost-button" onClick={closeStreamSettingsDialog}>
                  关闭
                </button>
              </header>

              <div className="control-grid control-grid--stream">
                <label className="input-card">
                  <span>Preset</span>
                  <select
                    value={selectedStreamPresetId}
                    onChange={event => handleStreamPresetChange(event.target.value as StreamPresetId)}
                  >
                    {STREAM_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value={CUSTOM_STREAM_PRESET_ID}>Custom</option>
                  </select>
                </label>
                <label className="input-card">
                  <span>Transport</span>
                  <select
                    value={streamTransportMode}
                    onChange={event => setStreamTransportMode(event.target.value as StreamTransportMode)}
                  >
                    <option value="readable-stream">ReadableStream</option>
                    <option value="scheduler">Scheduler</option>
                  </select>
                </label>
                <label className="input-card">
                  <span>Slice Mode</span>
                  <select
                    value={streamSliceMode}
                    onChange={event => setStreamSliceMode(event.target.value as StreamSliceMode)}
                  >
                    <option value="pure-random">Pure Random</option>
                    <option value="boundary-aware">Boundary Aware</option>
                  </select>
                </label>
                <label className="input-card">
                  <span>chunkSizeMin</span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={streamChunkSizeMin}
                    onChange={event => setStreamChunkSizeMin(Number(event.target.value))}
                  />
                </label>
                <label className="input-card">
                  <span>chunkSizeMax</span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={streamChunkSizeMax}
                    onChange={event => setStreamChunkSizeMax(Number(event.target.value))}
                  />
                </label>
                <label className="input-card">
                  <span>chunkDelayMin</span>
                  <input
                    type="number"
                    min={8}
                    max={600}
                    value={streamChunkDelayMin}
                    onChange={event => setStreamChunkDelayMin(Number(event.target.value))}
                  />
                </label>
                <label className="input-card">
                  <span>chunkDelayMax</span>
                  <input
                    type="number"
                    min={8}
                    max={600}
                    value={streamChunkDelayMax}
                    onChange={event => setStreamChunkDelayMax(Number(event.target.value))}
                  />
                </label>
                <label className="input-card">
                  <span>Burstiness (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={streamBurstiness}
                    onChange={event => setStreamBurstiness(Number(event.target.value))}
                  />
                </label>
              </div>

              <p className="control-note">{streamPresetDescription}</p>
              <p className="control-note">
                Active window:
                {' '}
                {streamChunkRangeLabel}
                ,
                {' '}
                {streamDelayRangeLabel}
                . When min=max, the cadence becomes fixed.
              </p>
              <p className="control-note">
                <code>Pure Random</code>
                {' '}
                uses raw random
                <code>slice</code>
                ;
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
