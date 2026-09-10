#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = '127.0.0.1'
const overflowMode = process.env.CODE_OVERFLOW === 'scroll' ? 'scroll' : 'wrap'
const route = `/line-number-handoff-check?theme=dark&codeOverflow=${overflowMode}`
const frameworkSpecs = {
  vue3: { directory: 'playground', runner: 'vite' },
  vue2: { directory: 'playground-vue2', prepare: 'vue2', runner: 'vite' },
  vue2cli: { directory: 'playground-vue2-cli', prepare: 'vue2', runner: 'vue-cli' },
  react18: { directory: 'playground-react18', runner: 'vite' },
  react19: { directory: 'playground-react19', runner: 'vite' },
  svelte: { directory: 'playground-svelte', runner: 'vite' },
  angular: { directory: 'playground-angular', runner: 'vite' },
  nuxt: { directory: 'playground-nuxt', prepare: 'vue3', runner: 'nuxt' },
  next14: { directory: 'playground-next14', prepare: 'react', runner: 'next' },
  next15: { directory: 'playground-next15', prepare: 'react', runner: 'next' },
  octane: { directory: 'playground-octane', prepare: 'octane', runner: 'vite' },
}
const preparationSpecs = {
  vue2: ['--dir', 'packages/markstream-vue2', 'build'],
  vue3: ['run', 'build'],
  react: ['--dir', 'packages/markstream-react', 'build'],
  octane: ['--dir', 'packages/markstream-octane', 'build'],
}
const vue3HeaderParityFrameworks = new Set(['vue3', 'vue2', 'react18', 'react19', 'angular', 'next14', 'next15'])
const strictCodeHandoffFrameworks = new Set(['vue2', 'react18', 'svelte'])
const codeCharacterHandoffTolerance = 0.05
const stableHeaderFrameworks = new Set(['vue2'])
const activeServers = new Set()

