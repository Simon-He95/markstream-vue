<script lang="ts">
  import MarkdownRender, {
    disableKatex,
    disableMermaid,
    enableKatex,
    enableMermaid,
    MarkdownCodeBlockNode,
    preloadCodeBlockRuntime,
    setCustomComponents,
    setKaTeXWorker,
    setMermaidWorker,
  } from 'markstream-svelte'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'
  import { onDestroy, onMount, tick } from 'svelte'
  import { streamContent } from '../../playground/src/const/markdown'
  import { TEST_LAB_SAMPLES } from '../../playground-shared/testLabFixtures'
  import ThinkingNode from './components/ThinkingNode.svelte'

  const PLAYGROUND_CUSTOM_ID = 'playground-demo'
  const PLAYGROUND_CUSTOM_HTML_TAGS = ['thinking'] as const
  const themes = [
    'andromeeda',
    'aurora-x',
    'ayu-dark',
    'catppuccin-frappe',
    'catppuccin-latte',
    'catppuccin-macchiato',
    'catppuccin-mocha',
    'dark-plus',
    'dracula',
    'github-dark',
    'github-light',
    'gruvbox-dark-medium',
    'gruvbox-light-medium',
    'material-theme',
    'min-dark',
    'min-light',
    'monokai',
    'night-owl',
    'one-dark-pro',
    'one-light',
    'rose-pine',
    'rose-pine-dawn',
    'tokyo-night',
    'vitesse-dark',
    'vitesse-light',
  ]

  const diffHideUnchangedRegions = {
    enabled: true,
    contextLineCount: 2,
    minimumLineCount: 4,
    revealLineCount: 5,
  } as const
  const playgroundMonacoOptions = {
    renderSideBySide: false,
    useInlineViewWhenSpaceIsLimited: true,
    maxComputationTime: 0,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    diffAlgorithm: 'legacy',
    diffHideUnchangedRegions,
    hideUnchangedRegions: diffHideUnchangedRegions,
  } as const

  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
  if (typeof window !== 'undefined')
    void preloadCodeBlockRuntime()
  setCustomComponents(PLAYGROUND_CUSTOM_ID, {
    thinking: ThinkingNode,
  })

  let currentPath = normalizePath(window.location.pathname)
  let content = ''
  let isDark = window.localStorage.getItem('vueuse-color-scheme') === 'dark'
    || (window.localStorage.getItem('vueuse-color-scheme') == null && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  let selectedTheme = window.localStorage.getItem('vmr-settings-selected-theme') || 'vitesse-dark'
  let chunkSizeMin = Number(window.localStorage.getItem('vmr-settings-stream-chunk-size-min') || 2)
  let chunkSizeMax = Number(window.localStorage.getItem('vmr-settings-stream-chunk-size-max') || 7)
  let chunkDelayMin = Number(window.localStorage.getItem('vmr-settings-stream-delay-min') || 14)
  let chunkDelayMax = Number(window.localStorage.getItem('vmr-settings-stream-delay-max') || 34)
  let burstiness = Number(window.localStorage.getItem('vmr-settings-stream-burstiness') || 35)
  let isStreaming = false
  let isPaused = false
  let timer: number | null = null
  let cursor = 0
  let sampleId = window.localStorage.getItem('vmr-test-sample') || TEST_LAB_SAMPLES[0].id
  let testInput = (TEST_LAB_SAMPLES.find(sample => sample.id === sampleId) || TEST_LAB_SAMPLES[0]).content
  let testStreamContent = ''
  let testCursor = 0
  let testTimer: number | null = null
  let isTestStreaming = false
  let isTestPaused = false
  let renderMode = (window.localStorage.getItem('vmr-test-render-mode') || 'monaco') as 'monaco' | 'markdown' | 'pre'
  let codeBlockStream = window.localStorage.getItem('vmr-test-code-stream') !== 'false'
  let viewportPriority = window.localStorage.getItem('vmr-test-viewport-priority') !== 'false'
  let batchRendering = window.localStorage.getItem('vmr-test-batch-rendering') !== 'false'
  let typewriter = window.localStorage.getItem('vmr-test-typewriter') !== 'false'
  let mathEnabled = window.localStorage.getItem('vmr-test-math-enabled') !== 'false'
  let mermaidEnabled = window.localStorage.getItem('vmr-test-mermaid-enabled') !== 'false'
  let messagesContainer: HTMLElement | null = null
  let roContainer: ResizeObserver | null = null
  let roContent: ResizeObserver | null = null
  let moMessages: MutationObserver | null = null
  let minHeightCheckScheduled = false
  let minHeightDisabled = false
  let overflowConfirmations = 0
  let clearConfirmations = 0
  let previousContentLength = 0
  let homepagePinnedToBottom = true
  let homepageProgrammaticScroll = false
  let homepageAutoScrollFrame: number | null = null
  let homepageAutoScrollFollowupFrame: number | null = null
  const markdownModeComponents = { code_block: MarkdownCodeBlockNode }
  $: activeSample = TEST_LAB_SAMPLES.find(sample => sample.id === sampleId) || TEST_LAB_SAMPLES[0]
  $: testPreviewContent = isTestStreaming ? testStreamContent : testInput
  $: testStreamProgress = testInput.length ? Math.min(100, Math.round((testPreviewContent.length / testInput.length) * 100)) : 0
  $: document.documentElement.classList.toggle('dark', isDark)
  $: window.localStorage.setItem('vueuse-color-scheme', isDark ? 'dark' : 'light')
  $: window.localStorage.setItem('vmr-settings-selected-theme', selectedTheme)
  $: window.localStorage.setItem('vmr-test-render-mode', renderMode)
  $: window.localStorage.setItem('vmr-test-code-stream', String(codeBlockStream))
  $: window.localStorage.setItem('vmr-test-viewport-priority', String(viewportPriority))
  $: window.localStorage.setItem('vmr-test-batch-rendering', String(batchRendering))
  $: window.localStorage.setItem('vmr-test-typewriter', String(typewriter))
  $: window.localStorage.setItem('vmr-test-math-enabled', String(mathEnabled))
  $: window.localStorage.setItem('vmr-test-mermaid-enabled', String(mermaidEnabled))
  $: mathEnabled ? enableKatex() : disableKatex()
  $: mermaidEnabled ? enableMermaid() : disableMermaid()
  $: streamChunkRangeLabel = Math.min(chunkSizeMin, chunkSizeMax) + '-' + Math.max(chunkSizeMin, chunkSizeMax)
  $: streamDelayRangeLabel = Math.min(chunkDelayMin, chunkDelayMax) + '-' + Math.max(chunkDelayMin, chunkDelayMax) + 'ms'
  $: currentTitle = currentPath === '/test' ? 'markstream-svelte test lab' : 'markstream-svelte'
  $: renderModeLabel = renderMode === 'markdown' ? 'MarkdownCodeBlock' : renderMode === 'pre' ? 'PreCodeNode' : 'Monaco'
  $: activeRenderModeLabel = currentPath === '/test' ? renderModeLabel : 'Monaco'
  $: if (currentPath !== '/test' && content.length !== previousContentLength) {
    previousContentLength = content.length
    const shouldStickToBottom = homepagePinnedToBottom || isHomepageAtBottom()
    homepagePinnedToBottom = shouldStickToBottom
    tick().then(() => {
      scheduleCheckMinHeight()
      scheduleHomepageAutoScroll(shouldStickToBottom)
    })
  }

  onMount(() => {
    window.addEventListener('popstate', syncPath)
    window.addEventListener('scroll', updateHomepagePinnedState, { passive: true })
    window.addEventListener('wheel', handleHomepageWheel, { passive: true })
    if (currentPath !== '/test') {
      startStream()
      tick().then(observeHomepageMessages)
    }
    return () => {
      window.removeEventListener('popstate', syncPath)
      window.removeEventListener('scroll', updateHomepagePinnedState)
      window.removeEventListener('wheel', handleHomepageWheel)
    }
  })

  onDestroy(() => {
    stopStream()
    stopTestStream()
    disconnectHomepageObservers()
    cancelHomepageAutoScroll()
  })

  function normalizePath(pathname: string) {
    const normalized = pathname.replace(/\/+$/, '')
    return normalized || '/'
  }

  function syncPath() {
    currentPath = normalizePath(window.location.pathname)
    if (currentPath === '/test') {
      stopStream()
      disconnectHomepageObservers()
      cancelHomepageAutoScroll()
    }
    else {
      homepagePinnedToBottom = true
      tick().then(observeHomepageMessages)
    }
    if (currentPath !== '/test' && !isStreaming)
      startStream()
  }

  function navigate(pathname: string) {
    const next = normalizePath(pathname)
    if (next !== normalizePath(window.location.pathname))
      window.history.pushState({}, '', next)
    syncPath()
  }

  function randomBetween(min: number, max: number) {
    const lo = Math.min(min, max)
    const hi = Math.max(min, max)
    return Math.round(lo + Math.random() * (hi - lo))
  }

  function startStream() {
    stopStream()
    resetHomepageMinHeightState()
    cancelHomepageAutoScroll()
    homepagePinnedToBottom = true
    content = ''
    cursor = 0
    isPaused = false
    isStreaming = true
    scheduleNextChunk()
    tick().then(observeHomepageMessages)
  }

  function stopStream() {
    if (timer != null)
      window.clearTimeout(timer)
    timer = null
    isStreaming = false
  }

  function stopTestStream() {
    if (testTimer != null)
      window.clearTimeout(testTimer)
    testTimer = null
    isTestStreaming = false
    isTestPaused = false
  }

  function scheduleNextChunk() {
    if (!isStreaming || isPaused)
      return
    if (cursor >= streamContent.length) {
      isStreaming = false
      timer = null
      return
    }
    const burst = Math.random() < burstiness / 100 ? 2 : 1
    const size = randomBetween(chunkSizeMin, chunkSizeMax) * burst
    content += streamContent.slice(cursor, cursor + size)
    cursor += size
    timer = window.setTimeout(scheduleNextChunk, randomBetween(chunkDelayMin, chunkDelayMax))
  }

  function togglePause() {
    if (!isStreaming)
      return
    isPaused = !isPaused
    if (!isPaused)
      scheduleNextChunk()
  }

  function applySelectedSample() {
    const nextSample = TEST_LAB_SAMPLES.find(sample => sample.id === sampleId) || TEST_LAB_SAMPLES[0]
    stopTestStream()
    testInput = nextSample.content
    window.localStorage.setItem('vmr-test-sample', sampleId)
  }

  function chooseSample(id: string) {
    sampleId = id
    applySelectedSample()
  }

  function startTestStream() {
    if (isTestStreaming) {
      stopTestStream()
      return
    }
    testStreamContent = ''
    testCursor = 0
    isTestPaused = false
    isTestStreaming = true
    scheduleNextTestChunk()
  }

  function scheduleNextTestChunk() {
    if (!isTestStreaming || isTestPaused)
      return
    if (testCursor >= testInput.length) {
      isTestStreaming = false
      testTimer = null
      return
    }
    const burst = Math.random() < burstiness / 100 ? 2 : 1
    const size = randomBetween(chunkSizeMin, chunkSizeMax) * burst
    testStreamContent += testInput.slice(testCursor, testCursor + size)
    testCursor += size
    testTimer = window.setTimeout(scheduleNextTestChunk, randomBetween(chunkDelayMin, chunkDelayMax))
  }

  function toggleTestPause() {
    if (!isTestStreaming)
      return
    isTestPaused = !isTestPaused
    if (!isTestPaused)
      scheduleNextTestChunk()
  }

  function resetTestInput() {
    stopTestStream()
    testInput = activeSample.content
  }

  function clearTestInput() {
    stopTestStream()
    testInput = ''
  }

  function resetHomepageMinHeightState() {
    minHeightDisabled = false
    overflowConfirmations = 0
    clearConfirmations = 0
    messagesContainer?.classList.remove('disable-min-height')
  }

  function isHomepageAtBottom(threshold = 64) {
    const scrollRoot = document.scrollingElement
    if (!scrollRoot)
      return true
    return scrollRoot.scrollHeight - scrollRoot.clientHeight - scrollRoot.scrollTop <= threshold
  }

  function updateHomepagePinnedState() {
    if (currentPath === '/test')
      return
    if (homepageProgrammaticScroll) {
      if (isHomepageAtBottom(256)) {
        homepagePinnedToBottom = true
        return
      }
      homepageProgrammaticScroll = false
    }
    homepagePinnedToBottom = isHomepageAtBottom()
  }

  function handleHomepageWheel(event: WheelEvent) {
    if (currentPath === '/test' || event.deltaY >= 0)
      return
    homepageProgrammaticScroll = false
    homepagePinnedToBottom = false
    cancelHomepageAutoScroll()
  }

  function applyHomepageAutoScroll() {
    if (!homepagePinnedToBottom || currentPath === '/test')
      return
    const scrollRoot = document.scrollingElement
    if (!scrollRoot)
      return
    homepageProgrammaticScroll = true
    scrollRoot.scrollTop = scrollRoot.scrollHeight
    homepagePinnedToBottom = true
    window.requestAnimationFrame(() => {
      homepageProgrammaticScroll = false
    })
  }

  function cancelHomepageAutoScroll() {
    if (homepageAutoScrollFrame != null)
      window.cancelAnimationFrame(homepageAutoScrollFrame)
    if (homepageAutoScrollFollowupFrame != null)
      window.cancelAnimationFrame(homepageAutoScrollFollowupFrame)
    homepageAutoScrollFrame = null
    homepageAutoScrollFollowupFrame = null
  }

  function scheduleHomepageAutoScroll(shouldStickToBottom: boolean) {
    if (!shouldStickToBottom || currentPath === '/test')
      return
    if (homepageAutoScrollFrame != null || homepageAutoScrollFollowupFrame != null)
      return
    homepageAutoScrollFrame = window.requestAnimationFrame(() => {
      homepageAutoScrollFrame = null
      applyHomepageAutoScroll()
      homepageAutoScrollFollowupFrame = window.requestAnimationFrame(() => {
        homepageAutoScrollFollowupFrame = null
        applyHomepageAutoScroll()
      })
    })
  }

  function disconnectHomepageObservers() {
    roContainer?.disconnect()
    roContent?.disconnect()
    moMessages?.disconnect()
    roContainer = null
    roContent = null
    moMessages = null
    minHeightCheckScheduled = false
  }

  function scheduleCheckMinHeight() {
    if (minHeightCheckScheduled)
      return
    minHeightCheckScheduled = true
    requestAnimationFrame(() => {
      minHeightCheckScheduled = false
      const container = messagesContainer
      if (!container || currentPath === '/test')
        return

      const requiredOverflowConfirmations = 2
      const requiredClearConfirmations = 3
      const hadClass = container.classList.contains('disable-min-height')

      if (minHeightDisabled || hadClass) {
        container.classList.add('disable-min-height')
        const shouldKeep = container.scrollHeight - container.clientHeight > 1
        if (shouldKeep) {
          clearConfirmations = 0
          minHeightDisabled = true
        }
        else {
          clearConfirmations += 1
          if (clearConfirmations >= requiredClearConfirmations) {
            minHeightDisabled = false
            overflowConfirmations = 0
            container.classList.remove('disable-min-height')
          }
        }
        return
      }

      container.classList.add('disable-min-height')
      const hasOverflow = container.scrollHeight - container.clientHeight > 1
      if (hasOverflow)
        overflowConfirmations += 1
      else
        overflowConfirmations = 0

      if (overflowConfirmations >= requiredOverflowConfirmations) {
        minHeightDisabled = true
        clearConfirmations = 0
        disconnectHomepageObservers()
        container.classList.add('disable-min-height')
      }
      else {
        container.classList.remove('disable-min-height')
      }
    })
  }

  function observeHomepageMessages() {
    const container = messagesContainer
    if (!container || currentPath === '/test')
      return

    disconnectHomepageObservers()
    const scheduleLayoutRefresh = () => {
      scheduleCheckMinHeight()
      scheduleHomepageAutoScroll(homepagePinnedToBottom)
    }
    requestAnimationFrame(scheduleLayoutRefresh)

    roContainer = new ResizeObserver(scheduleLayoutRefresh)
    roContainer.observe(container)

    const tryObserveContent = () => {
      const renderer = Array.from(container.children).find(child =>
        (child as HTMLElement).classList?.contains('markdown-renderer'),
      ) as HTMLElement | undefined
      if (!renderer)
        return
      roContent?.disconnect()
      roContent = new ResizeObserver(scheduleLayoutRefresh)
      roContent.observe(renderer)
    }

    tryObserveContent()
    moMessages = new MutationObserver(() => {
      tryObserveContent()
      scheduleLayoutRefresh()
    })
    moMessages.observe(container, { childList: true, subtree: true })
  }
</script>

<div class:dark={isDark} class="playground-root playground-shell">
  <div class="playground-bg">
    <div class="playground-bg__orb playground-bg__orb--1"></div>
    <div class="playground-bg__orb playground-bg__orb--2"></div>
    <div class="playground-bg__orb playground-bg__orb--3"></div>
  </div>

  <aside class="settings-panel settings-sidebar settings-sidebar--docked">
    <div class="settings-sidebar__header">
      <span class="settings-sidebar__title">Controls</span>
    </div>

    <div class="setting-group">
      <label class="setting-label" for="code-theme">Code Theme</label>
      <select id="code-theme" class="setting-select" bind:value={selectedTheme}>
        {#each themes as theme}
          <option value={theme}>{theme}</option>
        {/each}
      </select>
    </div>

    <div class="setting-group">
      <span class="setting-label">Chunk Size</span>
      <div class="setting-slider-row">
        <span class="setting-slider-label">Min</span>
        <input class="setting-slider" type="range" min="1" max="24" bind:value={chunkSizeMin} />
        <span class="setting-slider-value">{Math.min(chunkSizeMin, chunkSizeMax)}</span>
      </div>
      <div class="setting-slider-row">
        <span class="setting-slider-label">Max</span>
        <input class="setting-slider" type="range" min="1" max="24" bind:value={chunkSizeMax} />
        <span class="setting-slider-value">{Math.max(chunkSizeMin, chunkSizeMax)}</span>
      </div>
    </div>

    <div class="setting-group">
      <span class="setting-label">Chunk Delay</span>
      <div class="setting-slider-row">
        <span class="setting-slider-label">Min</span>
        <input class="setting-slider" type="range" min="8" max="240" step="4" bind:value={chunkDelayMin} />
        <span class="setting-slider-value">{Math.min(chunkDelayMin, chunkDelayMax)}ms</span>
      </div>
      <div class="setting-slider-row">
        <span class="setting-slider-label">Max</span>
        <input class="setting-slider" type="range" min="8" max="240" step="4" bind:value={chunkDelayMax} />
        <span class="setting-slider-value">{Math.max(chunkDelayMin, chunkDelayMax)}ms</span>
      </div>
    </div>

    <div class="setting-group">
      <span class="setting-label">Burstiness</span>
      <div class="setting-slider-row">
        <input class="setting-slider" type="range" min="0" max="100" bind:value={burstiness} />
        <span class="setting-slider-value">{burstiness}%</span>
      </div>
      <p class="setting-hint">Window: {streamChunkRangeLabel} chars / {streamDelayRangeLabel}</p>
    </div>

    <div class="settings-divider"></div>

    <div class="setting-row-inline">
      <span class="setting-label">Dark Mode</span>
      <button type="button" class:theme-toggle--dark={isDark} class="theme-toggle" aria-label="Toggle dark mode" onclick={() => (isDark = !isDark)}>
        <span class="theme-toggle__thumb"></span>
      </button>
    </div>
  </aside>

  {#if currentPath === '/test'}
    <main class="chat-shell chat-shell--test">
      <header class="chat-header chat-header--test">
        <div class="chat-header__brand">
          <div class="chat-header__info">
            <h1 class="chat-header__title">{currentTitle}</h1>
            <p class="chat-header__subtitle">Streaming Markdown Renderer</p>
            <div class="chat-header__meta">
              <span class:chat-header__meta-pill--active={isTestStreaming} class="chat-header__meta-pill">{isTestStreaming ? (isTestPaused ? 'Paused' : 'Streaming') : 'Ready'}</span>
              <span class="chat-header__meta-pill">{selectedTheme}</span>
              <span class="chat-header__meta-pill">{activeRenderModeLabel}</span>
            </div>
          </div>
        </div>
        <nav class="chat-header__nav">
          <a href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noreferrer" class="nav-btn nav-btn--github">GitHub</a>
          <button type="button" class="nav-btn nav-btn--docs" onclick={() => navigate('/')}>Home</button>
          <button type="button" class="nav-btn nav-btn--test" onclick={() => navigate('/test')}>Test</button>
        </nav>
      </header>
      <section class="test-lab">
        <div class="workspace-card workspace-card--editor">
          <div class="workspace-card__head">
            <div>
              <h2>Markdown 输入</h2>
              <p>{activeSample.summary}</p>
            </div>
            <span class="mini-pill">{renderModeLabel}</span>
          </div>

          <label class="field">
            Sample
            <select bind:value={sampleId} onchange={applySelectedSample}>
              {#each TEST_LAB_SAMPLES as sample}
                <option value={sample.id}>{sample.title}</option>
              {/each}
            </select>
          </label>

          <div class="sample-list">
            {#each TEST_LAB_SAMPLES as sample}
              <button type="button" class:sample-card--active={sample.id === sampleId} class="sample-card" onclick={() => chooseSample(sample.id)}>
                <strong>{sample.title}</strong>
                <span>{sample.summary}</span>
              </button>
            {/each}
          </div>

          <div class="control-grid">
            <label class="field">
              Render
              <select bind:value={renderMode}>
                <option value="monaco">Monaco</option>
                <option value="markdown">MarkdownCodeBlock</option>
                <option value="pre">PreCodeNode</option>
              </select>
            </label>
            <label class="toggle-item"><input type="checkbox" bind:checked={codeBlockStream} /> Code stream</label>
            <label class="toggle-item"><input type="checkbox" bind:checked={viewportPriority} /> viewportPriority</label>
            <label class="toggle-item"><input type="checkbox" bind:checked={batchRendering} /> batchRendering</label>
            <label class="toggle-item"><input type="checkbox" bind:checked={typewriter} /> typewriter</label>
            <label class="toggle-item"><input type="checkbox" bind:checked={mathEnabled} /> KaTeX</label>
            <label class="toggle-item"><input type="checkbox" bind:checked={mermaidEnabled} /> Mermaid</label>
          </div>

          <div class="control-actions">
            <button type="button" class="action-button action-button--primary" onclick={startTestStream}>{isTestStreaming ? '停止流式渲染' : '开始流式渲染'}</button>
            <button type="button" class="action-button" disabled={!isTestStreaming} onclick={toggleTestPause}>{isTestPaused ? '继续流式渲染' : '暂停流式渲染'}</button>
            <button type="button" class="action-button" onclick={resetTestInput}>重置样例</button>
            <button type="button" class="action-button" onclick={clearTestInput}>清空输入</button>
          </div>

          <div class="progress-block">
            <div class="progress-track"><div class="progress-fill" style={`width: ${testStreamProgress}%`}></div></div>
            <div class="progress-meta">
              <span>{testPreviewContent.length} / {testInput.length || 0}</span>
              <span>{isTestStreaming ? 'Streaming' : 'Static preview'}</span>
            </div>
          </div>

          <textarea bind:value={testInput} spellcheck="false"></textarea>
        </div>
        <div class="workspace-card workspace-card--preview">
          <div class="workspace-card__head">
            <div>
              <h2>Preview</h2>
              <p>Svelte renderer output</p>
            </div>
            <span class="mini-pill">{testStreamProgress}%</span>
          </div>
          <div class="preview-surface">
            <MarkdownRender
              content={testPreviewContent}
              final={!isTestStreaming}
              codeBlockStream={codeBlockStream}
              codeBlockDarkTheme={selectedTheme}
              codeBlockLightTheme={selectedTheme}
              codeBlockMonacoOptions={playgroundMonacoOptions}
              renderCodeBlocksAsPre={renderMode === 'pre'}
              customComponents={renderMode === 'markdown' ? markdownModeComponents : undefined}
              {themes}
              {isDark}
              customId={PLAYGROUND_CUSTOM_ID}
              customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
              deferNodesUntilVisible={!viewportPriority}
              {viewportPriority}
              {batchRendering}
              {typewriter}
              maxLiveNodes={2000}
              liveNodeBuffer={200}
            />
          </div>
        </div>
      </section>
    </main>
  {:else}
    <div class="chat-wrapper chat-wrapper--with-sidebar">
      <div class="chat-container">
        <header class="chat-header">
          <div class="chat-header__brand">
            <div class="chat-header__logo">MS</div>
            <div class="chat-header__info">
              <h1 class="chat-header__title">{currentTitle}</h1>
              <p class="chat-header__subtitle">Streaming Markdown Renderer</p>
              <div class="chat-header__meta">
                <span class:chat-header__meta-pill--active={isStreaming} class="chat-header__meta-pill">{isStreaming ? (isPaused ? 'Paused' : 'Streaming') : 'Ready'}</span>
                <span class="chat-header__meta-pill">{selectedTheme}</span>
              </div>
            </div>
          </div>
          <nav class="chat-header__nav">
            <a href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noreferrer" class="nav-btn nav-btn--github">Star</a>
            <a href="https://markstream-vue-docs.simonhe.me/" target="_blank" rel="noreferrer" class="nav-btn nav-btn--docs">Docs</a>
            <button type="button" class="nav-btn nav-btn--stream" disabled={!isStreaming} onclick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
            <button type="button" class="nav-btn nav-btn--test" onclick={() => navigate('/test')}>Test</button>
            <button type="button" class="nav-btn nav-btn--cdn" onclick={startStream}>Replay</button>
          </nav>
        </header>

        <section class="chat-overview">
          <div class="chat-overview__intro">
            <span class="chat-overview__eyebrow">Live Playground</span>
            <p class="chat-overview__summary">Custom min/max window with your own burst profile.</p>
          </div>
          <div class="chat-overview__stats">
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Chunk</span>
              <strong class="chat-overview__stat-value">{streamChunkRangeLabel}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Delay</span>
              <strong class="chat-overview__stat-value">{streamDelayRangeLabel}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Transport</span>
              <strong class="chat-overview__stat-value">Scheduler</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Burst</span>
              <strong class="chat-overview__stat-value">{burstiness}%</strong>
            </div>
          </div>
        </section>

        <main bind:this={messagesContainer} class="chat-messages chatbot-messages">
          <MarkdownRender
            className="chat-messages__content"
            {content}
            final={!isStreaming}
            codeBlockStream={true}
            codeBlockDarkTheme={selectedTheme}
            codeBlockLightTheme={selectedTheme}
            codeBlockMonacoOptions={playgroundMonacoOptions}
            renderCodeBlocksAsPre={false}
            customComponents={undefined}
            {themes}
            {isDark}
            customId={PLAYGROUND_CUSTOM_ID}
            customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
            deferNodesUntilVisible={!viewportPriority}
            {viewportPriority}
            {batchRendering}
            {typewriter}
            maxLiveNodes={2000}
            liveNodeBuffer={200}
          />
        </main>
      </div>
    </div>
  {/if}
</div>
