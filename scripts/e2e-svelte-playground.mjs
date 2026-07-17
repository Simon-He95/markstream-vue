#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground-svelte')
const host = '127.0.0.1'

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

async function findFreePort(start = 4176, end = 4210) {
  for (let port = start; port <= end; port += 1) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${host}:${port}`)
}

async function expectTooltip(page, locator, expectedText) {
  await locator.hover()
  await page.waitForFunction((expected) => {
    const tooltip = document.querySelector('.ms-tooltip')
    return tooltip?.getAttribute('data-visible') === 'true'
      && (tooltip.textContent || '').includes(expected)
  }, expectedText, { timeout: 5000 })
  await page.mouse.move(4, 4)
  await page.waitForFunction(() => {
    const tooltip = document.querySelector('.ms-tooltip')
    return !tooltip || tooltip.getAttribute('data-visible') !== 'true'
  }, null, { timeout: 5000 })
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

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        headless: true,
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
  }
}

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    ['-C', playgroundDir, 'exec', 'vite', '--host', host, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
      },
    },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs() {
      return logs.join('')
    },
  }
}

function killProcessTree(child) {
  if (!child || child.killed)
    return
  try {
    child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)
  let browser

  try {
    await waitForPort(port)
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => {
      window.localStorage.setItem('vmr-settings-stream-chunk-size-min', '24')
      window.localStorage.setItem('vmr-settings-stream-chunk-size-max', '24')
      window.localStorage.setItem('vmr-settings-stream-delay-min', '8')
      window.localStorage.setItem('vmr-settings-stream-delay-max', '8')
      window.localStorage.setItem('vmr-settings-stream-burstiness', '0')
      if (window.localStorage.getItem('__markstream-svelte-e2e-render-mode-seeded') !== 'true') {
        window.localStorage.setItem('vmr-test-render-mode', 'pre')
        window.localStorage.setItem('__markstream-svelte-e2e-render-mode-seeded', 'true')
      }
      window.__markstreamSvelteMermaidWorkerMessages = []
      const originalPostMessage = Worker.prototype.postMessage
      Worker.prototype.postMessage = function patchedPostMessage(message, ...args) {
        if (message && typeof message === 'object' && (message.action === 'canParse' || message.action === 'findPrefix')) {
          window.__markstreamSvelteMermaidWorkerMessages.push({
            action: message.action,
            codeLength: String(message.payload?.code || '').length,
          })
        }
        return originalPostMessage.call(this, message, ...args)
      }
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error')
        errors.push(msg.text())
      if (msg.type() === 'warning' && /externalized for browser compatibility/.test(msg.text()))
        errors.push(msg.text())
    })

    await page.goto(`http://${host}:${port}/`, { waitUntil: 'load' })
    const homeRendererSelector = '.chatbot-messages > .markstream-svelte.markdown-renderer'
    const testRendererSelector = '.workspace-card--preview .preview-surface > .markstream-svelte'

    await page.locator(homeRendererSelector).waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction(() => {
      const wrapper = document.querySelector('.chat-wrapper.chat-wrapper--with-sidebar')
      const container = document.querySelector('.chat-container')
      const messages = document.querySelector('.chat-messages.chatbot-messages')
      if (!wrapper || !container || !messages)
        return false
      const messagesStyle = getComputedStyle(messages)
      return messagesStyle.flexDirection === 'column-reverse'
        && messagesStyle.overflowY === 'auto'
        && container.getBoundingClientRect().width > 600
    }, null, { timeout: 10000 })
    await page.waitForFunction(() => {
      const container = document.querySelector('.chat-container')
      const settings = document.querySelector('.settings-sidebar')
      const stat = document.querySelector('.chat-overview__stat')
      const toggle = document.querySelector('.theme-toggle')
      if (!container || !settings || !stat || !toggle)
        return false
      const containerStyle = getComputedStyle(container)
      const settingsStyle = getComputedStyle(settings)
      const statStyle = getComputedStyle(stat)
      const toggleRect = toggle.getBoundingClientRect()
      return containerStyle.backgroundImage === 'none'
        && containerStyle.boxShadow === 'none'
        && settingsStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && statStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && Math.abs(toggleRect.width - 48) <= 1
        && Math.abs(toggleRect.height - 26) <= 1
    }, null, { timeout: 10000 })
    await page.waitForFunction(() => document.querySelectorAll('.chatbot-messages > .markstream-svelte .node-slot').length > 0, null, { timeout: 15000 })
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent?.includes('packages/'), homeRendererSelector, { timeout: 30000 })
    await page.waitForFunction(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      return scrollRoot
        && scrollRoot.scrollHeight - scrollRoot.clientHeight > 1000
        && document.querySelector('.chat-header__meta')?.textContent?.includes('Streaming')
    }, null, { timeout: 15000 })
    await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTo(0, 0))
    await page.waitForFunction(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      return scrollRoot && Math.abs(scrollRoot.scrollTop) <= 2
    }, null, { timeout: 5000 })
    const bottomPinnedBefore = await page.evaluate(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      return {
        scrollHeight: scrollRoot.scrollHeight,
        bottomGap: Math.abs(scrollRoot.scrollTop),
      }
    })
    await page.waitForTimeout(900)
    const bottomPinnedAfter = await page.evaluate(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      return {
        scrollHeight: scrollRoot.scrollHeight,
        bottomGap: Math.abs(scrollRoot.scrollTop),
      }
    })
    if (bottomPinnedAfter.scrollHeight <= bottomPinnedBefore.scrollHeight + 80)
      throw new Error('Homepage stream did not grow during bottom pinning probe')
    if (bottomPinnedAfter.bottomGap > 96)
      throw new Error(`Homepage should remain pinned at bottom while streaming: ${JSON.stringify({ bottomPinnedBefore, bottomPinnedAfter })}`)
    const manualScrollBefore = await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTop ?? 0)
    await page.locator('.chat-messages').hover()
    await page.mouse.wheel(0, -500)
    await page.waitForFunction(() => (document.querySelector('.chat-messages')?.scrollTop ?? 0) < -120, null, { timeout: 5000 })
    const manualScrollProbe = await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTop ?? 0)
    if (manualScrollProbe >= manualScrollBefore - 120)
      throw new Error(`Homepage manual scroll probe did not move upward: ${manualScrollBefore} -> ${manualScrollProbe}`)
    await page.waitForTimeout(900)
    const manualScrollAfter = await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTop ?? 0)
    if (Math.abs(manualScrollAfter - manualScrollProbe) > 32)
      throw new Error(`Homepage manual scroll should not be pulled back while streaming: ${manualScrollProbe} -> ${manualScrollAfter}`)
    await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTo(0, 0))
    await page.waitForFunction(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      return scrollRoot && Math.abs(scrollRoot.scrollTop) <= 2
    }, null, { timeout: 5000 })
    await page.waitForFunction(() => window.__markstreamSvelteMermaidWorkerMessages?.some(item => item.action === 'canParse'), null, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      const visibleCodeBlocks = Array.from(root.querySelectorAll('pre[data-markstream-code-block="1"], .code-block-container[data-markstream-code-block="1"]'))
        .filter((node) => {
          const rect = node.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      return visibleCodeBlocks.length > 0 && visibleCodeBlocks.every(node => (node.textContent || '').trim().length > 0)
    }, homeRendererSelector, { timeout: 15000 })
    await page.waitForFunction(() => document.querySelector('.chat-header__meta')?.textContent?.includes('Ready'), null, { timeout: 45000 })
    const homeCodeBlocks = page.locator(`${homeRendererSelector} .code-block-container[data-markstream-code-block="1"]`)
    const homeCodeBlockCount = await homeCodeBlocks.count()
    if (homeCodeBlockCount < 8)
      throw new Error(`Expected at least 8 homepage code blocks, received ${homeCodeBlockCount}`)
    for (let index = 0; index < homeCodeBlockCount; index += 1) {
      await homeCodeBlocks.nth(index).evaluate((block) => {
        const body = block.querySelector('.code-block-body')
        const state = {
          heights: [body?.getBoundingClientRect().height || 0],
          observer: null,
        }
        state.observer = new ResizeObserver(() => {
          state.heights.push(body?.getBoundingClientRect().height || 0)
        })
        if (body)
          state.observer.observe(body)
        block.__markstreamHandoffProbe = state
      })
      await homeCodeBlocks.nth(index).scrollIntoViewIfNeeded()
      try {
        await page.waitForFunction(({ selector, index }) => {
          const block = document.querySelectorAll(`${selector} .code-block-container[data-markstream-code-block="1"]`)[index]
          const fallback = block?.querySelector('.code-pre-fallback')
          const fallbackVisible = fallback && getComputedStyle(fallback).display !== 'none' && fallback.getBoundingClientRect().height > 0
          return block?.getAttribute('data-markstream-enhanced') === 'true'
            && !fallbackVisible
            && !!block.querySelector('.stream-diffs-shell, .monaco-editor, .monaco-diff-editor')
        }, { selector: homeRendererSelector, index }, { timeout: 30000 })
      }
      catch (error) {
        const state = await homeCodeBlocks.nth(index).evaluate((block) => {
          const fallback = block.querySelector('.code-pre-fallback')
          return {
            enhanced: block.getAttribute('data-markstream-enhanced'),
            fallbackDisplay: fallback ? getComputedStyle(fallback).display : null,
            hasSurface: !!block.querySelector('.stream-diffs-shell, .monaco-editor, .monaco-diff-editor'),
            label: block.querySelector('.code-block-header__label')?.textContent || '',
          }
        })
        throw new Error(`Homepage code block ${index} did not enhance: ${JSON.stringify(state)}`, { cause: error })
      }
      await page.waitForTimeout(50)
      const handoff = await homeCodeBlocks.nth(index).evaluate((block) => {
        const state = block.__markstreamHandoffProbe
        const body = block.querySelector('.code-block-body')
        state?.observer?.disconnect()
        const heights = state?.heights || []
        heights.push(body?.getBoundingClientRect().height || 0)
        delete block.__markstreamHandoffProbe
        return heights
      })
      const firstHeight = handoff[0] || 0
      const finalHeight = handoff.at(-1) || 0
      const maxHeight = Math.max(...handoff)
      if (Math.abs(firstHeight - finalHeight) > 2 || maxHeight > Math.max(firstHeight, finalHeight) + 2)
        throw new Error(`Homepage code block ${index} changed height during handoff: ${JSON.stringify(handoff)}`)
    }
    const homeCodeBlockState = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      return Array.from(root?.querySelectorAll('.code-block-container[data-markstream-code-block="1"]') ?? []).map((block, index) => {
        const fallback = block.querySelector('.code-pre-fallback')
        const fallbackVisible = fallback && getComputedStyle(fallback).display !== 'none' && fallback.getBoundingClientRect().height > 0
        return {
          index,
          label: block.querySelector('.code-block-header__label')?.textContent || '',
          enhanced: block.getAttribute('data-markstream-enhanced'),
          hasMonaco: !!block.querySelector('.stream-diffs-shell, .monaco-editor, .monaco-diff-editor'),
          fallbackVisible: !!fallbackVisible,
          bodyHeight: Math.round(block.querySelector('.code-block-body')?.getBoundingClientRect().height || 0),
          editorHeight: Math.round(block.querySelector('.code-editor-container')?.getBoundingClientRect().height || 0),
          monacoHeight: Math.round(block.querySelector('.stream-diffs-shell, .monaco-editor, .monaco-diff-editor')?.getBoundingClientRect().height || 0),
        }
      })
    }, homeRendererSelector)
    const invalidHomeCodeBlocks = homeCodeBlockState.filter(block => block.enhanced !== 'true' || !block.hasMonaco || block.fallbackVisible)
    if (invalidHomeCodeBlocks.length > 0)
      throw new Error(`Home code blocks must render Monaco without visible fallback: ${JSON.stringify(invalidHomeCodeBlocks)}`)
    const collapsedHomeCodeBlocks = homeCodeBlockState.filter(block => block.bodyHeight > 0 && block.editorHeight + 2 < block.bodyHeight)
    if (collapsedHomeCodeBlocks.length > 0)
      throw new Error(`Home code block Monaco containers must fill their body: ${JSON.stringify(collapsedHomeCodeBlocks)}`)
    const scrollProbe = await page.evaluate(() => {
      const scrollRoot = document.querySelector('.chat-messages')
      const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
      const target = -Math.max(0, maxScrollTop - 450)
      scrollRoot.scrollTo({ top: target, behavior: 'instant' })
      return { scrollY: scrollRoot.scrollTop, maxScrollTop }
    })
    if (scrollProbe.maxScrollTop > 1000) {
      await page.waitForTimeout(1200)
      const scrollAfterProbe = await page.evaluate(() => document.querySelector('.chat-messages')?.scrollTop ?? 0)
      if (Math.abs(scrollAfterProbe - scrollProbe.scrollY) > 24)
        throw new Error(`Homepage scroll jumped after manual scroll: ${scrollProbe.scrollY} -> ${scrollAfterProbe}`)
    }
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      const blockquote = root?.querySelector('blockquote.blockquote-node')
      if (!blockquote)
        return false
      const style = getComputedStyle(blockquote)
      return style.fontStyle === 'normal'
        && style.fontWeight === '400'
        && style.borderLeftWidth === '3px'
    }, homeRendererSelector, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      const outer = Array.from(root?.querySelectorAll('blockquote.blockquote-node') ?? [])
        .find(block => block.querySelector(':scope > blockquote.blockquote-node > blockquote.blockquote-node'))
      const middle = outer?.querySelector(':scope > blockquote.blockquote-node')
      const inner = middle?.querySelector(':scope > blockquote.blockquote-node')
      if (!outer || !middle || !inner)
        return false
      const heights = [outer, middle, inner].map(node => node.getBoundingClientRect().height)
      return heights[0] > heights[1] && heights[1] > heights[2]
    }, homeRendererSelector, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      const reference = root.querySelector('#fnref-1 .footnote-link')
      const footnote = root.querySelector('#fnref--1.footnote-node')
      const anchor = footnote?.querySelector('.footnote-anchor')
      const blankAnchor = root.querySelector('.markstream-nested-custom--footnote_anchor')
      return reference?.tagName === 'SPAN'
        && reference?.getAttribute('href') === '#fnref--1'
        && reference?.getAttribute('title') === '查看脚注 1'
        && footnote?.textContent?.includes('design/architecture.md')
        && anchor?.getAttribute('href') === '#fnref-1'
        && anchor?.getAttribute('title') === '返回引用 1'
        && !blankAnchor
    }, homeRendererSelector, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      const reference = root.querySelector('#fnref-1.footnote-reference')
      const referenceParagraph = reference?.closest('.paragraph-node')
      const footnote = root.querySelector('#fnref--1.footnote-node')
      const anchor = footnote?.querySelector('.footnote-anchor')
      const anchorParagraph = anchor?.closest('.paragraph-node')
      if (!reference || !referenceParagraph || !anchor || !anchorParagraph)
        return false
      const referenceStyle = getComputedStyle(reference)
      const anchorStyle = getComputedStyle(anchor)
      return referenceParagraph.textContent?.includes('theme customization')
        && referenceStyle.display === 'inline'
        && referenceStyle.verticalAlign === 'super'
        && anchorParagraph.textContent?.includes('complete token specification.')
        && anchor.parentElement === anchorParagraph
        && anchorStyle.display === 'inline'
    }, homeRendererSelector, { timeout: 15000 })
    const footnoteUrlBefore = page.url()
    await page.locator(`${homeRendererSelector} #fnref-1 .footnote-link`).click()
    await page.waitForFunction(() => {
      const footnote = document.getElementById('fnref--1')
      if (!footnote)
        return false
      const rect = footnote.getBoundingClientRect()
      return rect.top >= 0 && rect.top < window.innerHeight
    }, null, { timeout: 5000 })
    if (page.url() !== footnoteUrlBefore)
      throw new Error(`Footnote reference click changed URL: ${footnoteUrlBefore} -> ${page.url()}`)
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      const markstreamLogoImage = Array.from(root.querySelectorAll('img.image-node__img'))
        .find(img => img.getAttribute('alt') === 'Markstream logo')
      const error = Array.from(root.querySelectorAll('.image-error'))
        .find(node => (node.textContent || '').includes('Image failed to load'))
      return !!markstreamLogoImage
        && markstreamLogoImage.complete
        && markstreamLogoImage.naturalWidth > 0
        && !error
    }, homeRendererSelector, { timeout: 15000 })
    await page.waitForFunction(() => document.querySelectorAll('.chatbot-messages .thinking-node .markstream-svelte').length > 0, null, { timeout: 30000 })

    await page.evaluate(() => window.localStorage.setItem('vmr-test-render-mode', 'monaco'))
    await page.goto(`http://${host}:${port}/test`, { waitUntil: 'load' })
    await page.locator(testRendererSelector).waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction(() => document.querySelector('.workspace-card--preview')?.textContent?.includes('Markstream Test Lab'), null, { timeout: 15000 })
    await page.waitForFunction(() => document.querySelector('.workspace-card--preview')?.textContent?.includes('Vue 3 / Vue 2 / React / Angular / Svelte'), null, { timeout: 15000 })
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} .katex`).length > 0, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      return Array.from(root.querySelectorAll('.markstream-nested-math__source, .markstream-nested-math-block__source'))
        .every(node => getComputedStyle(node).display === 'none')
    }, testRendererSelector, { timeout: 15000 })
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} .markstream-svelte-mermaid svg`).length > 0, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .mermaid-block[data-markstream-mermaid="1"]`)
      const body = block?.querySelector('.mermaid-body')
      const preview = block?.querySelector('.mermaid-preview.markstream-svelte-mermaid')
      if (!block || !body || !preview)
        return false
      const blockStyle = getComputedStyle(block)
      const bodyStyle = getComputedStyle(body)
      const previewStyle = getComputedStyle(preview)
      return bodyStyle.paddingTop === '0px'
        && previewStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && previewStyle.color === blockStyle.color
    }, testRendererSelector, { timeout: 10000 })
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"] svg`).length > 0, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction(selector => document.querySelectorAll(`${selector} .markstream-svelte-enhanced-block--d2[data-markstream-d2="1"] svg`).length > 0, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      if (!root)
        return false
      const codeText = 'export function compareFramework'
      const candidates = Array.from(root.querySelectorAll('pre[data-markstream-code-block="1"], .code-block-container[data-markstream-code-block="1"], .markstream-svelte-enhanced-block--code'))
      return candidates.some((node) => {
        const rect = node.getBoundingClientRect()
        const diffsContainer = node.matches('diffs-container') ? node : node.querySelector('diffs-container')
        const text = `${node.textContent || ''} ${diffsContainer?.shadowRoot?.textContent || ''}`.replace(/\s+/g, ' ')
        return rect.width > 0 && rect.height > 0 && text.includes(codeText)
      })
    }, testRendererSelector, { timeout: 30000 })
    await page.locator(`${testRendererSelector} .code-block-container`).first().scrollIntoViewIfNeeded()
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .code-block-container[data-markstream-enhanced="true"]`)
      return !!block?.querySelector('.stream-diffs-shell, .monaco-editor')
    }, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .code-block-container[data-markstream-enhanced="true"]`)
      const editor = block?.querySelector('.stream-diffs-shell, .monaco-editor')
      if (!block || !editor)
        return false
      const fallback = block.querySelector('.code-pre-fallback')
      const fallbackVisible = fallback && getComputedStyle(fallback).display !== 'none' && fallback.getBoundingClientRect().height > 0
      const diffsContainer = editor.matches('diffs-container') ? editor : editor.querySelector('diffs-container')
      const tokenRoot = diffsContainer?.shadowRoot || editor
      const tokens = diffsContainer
        ? Array.from(tokenRoot.querySelectorAll('pre span'))
        : Array.from(tokenRoot.querySelectorAll('.view-line span span'))
      const tokenColors = new Set(tokens.map(node => getComputedStyle(node).color).filter(Boolean))
      return !fallbackVisible && tokenColors.size > 2
    }, testRendererSelector, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const root = document.querySelector(selector)
      const mermaid = root?.querySelector('.mermaid-block')
      const infographic = root?.querySelector('.markstream-svelte-enhanced-block--infographic')
      const d2 = root?.querySelector('.markstream-svelte-enhanced-block--d2')
      if (!mermaid || !infographic || !d2)
        return false
      return !mermaid.classList.contains('is-rendering')
        && !mermaid.querySelector('.mermaid-loading')
        && !infographic.classList.contains('is-rendering')
        && !d2.classList.contains('is-rendering')
    }, testRendererSelector, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const button = document.querySelector(`${selector} .code-block-container .code-action-btn`)
      return button && button.getAttribute('title') == null
    }, testRendererSelector, { timeout: 10000 })
    await page.waitForFunction((selector) => {
      const icon = document.querySelector(`${selector} .mermaid-actions .mermaid-btn svg`)
      if (!icon)
        return false
      const rect = icon.getBoundingClientRect()
      return rect.width > 8 && rect.height > 8
    }, testRendererSelector, { timeout: 10000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      const titleIcon = block?.querySelector('.markstream-svelte-enhanced-block__title-icon svg')
      const actionButtons = Array.from(block?.querySelectorAll('.markstream-svelte-enhanced-block__header .markstream-svelte-enhanced-block__action--icon') ?? [])
      const titleRect = titleIcon?.getBoundingClientRect()
      if (!titleRect || titleRect.width <= 8 || titleRect.height <= 8 || actionButtons.length < 4)
        return false
      return actionButtons.every((button) => {
        const buttonRect = button.getBoundingClientRect()
        const iconRect = button.querySelector('svg')?.getBoundingClientRect()
        return buttonRect.width > 20
          && buttonRect.height > 20
          && iconRect
          && iconRect.width > 8
          && iconRect.height > 8
          && (button.textContent || '').trim() === ''
      })
    }, testRendererSelector, { timeout: 10000 })
    await page.evaluate((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      const sourceButton = Array.from(block?.querySelectorAll('.infographic-mode-btn') ?? [])
        .find(button => (button.textContent || '').includes('Source'))
      sourceButton?.click()
    }, testRendererSelector)
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      return block?.getAttribute('data-markstream-mode') === 'source'
        && !!block.querySelector('.infographic-source > .infographic-source-code')
        && !block.querySelector('.infographic-render svg')
    }, testRendererSelector, { timeout: 10000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      const body = block?.querySelector('.infographic-block-body')
      const source = block?.querySelector('.infographic-source')
      const pre = block?.querySelector('.infographic-source-code')
      const code = pre?.querySelector('code')
      if (!body || !source || !pre || !code)
        return false
      const bodyStyle = getComputedStyle(body)
      const sourceStyle = getComputedStyle(source)
      const preStyle = getComputedStyle(pre)
      const codeStyle = getComputedStyle(code)
      return bodyStyle.paddingTop === '0px'
        && sourceStyle.backgroundColor === getComputedStyle(block).backgroundColor
        && preStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && preStyle.borderRadius === '0px'
        && preStyle.paddingTop === '0px'
        && preStyle.marginTop === '0px'
        && preStyle.boxShadow === 'none'
        && preStyle.fontSize === '14px'
        && preStyle.lineHeight === '20px'
        && preStyle.whiteSpace === 'pre-wrap'
        && codeStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && codeStyle.paddingTop === '0px'
    }, testRendererSelector, { timeout: 10000 })
    await page.evaluate((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      const previewButton = Array.from(block?.querySelectorAll('.infographic-mode-btn') ?? [])
        .find(button => (button.textContent || '').includes('Preview'))
      previewButton?.click()
    }, testRendererSelector)
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--infographic[data-markstream-infographic="1"]`)
      const svg = block?.querySelector('.infographic-render svg')
      const rect = svg?.getBoundingClientRect()
      return block?.getAttribute('data-markstream-mode') === 'preview'
        && rect
        && rect.width > 40
        && rect.height > 20
    }, testRendererSelector, { timeout: 10000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--d2[data-markstream-d2="1"]`)
      const header = block?.querySelector('.d2-block-header')
      const label = block?.querySelector('.d2-label')
      const modeToggle = block?.querySelector('.d2-mode-toggle')
      const actionButtons = Array.from(block?.querySelectorAll('.d2-header-actions .d2-action-btn') ?? [])
      const headerStyle = header ? getComputedStyle(header) : null
      if (!header || !label || !modeToggle || headerStyle?.display !== 'flex' || actionButtons.length < 3)
        return false
      return actionButtons.every((button) => {
        const buttonRect = button.getBoundingClientRect()
        const iconRect = button.querySelector('svg')?.getBoundingClientRect()
        return buttonRect.width > 20
          && buttonRect.height > 20
          && iconRect
          && iconRect.width > 8
          && iconRect.height > 8
          && (button.textContent || '').trim() === ''
      })
    }, testRendererSelector, { timeout: 10000 })
    await page.evaluate((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--d2[data-markstream-d2="1"]`)
      const sourceButton = Array.from(block?.querySelectorAll('.d2-mode-btn') ?? [])
        .find(button => (button.textContent || '').includes('Source'))
      sourceButton?.click()
    }, testRendererSelector)
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--d2[data-markstream-d2="1"]`)
      const source = block?.querySelector('.d2-source')
      const pre = block?.querySelector('.d2-code')
      const code = pre?.querySelector('code')
      if (!source || !pre || !code)
        return false
      const preStyle = getComputedStyle(pre)
      const codeStyle = getComputedStyle(code)
      return preStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && preStyle.borderRadius === '0px'
        && preStyle.paddingTop === '0px'
        && preStyle.marginTop === '0px'
        && preStyle.boxShadow === 'none'
        && preStyle.fontSize === '14px'
        && preStyle.lineHeight === '21px'
        && preStyle.whiteSpace === 'pre'
        && codeStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && codeStyle.paddingTop === '0px'
    }, testRendererSelector, { timeout: 10000 })
    await page.evaluate((selector) => {
      const block = document.querySelector(`${selector} .markstream-svelte-enhanced-block--d2[data-markstream-d2="1"]`)
      const previewButton = Array.from(block?.querySelectorAll('.d2-mode-btn') ?? [])
        .find(button => (button.textContent || '').includes('Preview'))
      previewButton?.click()
    }, testRendererSelector)
    await expectTooltip(page, page.locator(`${testRendererSelector} .code-block-container .code-action-btn`).first(), 'Copy')
    await expectTooltip(page, page.locator(`${testRendererSelector} a.link-node`).first(), 'github.com')
    await expectTooltip(page, page.locator(`${testRendererSelector} .mermaid-actions .mermaid-btn:not(:disabled)`).first(), 'Collapse')
    await expectTooltip(page, page.locator(`${testRendererSelector} .markstream-svelte-enhanced-block--infographic .markstream-svelte-enhanced-block__header .markstream-svelte-enhanced-block__action--icon`).first(), 'Collapse')
    await expectTooltip(page, page.locator(`${testRendererSelector} .markstream-svelte-enhanced-block--d2 .d2-header-actions .d2-action-btn`).first(), 'Copy')
    await page.locator(`${testRendererSelector} .mermaid-actions button[aria-label="Open"]:not(:disabled)`).click()
    await page.waitForFunction(() => {
      const root = document.querySelector('body > .markstream-svelte-modal-root')
      const panel = root?.querySelector('.mermaid-modal-panel')
      const contentSvg = root?.querySelector('.mermaid-modal-content svg')
      const controls = Array.from(root?.querySelectorAll('.mermaid-modal-controls button') ?? [])
      const panelRect = panel?.getBoundingClientRect()
      const svgRect = contentSvg?.getBoundingClientRect()
      return panelRect
        && panelRect.top >= 0
        && panelRect.left >= 0
        && panelRect.width > 300
        && panelRect.height > 300
        && svgRect
        && svgRect.width > 40
        && svgRect.height > 20
        && controls.length >= 4
    }, null, { timeout: 10000 })
    await page.locator('body > .markstream-svelte-modal-root .mermaid-modal-controls button[aria-label="Close"]').click()
    await page.waitForFunction(() => !document.querySelector('body > .markstream-svelte-modal-root'), null, { timeout: 5000 })
    await page.locator(`${testRendererSelector} .markstream-svelte-enhanced-block--infographic .infographic-header-actions button[aria-label="Open"]:not(:disabled)`).click()
    await page.waitForFunction(() => {
      const root = document.querySelector('body > .markstream-svelte-modal-root')
      const panel = root?.querySelector('.infographic-modal-panel')
      const contentSvg = root?.querySelector('.infographic-modal-content svg')
      const controls = Array.from(root?.querySelectorAll('.mermaid-modal-controls button') ?? [])
      const panelRect = panel?.getBoundingClientRect()
      const svgRect = contentSvg?.getBoundingClientRect()
      return panelRect
        && panelRect.top >= 0
        && panelRect.left >= 0
        && panelRect.width > 300
        && panelRect.height > 300
        && svgRect
        && svgRect.width > 40
        && svgRect.height > 20
        && controls.length >= 4
    }, null, { timeout: 10000 })
    await page.locator('body > .markstream-svelte-modal-root .mermaid-modal-controls button[aria-label="Close"]').click()
    await page.waitForFunction(() => !document.querySelector('body > .markstream-svelte-modal-root'), null, { timeout: 5000 })

    await page.selectOption('.workspace-card--editor select', 'diff')
    await page.waitForFunction(() => document.querySelector('.workspace-card--preview')?.textContent?.includes('Diff Regression'), null, { timeout: 15000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .code-block-container.is-diff`)
      return !!block?.querySelector('.stream-diffs-shell, .monaco-diff-editor')
    }, testRendererSelector, { timeout: 30000 })
    await page.waitForFunction((selector) => {
      const block = document.querySelector(`${selector} .code-block-container.is-diff`)
      const host = block?.querySelector('.code-editor-container')
      const editor = block?.querySelector('.stream-diffs-shell, .monaco-diff-editor')
      if (!host || !editor)
        return false
      const hostRect = host.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()
      return hostRect.width > 0
        && hostRect.height > 120
        && hostRect.height < 700
        && Math.abs(hostRect.height - editorRect.height) <= 2
    }, testRendererSelector, { timeout: 15000 })

    if (errors.length) {
      throw new Error(`Browser errors:\\n${errors.join('\\n')}`)
    }

    await context.close()
    console.log(`[e2e-svelte-playground] ok on ${host}:${port}`)
  }
  catch (error) {
    console.error(server.getLogs())
    throw error
  }
  finally {
    await browser?.close().catch(() => {})
    killProcessTree(server.child)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