function parseFrameworks(argv) {
  const requested = argv
    .filter(argument => argument.startsWith('--framework='))
    .flatMap(argument => argument.slice('--framework='.length).split(','))
    .map(value => value.trim())
    .filter(Boolean)
  const frameworks = requested.length ? requested : Object.keys(frameworkSpecs)
  for (const framework of frameworks) {
    if (!frameworkSpecs[framework])
      throw new Error(`Unknown framework "${framework}". Expected one of: ${Object.keys(frameworkSpecs).join(', ')}`)
  }
  return frameworks
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findFreePort(start = 4300, end = 4499) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, getLogs, timeoutMs = 120000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}\n${getLogs()}`)
}

function serverArgs(runner, port) {
  if (runner === 'next')
    return ['exec', 'next', 'dev', '--hostname', host, '--port', String(port)]
  if (runner === 'nuxt')
    return ['exec', 'nuxt', 'dev', '--host', host, '--port', String(port)]
  if (runner === 'vue-cli')
    return ['exec', 'vue-cli-service', 'serve', '--host', host, '--port', String(port)]
  return ['exec', 'vite', '--host', host, '--port', String(port), '--strictPort']
}

function startServer(spec, port) {
  const logs = []
  const child = spawn('pnpm', serverArgs(spec.runner, port), {
    cwd: path.join(repoRoot, spec.directory),
    detached: process.platform !== 'win32',
    env: { ...process.env, BROWSER: 'none', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const append = (chunk) => {
    logs.push(String(chunk))
    if (logs.length > 160)
      logs.splice(0, logs.length - 160)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  activeServers.add(child)
  return {
    child,
    getLogs: () => logs.join(''),
  }
}

function stopServer(child) {
  if (!child)
    return
  activeServers.delete(child)
  if (child.killed)
    return
  try {
    if (process.platform === 'win32')
      child.kill('SIGTERM')
    else
      process.kill(-child.pid, 'SIGTERM')
  }
  catch {}
}

function stopActiveServers() {
  for (const child of [...activeServers])
    stopServer(child)
}

function handleTerminationSignal(signal) {
  stopActiveServers()
  process.removeAllListeners(signal)
  process.kill(process.pid, signal)
}

process.once('SIGINT', () => handleTerminationSignal('SIGINT'))
process.once('SIGTERM', () => handleTerminationSignal('SIGTERM'))

async function preparePackages(frameworks) {
  const preparations = [...new Set(frameworks.map(framework => frameworkSpecs[framework].prepare).filter(Boolean))]
  for (const preparation of preparations) {
    const args = preparationSpecs[preparation]
    console.log(`[prepare] pnpm ${args.join(' ')}`)
    await new Promise((resolve, reject) => {
      const child = spawn('pnpm', args, {
        cwd: repoRoot,
        env: { ...process.env, CI: '1' },
        stdio: 'inherit',
      })
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (code === 0)
          resolve()
        else
          reject(new Error(`Preparation "${preparation}" failed (${signal || `exit ${code}`})`))
      })
    })
  }
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const executablePath = candidates.find(candidate => existsSync(candidate))
  return executablePath
    ? { executablePath, headless: true }
    : { channel: 'chrome', headless: true }
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

function normalizeSource(source) {
  return String(source || '').replace(/\r\n?/g, '\n').trimEnd()
}

function parseLineNumbers(text) {
  return String(text || '').match(/\d+/g)?.map(Number) ?? []
}

async function installDocumentStartSampler(page) {
  await page.addInitScript(() => {
    const visible = (element) => {
      if (!(element instanceof Element))
        return false
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0)
        return false
      let current = element
      while (current instanceof Element) {
        const style = getComputedStyle(current)
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity || '1') <= 0.05
          || current.getAttribute('aria-hidden') === 'true'
          || current.getAttribute('data-markstream-host-hidden') === 'true'
        ) {
          return false
        }
        const root = current.getRootNode()
        current = current.parentElement || (root instanceof ShadowRoot ? root.host : null)
      }
      return true
    }
    const firstVisibleCharacterRect = (element) => {
      if (!(element instanceof Element))
        return null
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let textNode
      while ((textNode = walker.nextNode())) {
        const index = String(textNode.textContent || '').search(/\S/)
        if (index < 0)
          continue
        const range = document.createRange()
        range.setStart(textNode, index)
        range.setEnd(textNode, index + 1)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0 || rect.height > 0)
          return rect
      }
      return null
    }
    const state = {
      samples: 0,
      contentSamples: 0,
      minimumHeight: Number.POSITIVE_INFINITY,
      maximumHeight: 0,
      maximumHeightDrop: 0,
      maximumHeightGrowth: 0,
      previousHeight: null,
      firstFallbackHeight: null,
      minimumFallbackHeight: Number.POSITIVE_INFINITY,
      maximumFallbackHeight: 0,
      heightBeforeHandoff: null,
      firstEditorHeight: null,
      minimumOverlapHeight: Number.POSITIVE_INFINITY,
      maximumOverlapHeight: 0,
      contentVisibility: '',
      containIntrinsicSize: '',
      fixedIntrinsicPlaceholderSeen: false,
      inlineMinHeight: '',
      contentSeen: false,
      fallbackSeen: false,
      fallbackLineNumbers: '',
      fallbackBackground: '',
      fallbackTheme: '',
      fallbackFontSize: '',
      fallbackLineHeight: '',
      fallbackPaddingTop: '',
      fallbackPaddingBottom: '',
      fallbackGutterBorderColor: '',
      fallbackGutterBorderWidth: '',
      fallbackGutterRight: null,
      firstEditorGutterRight: null,
      fallbackCodeStart: null,
      fallbackCodeTop: null,
      fallbackCodeWidth: null,
      fallbackCodeHeight: null,
      fallbackCodeFontFamily: '',
      firstEditorCodeStart: null,
      firstEditorCodeTop: null,
      firstEditorCodeWidth: null,
      firstEditorCodeHeight: null,
      firstEditorCodeFontFamily: '',
      headerSeen: false,
      headerRootReplacementCount: 0,
      headerActionSvgReplacementCount: 0,
      headerRoot: null,
      headerActionSvgs: null,
      editorReadySeen: false,
      handoffCompleted: false,
      transitionGapSeen: false,
      fallbackRegressed: false,
    }
    Object.defineProperty(window, '__markstreamHandoffProbe', { value: state, configurable: true })
    const queryDeep = (root, selector) => {
      const direct = root?.querySelector?.(selector)
      if (direct)
        return direct
      for (const element of root?.querySelectorAll?.('*') || []) {
        const nested = element.shadowRoot && queryDeep(element.shadowRoot, selector)
        if (nested)
          return nested
      }
      return null
    }
    const inspectTransition = () => {
      const section = document.querySelector('[data-handoff-case="enhanced"]')
      const block = section?.querySelector('.code-block-container')
      if (!block)
        return null
      const editor = queryDeep(block, 'diffs-container, .stream-diffs-shell, [data-stream-diffs-state], .code-block-render .shiki')
      const header = block.querySelector('.code-block-header')
      const headerActionSvgs = header ? Array.from(header.querySelectorAll('.code-header-actions svg, .code-block-header__actions svg')) : []
      if (header) {
        if (state.headerSeen && state.headerRoot && state.headerRoot !== header)
          state.headerRootReplacementCount++
        if (state.headerSeen && state.headerActionSvgs && (
          state.headerActionSvgs.length !== headerActionSvgs.length
          || state.headerActionSvgs.some((svg, index) => svg !== headerActionSvgs[index])
        )) {
          state.headerActionSvgReplacementCount++
        }
        state.headerSeen = true
        state.headerRoot = header
        state.headerActionSvgs = headerActionSvgs
      }
      const fallbackPres = Array.from(block.querySelectorAll('pre.code-fallback-plain, pre.code-pre-fallback, .code-editor-fallback-surface pre, pre[data-markstream-pre="1"]'))
      const visibleFallbackPre = fallbackPres.find(visible)
      const fallbackVisible = Boolean(visibleFallbackPre)
      const editorVisible = visible(editor)
      state.currentFallbackVisible = fallbackVisible
      state.currentEditorVisible = editorVisible
      if (fallbackVisible)
        state.fallbackSeen = true
      if (visibleFallbackPre) {
        const style = getComputedStyle(visibleFallbackPre)
        const gutter = visibleFallbackPre.querySelector('.markstream-pre__line-numbers-text')
        const logicalLines = Array.from(visibleFallbackPre.querySelectorAll('.markstream-pre__logical-line'))
        const logicalLineNumbers = logicalLines
          .map(line => line.getAttribute('data-line-number') || '')
          .filter(Boolean)
          .join(' ')
        const gutterBox = visibleFallbackPre.querySelector('.markstream-pre__line-numbers')
        const gutterStyle = gutterBox ? getComputedStyle(gutterBox) : null
        state.fallbackLineNumbers = gutter?.textContent || logicalLineNumbers
        state.fallbackBackground = style.backgroundColor
        state.fallbackTheme = visibleFallbackPre.getAttribute('data-markstream-code-theme') || state.fallbackTheme
        state.fallbackFontSize ||= style.fontSize
        state.fallbackLineHeight ||= style.lineHeight
        state.fallbackPaddingTop ||= style.paddingTop
        state.fallbackPaddingBottom ||= style.paddingBottom
        state.fallbackGutterBorderColor ||= gutterStyle?.borderRightColor || ''
        state.fallbackGutterBorderWidth ||= gutterStyle?.borderRightWidth || ''
        if (gutter) {
          state.fallbackGutterRight = gutter.getBoundingClientRect().right
        }
        const fallbackCode = visibleFallbackPre.querySelector('.markstream-pre__code, code')
        const fallbackCodeRect = firstVisibleCharacterRect(fallbackCode)

        const fallbackCodeStyle = fallbackCode ? getComputedStyle(fallbackCode) : null
        state.fallbackCodeStart ??= fallbackCodeRect?.left ?? null
        state.fallbackCodeTop ??= fallbackCodeRect?.top ?? null
        state.fallbackCodeWidth ??= fallbackCodeRect?.width ?? null
        state.fallbackCodeHeight ??= fallbackCodeRect?.height ?? null
        state.fallbackCodeFontFamily ||= fallbackCodeStyle?.fontFamily || ''
      }
      if (editorVisible) {
        state.editorReadySeen = true
        const editorGutter = queryDeep(editor, '[data-line-number-content], [data-line-number], .line-numbers')
        if (visible(editorGutter))
          state.firstEditorGutterRight ??= editorGutter.getBoundingClientRect().right
        const editorCodeLine = queryDeep(editor, '[data-line="1"], [data-line-index="0"] .view-line, .view-line')
        const editorCodeRect = firstVisibleCharacterRect(editorCodeLine)
        const editorCodeStyle = editorCodeLine ? getComputedStyle(editorCodeLine) : null
        state.firstEditorCodeStart ??= editorCodeRect?.left ?? null
        state.firstEditorCodeTop ??= editorCodeRect?.top ?? null
        state.firstEditorCodeWidth ??= editorCodeRect?.width ?? null
        state.firstEditorCodeHeight ??= editorCodeRect?.height ?? null
        state.firstEditorCodeFontFamily ||= editorCodeStyle?.fontFamily || ''
      }
      if (state.fallbackSeen && !fallbackVisible && !editorVisible)
        state.transitionGapSeen = true
      if (state.fallbackSeen && editorVisible && !fallbackVisible)
        state.handoffCompleted = true
      if (state.handoffCompleted && fallbackVisible)
        state.fallbackRegressed = true
      return block
    }
    const sample = () => {
      const block = inspectTransition()
      if (block) {
        state.samples++
        state.contentSeen = true
        const height = block.getBoundingClientRect().height
        const style = getComputedStyle(block)
        state.contentVisibility = style.contentVisibility
        state.containIntrinsicSize = style.containIntrinsicSize
        if (style.contentVisibility === 'auto' && /(?:^|\s)180px(?:\s|$)/.test(style.containIntrinsicSize))
          state.fixedIntrinsicPlaceholderSeen = true
        state.inlineMinHeight = block.style.minHeight
        if (height > 0) {
          state.contentSamples++
          state.minimumHeight = Math.min(state.minimumHeight, height)
          state.maximumHeight = Math.max(state.maximumHeight, height)
          if (state.currentFallbackVisible) {
            state.firstFallbackHeight ??= height
            state.minimumFallbackHeight = Math.min(state.minimumFallbackHeight, height)
            state.maximumFallbackHeight = Math.max(state.maximumFallbackHeight, height)
            state.heightBeforeHandoff = height
          }
          if (state.currentEditorVisible && !state.currentFallbackVisible)
            state.firstEditorHeight ??= height
          if (state.currentFallbackVisible && state.currentEditorVisible) {
            state.minimumOverlapHeight = Math.min(state.minimumOverlapHeight, height)
            state.maximumOverlapHeight = Math.max(state.maximumOverlapHeight, height)
          }
          if (state.previousHeight != null) {
            state.maximumHeightDrop = Math.max(state.maximumHeightDrop, state.previousHeight - height)
            state.maximumHeightGrowth = Math.max(state.maximumHeightGrowth, height - state.previousHeight)
          }
          state.previousHeight = height
        }
      }
      requestAnimationFrame(sample)
    }
    const observer = new MutationObserver(inspectTransition)
    observer.observe(document, { attributes: true, childList: true, subtree: true })
    requestAnimationFrame(sample)
  })
}

async function collectResult(page, framework, url) {
  await page.waitForSelector('[data-handoff-case="enhanced"] .code-block-container', { timeout: 120000 })
  await page.waitForSelector('[data-handoff-case="pre"] pre[data-markstream-pre="1"]', { timeout: 120000 })
  await page.waitForFunction(() => {
    const queryDeep = (root, selector) => {
      const direct = root?.querySelector?.(selector)
      if (direct)
        return direct
      for (const element of root?.querySelectorAll?.('*') || []) {
        const nested = element.shadowRoot && queryDeep(element.shadowRoot, selector)
        if (nested)
          return nested
      }
      return null
    }
    const editor = queryDeep(document.querySelector('[data-handoff-case="enhanced"]'), 'diffs-container, .stream-diffs-shell, [data-stream-diffs-state], .code-block-render .shiki')
    if (!editor)
      return false
    const rect = editor.getBoundingClientRect()
    let current = editor
    while (current instanceof Element) {
      const style = getComputedStyle(current)
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0.05
        || current.getAttribute('aria-hidden') === 'true'
        || current.getAttribute('data-markstream-host-hidden') === 'true'
      ) {
        return false
      }
      const root = current.getRootNode()
      current = current.parentElement || (root instanceof ShadowRoot ? root.host : null)
    }
    return rect.width > 0 && rect.height > 0
  }, undefined, { timeout: 120000 })
  await page.waitForTimeout(500)

  return await page.evaluate(({ framework, url }) => {
    const visible = (element) => {
      if (!(element instanceof Element))
        return false
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0)
        return false
      let current = element
      while (current instanceof Element) {
        const style = getComputedStyle(current)
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity || '1') <= 0.05
          || current.getAttribute('aria-hidden') === 'true'
          || current.getAttribute('data-markstream-host-hidden') === 'true'
        ) {
          return false
        }
        const root = current.getRootNode()
        current = current.parentElement || (root instanceof ShadowRoot ? root.host : null)
      }
      return true
    }
    const queryDeep = (root, selector) => {
      const direct = root?.querySelector?.(selector)
      if (direct)
        return direct
      for (const element of root?.querySelectorAll?.('*') || []) {
        const nested = element.shadowRoot && queryDeep(element.shadowRoot, selector)
        if (nested)
          return nested
      }
      return null
    }
    const queryAllDeep = (root, selector) => {
      const matches = Array.from(root?.querySelectorAll?.(selector) || [])
      for (const element of root?.querySelectorAll?.('*') || []) {
        if (element.shadowRoot)
          matches.push(...queryAllDeep(element.shadowRoot, selector))
      }
      return matches
    }
    const enhanced = document.querySelector('[data-handoff-case="enhanced"]')
    const pre = document.querySelector('[data-handoff-case="pre"]')
    const enhancedBlock = enhanced?.querySelector('.code-block-container')
    const header = enhancedBlock?.querySelector('.code-block-header')
    const headerTitle = header?.querySelector('.code-header-title')
    const headerIcon = header?.querySelector('.icon-slot, .code-block-language-icon')
    const headerIconSvg = headerIcon?.querySelector('svg')
    const headerIconImage = headerIcon?.querySelector('img')
    const headerIconImageSource = headerIconImage?.getAttribute('src') || ''
    const headerIconSourceMarkup = headerIconImageSource.startsWith('data:image/svg+xml')
      ? decodeURIComponent(headerIconImageSource.slice(headerIconImageSource.indexOf(',') + 1))
      : ''
    const headerActionButton = header?.querySelector('.code-action-btn, .code-block-action')
    const headerActions = header?.querySelector('.code-header-actions, .code-block-header__actions')
      || headerActionButton?.parentElement
    const headerMain = header?.querySelector('.code-header-main, .code-block-header__meta')
    const headerStyle = header ? getComputedStyle(header) : null
    const headerTitleStyle = headerTitle ? getComputedStyle(headerTitle) : null
    const headerActionsStyle = headerActions ? getComputedStyle(headerActions) : null
    const enhancedHeadingContent = enhanced?.querySelector('.node-content:has(.heading-node), .node-content:has(h1)')
    const preHeadingContent = pre?.querySelector('.node-content:has(.heading-node), .node-content:has(h1)')
    const enhancedHeadingStyle = enhancedHeadingContent ? getComputedStyle(enhancedHeadingContent) : null
    const preHeadingStyle = preHeadingContent ? getComputedStyle(preHeadingContent) : null
    const preElement = pre?.querySelector('pre[data-markstream-pre="1"]')
    const preCode = preElement?.querySelector('code')
    const gutter = preElement?.querySelector('.markstream-pre__line-numbers-text')
    const logicalLines = Array.from(preElement?.querySelectorAll('.markstream-pre__logical-line') || [])
    const logicalLineNumbers = logicalLines
      .map(element => element.getAttribute('data-line-number') || '')
      .filter(Boolean)
      .join(' ')
    const gutterBox = preElement?.querySelector('.markstream-pre__line-numbers')
    const preStyle = preElement ? getComputedStyle(preElement) : null
    const gutterStyle = gutterBox ? getComputedStyle(gutterBox) : null
    const editor = queryDeep(enhancedBlock, 'diffs-container, .stream-diffs-shell, [data-stream-diffs-state], .code-block-render .shiki')
    const editorSurface = queryDeep(enhancedBlock, '[data-code]') || editor
    const editorStyle = editorSurface ? getComputedStyle(editorSurface) : null
    const editorNumberElements = queryAllDeep(editor, '.line-numbers, [data-line-number-content], [data-line-number]')
    const editorFileHeaders = queryAllDeep(editor, '[data-diffs-header], [data-file-header], .stream-diffs-file-header')
      .filter(visible)
    const editorNumbers = editorNumberElements
      .filter(visible)
      .flatMap(element => [
        element.textContent?.trim() || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('data-line-number') || '',
        element.getAttribute('data-line-number-content') || '',
      ])
      .flatMap(value => value.match(/\d+/g) || [])
    const viewLines = queryAllDeep(editor, '.view-line, [data-line-index]')
    const editorSourceLineCount = Math.max(
      0,
      ...viewLines.map(element => Number.parseInt(
        element.getAttribute('data-line-index')
        || element.getAttribute('aria-label')?.match(/\d+/)?.[0]
        || '0',
        10,
      )),
      queryAllDeep(editor, '.view-line').length,
      queryAllDeep(editor, '.line').length,
      queryAllDeep(editor, '.stream-diffs-plain-text').reduce((count, element) => Math.max(count, String(element.textContent || '').replace(/\r\n?/g, '\n').trimEnd().split('\n').length), 0),
    )
    const fallbacks = Array.from(enhancedBlock?.querySelectorAll('pre.code-fallback-plain, pre.code-pre-fallback, .code-editor-fallback-surface pre, pre[data-markstream-pre="1"]') || [])
    const probe = window.__markstreamHandoffProbe || {}
    return {
      framework,
      url,
      darkInitially: document.querySelector('.handoff-check')?.classList.contains('dark') || false,
      enhancedSource: enhanced?.textContent || '',
      enhancedHeadingAnimation: enhancedHeadingStyle?.animationName || '',
      enhancedHeadingOpacity: enhancedHeadingStyle?.opacity || '',
      preHeadingAnimation: preHeadingStyle?.animationName || '',
      preHeadingOpacity: preHeadingStyle?.opacity || '',
      headerHeight: header?.getBoundingClientRect().height || 0,
      headerPaddingTop: headerStyle?.paddingTop || '',
      headerPaddingRight: headerStyle?.paddingRight || '',
      headerPaddingBottom: headerStyle?.paddingBottom || '',
      headerPaddingLeft: headerStyle?.paddingLeft || '',
      headerFontFamily: headerStyle?.fontFamily || '',
      headerTitleFontSize: headerTitleStyle?.fontSize || '',
      headerTitleFontFamily: headerTitleStyle?.fontFamily || '',
      headerTitleColor: headerTitleStyle?.color || '',
      headerMainGap: headerMain ? getComputedStyle(headerMain).gap : '',
      headerActionsGap: headerActionsStyle?.gap || '',
      headerIconWidth: headerIcon?.getBoundingClientRect().width || 0,
      headerIconHeight: headerIcon?.getBoundingClientRect().height || 0,
      headerIconMarkup: headerIconSvg?.outerHTML || headerIconSourceMarkup,
      headerActionWidth: headerActionButton?.getBoundingClientRect().width || 0,
      headerActionHeight: headerActionButton?.getBoundingClientRect().height || 0,
      headerActionOpacity: headerActionButton ? getComputedStyle(headerActionButton).opacity : '',
      preSource: preCode?.textContent || '',
      preLineNumbers: gutter?.textContent || logicalLineNumbers,
      preBackground: preStyle?.backgroundColor || '',
      preColor: preStyle?.color || '',
      preFontFamily: preStyle?.fontFamily || '',
      preFontSize: preStyle?.fontSize || '',
      preLineHeight: preStyle?.lineHeight || '',
      prePaddingTop: preStyle?.paddingTop || '',
      prePaddingRight: preStyle?.paddingRight || '',
      prePaddingBottom: preStyle?.paddingBottom || '',
      prePaddingLeft: preStyle?.paddingLeft || '',
      preOverflowX: preStyle?.overflowX || '',
      editorBackground: editorStyle?.backgroundColor || '',
      editorColor: editorStyle?.color || '',
      editorFontFamily: editorStyle?.fontFamily || '',
      editorFontSize: editorStyle?.fontSize || '',
      editorLineHeight: editorStyle?.lineHeight || '',
      editorPaddingTop: editorStyle?.paddingTop || '',
      editorPaddingRight: editorStyle?.paddingRight || '',
      editorPaddingBottom: editorStyle?.paddingBottom || '',
      editorPaddingLeft: editorStyle?.paddingLeft || '',
      editorOverflowX: editorStyle?.overflowX || '',
      editorClientWidth: editorSurface?.clientWidth || 0,
      editorScrollWidth: editorSurface?.scrollWidth || 0,
      preClientWidth: preElement?.clientWidth || 0,
      preScrollWidth: preElement?.scrollWidth || 0,
      preCodePaddingLeft: preCode ? getComputedStyle(preCode).paddingLeft : '',
      preGutterBorderColor: gutterStyle?.borderRightColor || '',
      preGutterBorderWidth: gutterStyle?.borderRightWidth || '',
      editorLineNumbers: editorNumbers,
      editorSourceLineCount,
      editorFileHeaderCount: editorFileHeaders.length,
      editorFileHeaderText: editorFileHeaders.map(element => element.textContent?.trim() || '').filter(Boolean),
      editorVisible: visible(editor),
      fallbackVisible: fallbacks.some(visible),
      finalHeight: enhancedBlock?.getBoundingClientRect().height || 0,
      samples: probe.samples || 0,
      contentSamples: probe.contentSamples || 0,
      minimumHeight: Number.isFinite(probe.minimumHeight) ? probe.minimumHeight : null,
      maximumHeight: probe.maximumHeight || 0,
      maximumHeightDrop: probe.maximumHeightDrop || 0,
      maximumHeightGrowth: probe.maximumHeightGrowth || 0,
      firstFallbackHeight: probe.firstFallbackHeight || null,
      minimumFallbackHeight: Number.isFinite(probe.minimumFallbackHeight) ? probe.minimumFallbackHeight : null,
      maximumFallbackHeight: probe.maximumFallbackHeight || null,
      heightBeforeHandoff: probe.heightBeforeHandoff || null,
      firstEditorHeight: probe.firstEditorHeight || null,
      minimumOverlapHeight: Number.isFinite(probe.minimumOverlapHeight) ? probe.minimumOverlapHeight : null,
      maximumOverlapHeight: probe.maximumOverlapHeight || null,
      contentVisibility: probe.contentVisibility || '',
      containIntrinsicSize: probe.containIntrinsicSize || '',
      fixedIntrinsicPlaceholderSeen: probe.fixedIntrinsicPlaceholderSeen || false,
      inlineMinHeight: probe.inlineMinHeight || '',
      fallbackSeen: probe.fallbackSeen || false,
      fallbackLineNumbers: probe.fallbackLineNumbers || '',
      fallbackBackground: probe.fallbackBackground || '',
      fallbackTheme: probe.fallbackTheme || '',
      fallbackFontSize: probe.fallbackFontSize || '',
      fallbackLineHeight: probe.fallbackLineHeight || '',
      fallbackPaddingTop: probe.fallbackPaddingTop || '',
      fallbackPaddingBottom: probe.fallbackPaddingBottom || '',
      fallbackGutterBorderColor: probe.fallbackGutterBorderColor || '',
      fallbackGutterBorderWidth: probe.fallbackGutterBorderWidth || '',
      fallbackGutterRight: Number.isFinite(probe.fallbackGutterRight) ? probe.fallbackGutterRight : null,
      firstEditorGutterRight: Number.isFinite(probe.firstEditorGutterRight) ? probe.firstEditorGutterRight : null,
      fallbackCodeStart: Number.isFinite(probe.fallbackCodeStart) ? probe.fallbackCodeStart : null,
      fallbackCodeTop: Number.isFinite(probe.fallbackCodeTop) ? probe.fallbackCodeTop : null,
      fallbackCodeWidth: Number.isFinite(probe.fallbackCodeWidth) ? probe.fallbackCodeWidth : null,
      fallbackCodeHeight: Number.isFinite(probe.fallbackCodeHeight) ? probe.fallbackCodeHeight : null,
      fallbackCodeFontFamily: probe.fallbackCodeFontFamily || '',
      firstEditorCodeStart: Number.isFinite(probe.firstEditorCodeStart) ? probe.firstEditorCodeStart : null,
      firstEditorCodeTop: Number.isFinite(probe.firstEditorCodeTop) ? probe.firstEditorCodeTop : null,
      firstEditorCodeWidth: Number.isFinite(probe.firstEditorCodeWidth) ? probe.firstEditorCodeWidth : null,
      firstEditorCodeHeight: Number.isFinite(probe.firstEditorCodeHeight) ? probe.firstEditorCodeHeight : null,
      firstEditorCodeFontFamily: probe.firstEditorCodeFontFamily || '',
      headerRootReplacementCount: probe.headerRootReplacementCount || 0,
      headerActionSvgReplacementCount: probe.headerActionSvgReplacementCount || 0,
      editorReadySeen: probe.editorReadySeen || false,
      handoffCompleted: probe.handoffCompleted || false,
      transitionGapSeen: probe.transitionGapSeen || false,
      fallbackRegressed: probe.fallbackRegressed || false,
    }
  }, { framework, url })
}

function validateResult(result, { requireDark = true, requireNarrowPre = true, requireHeaderHover = true } = {}) {
  const overflow = new URL(result.url).searchParams.get('codeOverflow') === 'scroll' ? 'scroll' : 'wrap'
  const expectedNumbers = Array.from({ length: 13 }, (_, index) => index + 1)
  const preSource = normalizeSource(result.preSource)
  const preLines = preSource.split('\n')
  const preNumbers = parseLineNumbers(result.preLineNumbers)
  const fallbackNumbers = parseLineNumbers(result.fallbackLineNumbers)
  const editorNumbers = result.editorLineNumbers.map(Number).filter(Number.isFinite)

  if (requireDark)
    assert(result.darkInitially, 'the ?theme=dark page did not initialize in dark mode')
  if (result.framework === 'svelte') {
    assert(result.enhancedHeadingAnimation === 'none', `enhanced Markdown heading animation is ${result.enhancedHeadingAnimation}`)
    assert(result.preHeadingAnimation === 'none', `Pre Markdown heading animation is ${result.preHeadingAnimation}`)
    assert(result.enhancedHeadingOpacity === '1', `enhanced Markdown heading opacity is ${result.enhancedHeadingOpacity}`)
    assert(result.preHeadingOpacity === '1', `Pre Markdown heading opacity is ${result.preHeadingOpacity}`)
  }
  if (vue3HeaderParityFrameworks.has(result.framework)) {
    // The header's content box is driven by the platform's default sans line box,
    // which differs by a pixel or two between macOS and Linux. Keep the band
    // tight enough to catch a structural regression (the exact padding, gaps,
    // icon and action sizes are asserted separately below) without pinning one
    // platform's font metrics.
    assert(
      result.headerHeight >= 38 && result.headerHeight <= 46,
      `code header height is ${result.headerHeight}px, expected 38-46px`,
    )
    assert(
      [result.headerPaddingTop, result.headerPaddingRight, result.headerPaddingBottom, result.headerPaddingLeft].join(' ') === '6px 10px 6px 10px',
      `code header padding is ${result.headerPaddingTop} ${result.headerPaddingRight} ${result.headerPaddingBottom} ${result.headerPaddingLeft}`,
    )
    assert(result.headerTitleFontSize === '12px', `code header title font size is ${result.headerTitleFontSize}, expected 12px`)
    assert(result.headerFontFamily.startsWith('ui-sans-serif, system-ui, sans-serif'), `code header font family is ${result.headerFontFamily}`)
    assert(result.headerTitleFontFamily.startsWith('ui-sans-serif, system-ui, sans-serif'), `code header title font family is ${result.headerTitleFontFamily}`)
    assert(result.headerTitleColor === 'rgb(153, 153, 153)', `dark code header title color is ${result.headerTitleColor}, expected rgb(153, 153, 153)`)
    assert(result.headerMainGap === '10px', `code header main gap is ${result.headerMainGap}, expected 10px`)
    assert(result.headerActionsGap === '2px', `code header actions gap is ${result.headerActionsGap}, expected 2px`)
    assert(result.headerIconWidth === 16 && result.headerIconHeight === 16, `code header icon is ${result.headerIconWidth}x${result.headerIconHeight}, expected 16x16`)
    assert(result.headerIconMarkup.includes('#0288d1'), 'TypeScript code header icon is not the Vue 3 Material icon')
    assert(
      Math.abs(result.headerActionWidth - 26) <= 0.5 && Math.abs(result.headerActionHeight - 26) <= 0.5,
      `code header action is ${result.headerActionWidth}x${result.headerActionHeight}, expected 26x26`,
    )
    assert(result.headerActionOpacity === '1', `code header action opacity is ${result.headerActionOpacity}, expected 1`)
    if (requireHeaderHover) {
      assert(result.headerActionHoverBackground === 'rgb(61, 61, 61)', `dark code header action hover background is ${result.headerActionHoverBackground}, expected rgb(61, 61, 61)`)
      assert(result.headerActionHoverColor === 'rgb(237, 237, 237)', `dark code header action hover color is ${result.headerActionHoverColor}, expected rgb(237, 237, 237)`)
    }
  }
  assert(preLines.length === 13, `Pre fixture has ${preLines.length} lines instead of 13`)
  assert(preLines.at(-1) === 'done()', `Pre fixture does not end with done(): ${JSON.stringify(preLines.at(-1))}`)
  assert(expectedNumbers.every((number, index) => preNumbers[index] === number), `Pre gutter is not 1..13: ${preNumbers.join(', ')}`)
  assert(result.preBackground === 'rgb(18, 18, 18)', `dark Pre background is ${result.preBackground}, expected rgb(18, 18, 18)`)
  assert(result.fallbackTheme === 'vitesse-dark', `dark fallback theme is ${result.fallbackTheme}, expected vitesse-dark`)
  assert(result.editorBackground === result.preBackground, `pre/highlight background mismatch: ${result.preBackground} vs ${result.editorBackground}`)
  assert(result.editorColor === result.preColor, `pre/highlight foreground mismatch: ${result.preColor} vs ${result.editorColor}`)
  assert(result.preFontSize === result.editorFontSize, `pre/highlight font size mismatch: ${result.preFontSize} vs ${result.editorFontSize}`)
  assert(result.preLineHeight === result.editorLineHeight, `pre/highlight line height mismatch: ${result.preLineHeight} vs ${result.editorLineHeight}`)
  assert(result.preFontFamily === result.editorFontFamily, `pre/highlight font family mismatch: ${result.preFontFamily} vs ${result.editorFontFamily}`)
  assert(result.preFontSize === '12px', `shared Pre font size is ${result.preFontSize}, expected 12px`)
  assert(result.preLineHeight === '18px', `shared Pre line height is ${result.preLineHeight}, expected 18px`)
  assert(result.prePaddingTop === '8px', `shared Pre top padding is ${result.prePaddingTop}, expected 8px`)
  assert(result.prePaddingBottom === '8px', `shared Pre bottom padding is ${result.prePaddingBottom}, expected 8px`)
  // The Pre gutter contract is `padding-right: 1ch` and
  // `padding-left: calc(2ch + 2ch + 1ch + 2px + 1ch)` (PreCodeNode.vue:406,411).
  // A `ch` resolves to whatever monospace font the platform picks, so asserting
  // absolute pixels would pin one platform's font metrics. `padding-right` *is*
  // the resolved `1ch` of this element, so assert the relationship between the
  // two paddings instead — exact, and independent of the font.
  const preCh = Number.parseFloat(result.prePaddingRight)
  assert(Number.isFinite(preCh) && preCh > 0, `shared Pre right padding is not measurable: ${result.prePaddingRight}`)
  // At the shared 12px font size a monospace `ch` is roughly 0.45-0.75em; this
  // catches the gutter silently switching to a non-`ch` unit.
  assert(preCh >= 5.4 && preCh <= 9, `shared Pre right padding is ${result.prePaddingRight}, not a 12px monospace ch`)
  assert(
    Math.abs(Number.parseFloat(result.prePaddingLeft) - (6 * preCh + 2)) <= 0.05,
    `shared Pre line-number padding is ${result.prePaddingLeft}, expected 6ch + 2px separator (${(6 * preCh + 2).toFixed(3)}px)`,
  )
  assert(
    result.preOverflowX === (overflow === 'wrap' ? 'hidden' : 'auto'),
    `${overflow} shared Pre overflow-x is ${result.preOverflowX}`,
  )
  assert(result.preCodePaddingLeft === '0px', `wrapped shared Pre code padding is ${result.preCodePaddingLeft}, expected 0px`)
  if (requireNarrowPre) {
    if (overflow === 'wrap') {
      assert(
        result.narrowPreScrollWidth === result.narrowPreClientWidth && result.narrowPreScrollLeft === 0,
        `shared wrapped Pre unexpectedly became horizontally scrollable at 800px (${result.narrowPreScrollWidth} vs ${result.narrowPreClientWidth}, scrollLeft=${result.narrowPreScrollLeft})`,
      )
      assert(result.editorScrollWidth <= result.editorClientWidth + 1, `wrapped enhanced surface overflows (${result.editorScrollWidth} vs ${result.editorClientWidth})`)
    }
    else {
      assert(
        result.narrowPreScrollWidth > result.narrowPreClientWidth && result.narrowPreScrollLeft > 0,
        `shared scroll Pre did not preserve horizontal overflow at 800px (${result.narrowPreScrollWidth} vs ${result.narrowPreClientWidth}, scrollLeft=${result.narrowPreScrollLeft})`,
      )
      assert(result.editorScrollWidth > result.editorClientWidth, `scroll enhanced surface did not overflow (${result.editorScrollWidth} vs ${result.editorClientWidth})`)
    }
  }
  if (result.preGutterBorderColor || result.preGutterBorderWidth) {
    assert(
      result.preGutterBorderColor === 'rgba(0, 0, 0, 0)' || result.preGutterBorderWidth === '0px',
      `Pre gutter draws a visible separator (${result.preGutterBorderWidth} ${result.preGutterBorderColor})`,
    )
  }
  assert(result.fallbackSeen, 'enhanced fallback was never observed before the enhanced surface')
  assert(expectedNumbers.every((number, index) => fallbackNumbers[index] === number), `enhanced fallback gutter is not 1..13: ${fallbackNumbers.join(', ')}`)
  assert(result.fallbackBackground === 'rgb(18, 18, 18)', `dark enhanced fallback background is ${result.fallbackBackground}, expected rgb(18, 18, 18)`)
  assert(result.fallbackFontSize === '12px', `enhanced fallback font size is ${result.fallbackFontSize}, expected 12px`)
  assert(result.fallbackLineHeight === '18px', `enhanced fallback line height is ${result.fallbackLineHeight}, expected 18px`)
  assert(result.fallbackPaddingTop === '8px', `enhanced fallback top padding is ${result.fallbackPaddingTop}, expected 8px`)
  assert(result.fallbackPaddingBottom === '8px', `enhanced fallback bottom padding is ${result.fallbackPaddingBottom}, expected 8px`)
  if (result.fallbackGutterBorderColor || result.fallbackGutterBorderWidth) {
    assert(
      result.fallbackGutterBorderColor === 'rgba(0, 0, 0, 0)' || result.fallbackGutterBorderWidth === '0px',
      `enhanced fallback gutter draws a visible separator (${result.fallbackGutterBorderWidth} ${result.fallbackGutterBorderColor})`,
    )
  }
  assert(result.editorVisible && result.editorReadySeen, 'enhanced code surface never became visible')
  assert(
    result.fallbackCodeStart != null && result.firstEditorCodeStart != null,
    'handoff first code-character positions were not observed',
  )
  const codeStartTolerance = strictCodeHandoffFrameworks.has(result.framework) ? codeCharacterHandoffTolerance : 1
  assert(
    Math.abs(result.fallbackCodeStart - result.firstEditorCodeStart) <= codeStartTolerance,
    `enhanced handoff moved the first code character from ${result.fallbackCodeStart.toFixed(4)}px to ${result.firstEditorCodeStart.toFixed(4)}px`,
  )
  if (strictCodeHandoffFrameworks.has(result.framework)) {
    assert(
      result.fallbackCodeStart != null && result.firstEditorCodeStart != null,
      'handoff code character positions were not observed',
    )
    assert(
      Math.abs(result.fallbackCodeStart - result.firstEditorCodeStart) <= codeCharacterHandoffTolerance,
      `enhanced handoff moved the first code character from ${result.fallbackCodeStart.toFixed(4)}px to ${result.firstEditorCodeStart.toFixed(4)}px`,
    )
    assert(
      result.fallbackCodeTop != null && result.firstEditorCodeTop != null
      && result.fallbackCodeWidth != null && result.firstEditorCodeWidth != null
      && result.fallbackCodeHeight != null && result.firstEditorCodeHeight != null,
      'handoff code glyph geometry was not observed',
    )
    assert(
      Math.abs(result.fallbackCodeTop - result.firstEditorCodeTop) <= 0.02,
      `enhanced handoff moved the first glyph vertically from ${result.fallbackCodeTop.toFixed(4)}px to ${result.firstEditorCodeTop.toFixed(4)}px`,
    )
    assert(
      Math.abs(result.fallbackCodeWidth - result.firstEditorCodeWidth) <= 0.02,
      `enhanced handoff changed the first glyph width from ${result.fallbackCodeWidth.toFixed(4)}px to ${result.firstEditorCodeWidth.toFixed(4)}px`,
    )
    assert(
      Math.abs(result.fallbackCodeHeight - result.firstEditorCodeHeight) <= 0.02,
      `enhanced handoff changed the first glyph height from ${result.fallbackCodeHeight.toFixed(4)}px to ${result.firstEditorCodeHeight.toFixed(4)}px`,
    )
    assert(
      result.fallbackCodeFontFamily === result.firstEditorCodeFontFamily,
      `enhanced handoff changed font family from ${result.fallbackCodeFontFamily} to ${result.firstEditorCodeFontFamily}`,
    )
  }
  if (stableHeaderFrameworks.has(result.framework)) {
    assert(result.headerRootReplacementCount === 0, `code header root was replaced ${result.headerRootReplacementCount} time(s)`)
    assert(result.headerActionSvgReplacementCount === 0, `code header action SVGs were replaced ${result.headerActionSvgReplacementCount} time(s)`)
  }
  assert(
    result.editorFileHeaderCount === 0,
    `enhanced code surface rendered a duplicate internal file header: ${result.editorFileHeaderText.join(', ')}`,
  )
  assert(result.handoffCompleted, 'enhanced fallback was not atomically handed off to the enhanced surface')
  assert(
    (editorNumbers.includes(1) && editorNumbers.includes(13)) || result.editorSourceLineCount >= 13,
    `enhanced code surface did not expose all 13 lines: gutter=${editorNumbers.join(', ')}, sourceLines=${result.editorSourceLineCount}`,
  )
  assert(
    !editorNumbers.includes(14) && result.editorSourceLineCount <= 13,
    `enhanced code surface exposed an unexpected 14th line: gutter=${editorNumbers.join(', ')}, sourceLines=${result.editorSourceLineCount}`,
  )
  assert(!result.fallbackVisible, 'enhanced fallback is still visible after the enhanced surface became ready')
  assert(!result.transitionGapSeen, 'enhanced fallback disappeared before the enhanced surface became ready')
  assert(!result.fallbackRegressed, 'enhanced fallback became visible again after the enhanced surface was ready')
  assert(result.contentSamples > 0 && result.minimumHeight != null, 'no enhanced height samples were collected after the code block appeared')
  assert(result.finalHeight > 0, 'enhanced code block has no final height')
  assert(
    !result.fixedIntrinsicPlaceholderSeen,
    `enhanced code block used a fixed 180px intrinsic placeholder (${result.containIntrinsicSize})`,
  )
  assert(
    result.minimumHeight >= result.maximumHeight * 0.85,
    `enhanced code block collapsed to ${result.minimumHeight.toFixed(1)}px while its rendered maximum was ${result.maximumHeight.toFixed(1)}px`,
  )
  const allowedLayoutJitter = Math.max(2, result.finalHeight * 0.01)
  assert(
    result.maximumHeight - result.minimumHeight <= allowedLayoutJitter,
    `enhanced code block jittered by ${(result.maximumHeight - result.minimumHeight).toFixed(1)}px (allowed ${allowedLayoutJitter.toFixed(1)}px)`,
  )
  assert(
    result.minimumFallbackHeight != null && result.maximumFallbackHeight != null,
    'no fallback-stage height samples were collected',
  )
  assert(
    result.minimumFallbackHeight >= result.maximumFallbackHeight * 0.9,
    `fallback stage collapsed to ${result.minimumFallbackHeight.toFixed(1)}px before reaching ${result.maximumFallbackHeight.toFixed(1)}px`,
  )
  assert(
    result.heightBeforeHandoff != null && result.firstEditorHeight != null,
    'handoff boundary heights were not observed',
  )
  const handoffReferenceHeight = Math.max(result.heightBeforeHandoff, result.firstEditorHeight)
  const allowedHandoffDelta = Math.max(2, handoffReferenceHeight * 0.01)
  assert(
    Math.abs(result.heightBeforeHandoff - result.firstEditorHeight) <= allowedHandoffDelta,
    `enhanced handoff changed height from ${result.heightBeforeHandoff.toFixed(1)}px to ${result.firstEditorHeight.toFixed(1)}px`,
  )
  if (result.framework === 'svelte') {
    assert(
      Math.abs(result.heightBeforeHandoff - result.firstEditorHeight) <= 0.02,
      `Svelte handoff shifted following content by changing height from ${result.heightBeforeHandoff.toFixed(4)}px to ${result.firstEditorHeight.toFixed(4)}px`,
    )
  }
}

async function runFramework(browser, framework, spec) {
  const port = await findFreePort()
  const server = startServer(spec, port)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const browserErrors = []
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push(`console: ${message.text()}`)
  })

  try {
    await waitForPort(port, server.getLogs)
    await installDocumentStartSampler(page)
    const url = `http://${host}:${port}${route}`
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await page.goto(url, { waitUntil: 'commit', timeout: 120000 })
    // Validate a fresh document independently from the reload document. The
    // page can keep a Vite connection open, so reload waits for `commit`; the
    // collector then waits for the actual rendered contract instead of a load event.
    const firstNavigationResult = await collectResult(page, framework, url)
    validateResult(firstNavigationResult, { requireNarrowPre: false, requireHeaderHover: false })

    await page.reload({ waitUntil: 'commit', timeout: 120000 })
    const result = await collectResult(page, framework, url)
    if (vue3HeaderParityFrameworks.has(framework)) {
      const headerAction = page.locator([
        '[data-handoff-case="enhanced"] .code-block-header .code-action-btn',
        '[data-handoff-case="enhanced"] .code-block-header .code-block-action',
      ].join(', ')).first()
      await headerAction.hover()
      await page.waitForTimeout(500)
      const headerActionHoverStyle = await headerAction.evaluate((element) => {
        const style = getComputedStyle(element)
        return { backgroundColor: style.backgroundColor, color: style.color }
      })
      result.headerActionHoverBackground = headerActionHoverStyle.backgroundColor
      result.headerActionHoverColor = headerActionHoverStyle.color
    }
    await page.setViewportSize({ width: 800, height: 1000 })
    await page.waitForTimeout(50)
    const narrowPreScroll = await page.locator('[data-handoff-case="pre"] pre[data-markstream-pre="1"]').evaluate((element) => {
      element.scrollLeft = 200
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
      }
    })
    result.narrowPreClientWidth = narrowPreScroll.clientWidth
    result.narrowPreScrollWidth = narrowPreScroll.scrollWidth
    result.narrowPreScrollLeft = narrowPreScroll.scrollLeft
    validateResult(result)

    await page.getByRole('button', { name: 'Toggle dark' }).click()
    await page.waitForFunction(() => !document.querySelector('.handoff-check')?.classList.contains('dark'))
    // The wrapper class follows the `isDark` prop synchronously, but the
    // enhanced surface applies its theme asynchronously: the component syncs the
    // injected worker pool's render options and re-tokenizes before repainting.
    // Waiting only on the class samples the one-frame window where the fallback
    // is already light while the code surface is still dark. Wait for the
    // surfaces to actually agree — a failure to converge within the timeout is
    // itself the regression this guards against.
    await page.waitForFunction(() => {
      const queryDeep = (root, selector) => {
        const direct = root?.querySelector?.(selector)
        if (direct)
          return direct
        for (const element of root?.querySelectorAll?.('*') || []) {
          const nested = element.shadowRoot && queryDeep(element.shadowRoot, selector)
          if (nested)
            return nested
        }
        return null
      }
      const pre = document.querySelector('[data-handoff-case="pre"] pre[data-markstream-pre="1"]')
      const code = queryDeep(document.querySelector('[data-handoff-case="enhanced"]'), '[data-code]')
      if (!pre || !code)
        return false
      return getComputedStyle(code).backgroundColor === getComputedStyle(pre).backgroundColor
    }, { timeout: 15000 })
    const lightVisual = await page.evaluate(() => {
      const queryDeep = (root, selector) => {
        const direct = root?.querySelector?.(selector)
        if (direct)
          return direct
        for (const element of root?.querySelectorAll?.('*') || []) {
          const nested = element.shadowRoot && queryDeep(element.shadowRoot, selector)
          if (nested)
            return nested
        }
        return null
      }
      const pre = document.querySelector('[data-handoff-case="pre"] pre[data-markstream-pre="1"]')
      const code = queryDeep(document.querySelector('[data-handoff-case="enhanced"]'), '[data-code]')
      const preStyle = pre ? getComputedStyle(pre) : null
      const codeStyle = code ? getComputedStyle(code) : null
      return {
        preBackground: preStyle?.backgroundColor || '',
        preTheme: pre?.getAttribute('data-markstream-code-theme') || '',
        codeBackground: codeStyle?.backgroundColor || '',
        codeColor: codeStyle?.color || '',
        preColor: preStyle?.color || '',
      }
    })
    result.lightPreBackground = lightVisual.preBackground
    assert(result.lightPreBackground === 'rgb(255, 255, 255)', `light Pre background is ${result.lightPreBackground}, expected rgb(255, 255, 255)`)
    assert(lightVisual.preTheme === 'vitesse-light', `light fallback theme is ${lightVisual.preTheme}, expected vitesse-light`)
    assert(lightVisual.codeBackground === lightVisual.preBackground, `light pre/highlight background mismatch: ${lightVisual.preBackground} vs ${lightVisual.codeBackground}`)
    assert(lightVisual.codeColor === lightVisual.preColor, `light pre/highlight foreground mismatch: ${lightVisual.preColor} vs ${lightVisual.codeColor}`)
    result.darkToggled = true
    result.browserErrors = browserErrors
    assert(browserErrors.length === 0, `browser errors:\n${browserErrors.join('\n')}`)
    console.log(JSON.stringify(result, null, 2))
    await cdp.detach()
    return result
  }
  catch (error) {
    const logs = server.getLogs().trim()
    if (logs) {
      console.error(`--- ${framework} recent server logs ---`)
      console.error(logs)
      console.error(`--- end ${framework} recent server logs ---`)
    }
    throw new Error(`[${framework}] ${error.message}`, { cause: error })
  }
  finally {
    await context.close()
    stopServer(server.child)
  }
}

async function main() {
  const frameworks = parseFrameworks(process.argv.slice(2))
  await preparePackages(frameworks)
  const browser = await chromium.launch(resolveChromeLaunchOptions())
  const results = []
  try {
    for (const framework of frameworks)
      results.push(await runFramework(browser, framework, frameworkSpecs[framework]))
  }
  finally {
    await browser.close()
  }
  console.log(JSON.stringify({ passed: results.map(result => result.framework) }, null, 2))
}

await main()
