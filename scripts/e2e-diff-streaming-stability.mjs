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
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'

const diffSample = [
  '```diff json:package.json',
  '{',
  '  "name": "markstream-vue",',
  '- "version": "0.0.49",',
  '+ "version": "0.0.54-beta.1",',
  '  "packageManager": "pnpm@10.16.1",',
  '}',
  '```',
].join('\n')

const sampleFrameIntervalMs = 25
const sampleStreamCharDelayMs = 80
const estimatedStreamingDurationMs
  = diffSample.length * sampleStreamCharDelayMs
const samplingDurationMs = Math.max(
  12000,
  estimatedStreamingDurationMs + 4000,
)
const samplingFrameCount = Math.ceil(
  samplingDurationMs / sampleFrameIntervalMs,
)

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

async function findFreePort(start = 4370, end = 4410) {
  for (let port = start; port <= end; port++) {
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

function range(values) {
  if (!values.length)
    return null
  return Math.max(...values) - Math.min(...values)
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)

  try {
    await waitForPort(port)

    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: `http://${host}:${port}`,
            localStorage: [
              { name: 'vmr-test-render-mode', value: 'monaco' },
              { name: 'vmr-test-code-stream', value: 'true' },
              { name: 'vmr-test-stream-chunk-size-min', value: '1' },
              { name: 'vmr-test-stream-chunk-size-max', value: '1' },
              { name: 'vmr-test-stream-delay-min', value: '80' },
              { name: 'vmr-test-stream-delay-max', value: '80' },
              { name: 'vmr-test-stream-burstiness', value: '0' },
              { name: 'vmr-test-stream-slice-mode', value: 'pure-random' },
              { name: 'vmr-test-stream-transport-mode', value: 'scheduler' },
            ],
          },
        ],
      },
    })
    const page = await context.newPage()

    await page.goto(`http://${host}:${port}/test`, { waitUntil: 'load' })
    await page.waitForSelector('.editor-textarea')
    await page.evaluate((sample) => {
      const textarea = document.querySelector('.editor-textarea')
      textarea.value = sample
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }, diffSample)
    await page.getByRole('button', { name: '开始流式渲染' }).click()
    await page.waitForSelector('.code-block-container')
    await page.evaluate(() => {
      document.querySelector('.code-block-container')?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      })
    })

    const frames = []
    for (let index = 0; index < samplingFrameCount; index++) {
      await page.waitForTimeout(sampleFrameIntervalMs)
      const frame = await page.evaluate(() => {
        const preview = document.querySelector('.preview-surface')
        const viewportCenter = window.innerHeight / 2
        const diffRoots = Array.from(
          document.querySelectorAll('.preview-surface .stream-monaco-diff-root'),
        )
        const diffRoot = diffRoots
          .map((root) => {
            const rect = root.getBoundingClientRect()
            const visibleHeight = Math.max(
              0,
              Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
            )
            return {
              root,
              rect,
              visibleHeight,
              distance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter),
            }
          })
          .filter(entry => entry.visibleHeight > 0)
          .sort((a, b) => {
            if (b.visibleHeight !== a.visibleHeight)
              return b.visibleHeight - a.visibleHeight
            return a.distance - b.distance
          })[0]
          ?.root ?? null
        const block = diffRoot?.closest('.code-block-container') ?? null
        const editorContainer = block?.querySelector('.code-editor-container') ?? null
        const diffRootDataset = diffRoot
          ? {
              streamingInlineControlledRaw: diffRoot.dataset.streamingInlineControlledRaw ?? null,
              streamingInlineNextSpecCount: diffRoot.dataset.streamingInlineNextSpecCount ?? null,
              streamingInlineVisibleSpecCount: diffRoot.dataset.streamingInlineVisibleSpecCount ?? null,
              streamingInlineRenderedSpecCount: diffRoot.dataset.streamingInlineRenderedSpecCount ?? null,
              streamingInlineNodeCount: diffRoot.dataset.streamingInlineNodeCount ?? null,
              streamingInlineNodesConnected: diffRoot.dataset.streamingInlineNodesConnected ?? null,
              streamingInlineReuse: diffRoot.dataset.streamingInlineReuse ?? null,
              streamingInlineDefer: diffRoot.dataset.streamingInlineDefer ?? null,
              streamingInlineRenderedMode: diffRoot.dataset.streamingInlineRenderedMode ?? null,
            }
          : null
        const modifiedScroll = diffRoot?.querySelector(
          '.editor.modified .monaco-scrollable-element.editor-scrollable',
        ) ?? null
        const diffStatsText = block?.querySelector('.code-diff-stats')?.textContent?.trim() ?? null
        const versionLine = Array.from(
          diffRoot?.querySelectorAll('.editor.modified .view-line') ?? [],
        ).find((element) => {
          if (!(element.textContent || '').includes('0.0.54-beta.1'))
            return false
          const style = getComputedStyle(element)
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number.parseFloat(style.opacity || '1') > 0.01
        })
        const versionLineDetail = versionLine
          ? (() => {
              const rect = versionLine.getBoundingClientRect()
              const style = getComputedStyle(versionLine)
              const parent = versionLine.parentElement
              const parentRect = parent?.getBoundingClientRect() ?? null
              const parentStyle = parent ? getComputedStyle(parent) : null
              return {
                text: (versionLine.textContent || '').trim(),
                top: Math.round(rect.top),
                height: Math.round(rect.height),
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                lineHeight: style.lineHeight,
                innerHTML: versionLine.innerHTML.slice(0, 300),
                parentClassName: typeof parent?.className === 'string' ? parent.className : '',
                parentTop: parentRect ? Math.round(parentRect.top) : null,
                parentHeight: parentRect ? Math.round(parentRect.height) : null,
                parentDisplay: parentStyle?.display ?? null,
                parentVisibility: parentStyle?.visibility ?? null,
                parentOpacity: parentStyle?.opacity ?? null,
              }
            })()
          : null

        const visibleEditorDiffTexts = Array.from(
          diffRoot?.querySelectorAll(
            '.editor.modified .view-line, .editor.modified .stream-monaco-fallback-inline-delete-zone, .editor.modified .inline-deleted-text, .editor.modified .view-lines.line-delete',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const text = (element.textContent || '').replace(/\u00A0/g, ' ').trim()
            const style = getComputedStyle(element)
            return {
              text,
              top: Math.round(rect.top),
              height: Math.round(rect.height),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
          .filter(entry =>
            entry.height > 0
            && entry.display !== 'none'
            && entry.visibility !== 'hidden'
            && Number.parseFloat(entry.opacity || '1') > 0.01
            && (entry.text.includes('version')
              || entry.text.includes('0.0.49')
              || entry.text.includes('0.0.54')),
          )
          .sort((left, right) => {
            if (left.top !== right.top)
              return left.top - right.top
            return left.text.localeCompare(right.text)
          })
        const uniqueVisibleDiffTexts = []
        const visibleDiffKeys = new Set()
        for (const entry of visibleEditorDiffTexts) {
          const key = `${entry.top}:${entry.text}`
          if (visibleDiffKeys.has(key))
            continue
          visibleDiffKeys.add(key)
          uniqueVisibleDiffTexts.push(entry)
        }
        const visibleFallbackDiffTexts = Array.from(
          block?.querySelectorAll(
            'pre.code-pre-fallback .markstream-pre__diff-line--removed .markstream-pre__diff-content, pre.code-pre-fallback .markstream-pre__diff-line--added .markstream-pre__diff-content',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const text = (element.textContent || '').replace(/\u00A0/g, ' ').trim()
            const style = getComputedStyle(element)
            return {
              text,
              top: Math.round(rect.top),
              height: Math.round(rect.height),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
          .filter(entry =>
            entry.height > 0
            && entry.display !== 'none'
            && entry.visibility !== 'hidden'
            && Number.parseFloat(entry.opacity || '1') > 0.01
            && (entry.text.includes('version')
              || entry.text.includes('0.0.49')
              || entry.text.includes('0.0.54')),
          )

        for (const entry of visibleFallbackDiffTexts) {
          const key = `${entry.top}:${entry.text}`
          if (visibleDiffKeys.has(key))
            continue
          visibleDiffKeys.add(key)
          uniqueVisibleDiffTexts.push(entry)
        }

        uniqueVisibleDiffTexts.sort((left, right) => {
          if (left.top !== right.top)
            return left.top - right.top
          return left.text.localeCompare(right.text)
        })

        const visibleVersionText = uniqueVisibleDiffTexts.find(item =>
          item.text.includes('"version"') && item.text.includes('0.0.54-beta.1'),
        )
        const inlineDeleteCandidates = Array.from(
          diffRoot?.querySelectorAll(
            [
              '.editor.modified .view-zones .view-lines.line-delete',
              '.editor.modified .inline-deleted-text',
              '.editor.modified .stream-monaco-fallback-inline-delete-zone',
              '.editor.modified .stream-monaco-fallback-inline-delete-line',
            ].join(','),
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: (element.textContent || '').replace(/\u00A0/g, ' ').trim().slice(0, 120),
              className: typeof element.className === 'string' ? element.className : '',
              parentClassName: typeof element.parentElement?.className === 'string'
                ? element.parentElement.className
                : '',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })

        const visibleOldNodes = Array.from(
          diffRoot?.querySelectorAll(
            '.editor.modified .stream-monaco-fallback-inline-delete-zone, .editor.modified .stream-monaco-fallback-inline-delete-line, .editor.modified .inline-deleted-text, .editor.modified .view-line.line-delete, .editor.modified .view-lines.line-delete',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: (element.textContent || '').trim(),
              className: typeof element.className === 'string' ? element.className : '',
              parentClassName: typeof element.parentElement?.className === 'string'
                ? element.parentElement.className
                : '',
              inViewZones: !!element.closest('.view-zones'),
              inOverlayRoot: !!element.closest('.stream-monaco-fallback-inline-delete-overlay-root'),
              width: rect.width,
              height: rect.height,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
          .filter(entry =>
            entry.width > 0
            && entry.height > 0
            && entry.display !== 'none'
            && entry.visibility !== 'hidden'
            && Number.parseFloat(entry.opacity || '1') > 0.01
            && entry.text.includes('0.0.49'),
          )
        const allFallbackZones = Array.from(
          diffRoot?.querySelectorAll(
            '.editor.modified .stream-monaco-fallback-inline-delete-zone, .editor.modified .stream-monaco-fallback-inline-delete-line',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: (element.textContent || '').trim(),
              className: typeof element.className === 'string' ? element.className : '',
              parentClassName: typeof element.parentElement?.className === 'string'
                ? element.parentElement.className
                : '',
              inViewZones: !!element.closest('.view-zones'),
              inOverlayRoot: !!element.closest('.stream-monaco-fallback-inline-delete-overlay-root'),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
        const extraFallbackZones = allFallbackZones.filter((entry) => {
          return entry.text.length > 0
            && !entry.text.includes('"version"')
            && !entry.text.includes('0.0.49')
        })
        const nearbyModifiedRows = Array.from(
          diffRoot?.querySelectorAll(
            '.editor.modified .view-line, .editor.modified .view-zones > div, .editor.modified .margin-view-zones > div',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: (element.textContent || '').trim(),
              className: typeof element.className === 'string' ? element.className : '',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
          .filter(entry => entry.height > 0 && entry.top >= 740 && entry.top <= 880)
        const visibleViewportRows = Array.from(
          diffRoot?.querySelectorAll(
            '.editor.modified .view-line, .editor.modified .view-zones > div, .editor.modified .margin-view-zones > div, .editor.modified .margin-view-overlays > div',
          ) ?? [],
        )
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: (element.textContent || '').trim().slice(0, 160),
              className: typeof element.className === 'string' ? element.className : '',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })
          .filter(entry => entry.height > 0 && entry.top >= 620 && entry.top <= 1180)

        const sampleVisibleLineParents = Array.from(
          diffRoot?.querySelectorAll('.editor.modified .view-line') ?? [],
        )
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return rect.width > 0
              && rect.height > 0
              && style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number.parseFloat(style.opacity || '1') > 0.01
          })
          .slice(0, 6)
          .map((element) => {
            const chain = []
            let current = element
            for (let index = 0; index < 6 && current; index++) {
              chain.push({
                tag: current.tagName,
                className: typeof current.className === 'string' ? current.className : '',
              })
              current = current.parentElement
            }
            return {
              text: (element.textContent || '').trim().slice(0, 80),
              chain,
            }
          })

        const visibleViewLineGroups = Array.from(
          diffRoot?.querySelectorAll('.editor.modified .view-lines') ?? [],
        )
          .map((element) => {
            const style = getComputedStyle(element)
            const visibleLines = Array.from(
              element.querySelectorAll < HTMLElement > ('.view-line'),
            ).filter((line) => {
              const lineRect = line.getBoundingClientRect()
              const lineStyle = getComputedStyle(line)
              return lineRect.width > 0
                && lineRect.height > 0
                && lineStyle.display !== 'none'
                && lineStyle.visibility !== 'hidden'
                && Number.parseFloat(lineStyle.opacity || '1') > 0.01
            }).length
            const tops = Array.from(
              element.querySelectorAll < HTMLElement > ('.view-line'),
            )
              .map((line) => {
                const lineRect = line.getBoundingClientRect()
                const lineStyle = getComputedStyle(line)
                if (
                  lineRect.width <= 0
                  || lineRect.height <= 0
                  || lineStyle.display === 'none'
                  || lineStyle.visibility === 'hidden'
                  || Number.parseFloat(lineStyle.opacity || '1') <= 0.01
                ) {
                  return null
                }
                return Math.round(lineRect.top)
              })
              .filter(top => Number.isFinite(top))
            return {
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              visibleLineCount: visibleLines,
              minTop: tops.length ? Math.min(...tops) : null,
              maxTop: tops.length ? Math.max(...tops) : null,
            }
          })
          .filter(entry =>
            entry.display !== 'none'
            && entry.visibility !== 'hidden'
            && Number.parseFloat(entry.opacity || '1') > 0.01
            && entry.visibleLineCount > 0,
          )

        return {
          hasRoot: !!diffRoot,
          targetRootTop: diffRoot ? Math.round(diffRoot.getBoundingClientRect().top) : null,
          blockClassName: typeof block?.className === 'string' ? block.className : null,
          blockPending: block?.getAttribute('data-markstream-pending') ?? null,
          blockEnhanced: block?.getAttribute('data-markstream-enhanced') ?? null,
          inlineDeleteCandidates,
          editorContainerClassName: typeof editorContainer?.className === 'string'
            ? editorContainer.className
            : null,
          fallbackText: (block?.querySelector('pre.code-pre-fallback')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
          streaming: !!diffRoot && diffRoot.classList.contains('stream-monaco-diff-streaming-active'),
          diffStatsText,
          diffRootDataset,
          previewScrollTop: preview ? Math.round(preview.scrollTop) : null,
          blockTop: block ? Math.round(block.getBoundingClientRect().top) : null,
          modifiedScrollTop: modifiedScroll ? Math.round(modifiedScroll.scrollTop) : null,
          versionTop: versionLine ? Math.round(versionLine.getBoundingClientRect().top) : visibleVersionText?.top ?? null,
          versionLineDetail,
          visibleDiffTexts: uniqueVisibleDiffTexts,
          visibleOldNodes,
          allFallbackZones,
          extraFallbackZones,
          nearbyModifiedRows,
          visibleViewportRows,
          visibleViewLineGroups,
          sampleVisibleLineParents,
        }
      })
      frames.push(frame)
    }

    const activeFrames = frames.filter(frame => frame.hasRoot || frame.diffStatsText?.includes('-1'))
    const firstStablePairIndex = activeFrames.findIndex((frame) => {
      const texts = frame.visibleDiffTexts.map(item => item.text)
      return texts.some(text => text.includes('"version"') && text.includes('0.0.49'))
        && texts.some(text => text.includes('"version"') && text.includes('0.0.54-beta.1'))
    })
    const stableFrames = firstStablePairIndex === -1
      ? []
      : activeFrames.slice(firstStablePairIndex)
    const oldOnlyFramesBeforePair = (firstStablePairIndex === -1
      ? activeFrames
      : activeFrames.slice(0, firstStablePairIndex))
      .filter((frame) => {
        return frame.visibleDiffTexts.some(item => item.text.includes('0.0.49'))
          && !frame.visibleDiffTexts.some(item => item.text.includes('0.0.54-beta.1'))
      })
    const newOnlyFramesBeforePair = (firstStablePairIndex === -1
      ? activeFrames
      : activeFrames.slice(0, firstStablePairIndex))
      .filter((frame) => {
        return frame.visibleDiffTexts.some(item => item.text.includes('0.0.54-beta.1'))
          && !frame.visibleDiffTexts.some(item => item.text.includes('0.0.49'))
      })
    const versionFrames = stableFrames.filter(frame => Number.isFinite(frame.versionTop))
    const missingVersionFrames = stableFrames.filter(frame => !Number.isFinite(frame.versionTop))
    const signatureValues = versionFrames.map(frame =>
      JSON.stringify(frame.visibleDiffTexts.map(item => item.text)),
    )
    const zeroDiffStatsFrames = activeFrames.filter((frame) => {
      if (!frame.streaming)
        return false
      const stats = (frame.diffStatsText || '').replace(/\s+/g, '')
      return stats === '-0+0' || stats === '-0+0…'
    })
    const blankViewportFrames = activeFrames.filter(frame =>
      frame.visibleViewportRows.filter(row => !row.text).length >= 4,
    )
    const finalVersionFrames = versionFrames.slice(-24)
    const finalNativeReadyFrames = finalVersionFrames.filter(frame =>
      frame.blockEnhanced === 'true'
      && typeof frame.editorContainerClassName === 'string'
      && !frame.editorContainerClassName.includes('is-hidden')
      && frame.visibleOldNodes.some(node =>
        node.className.includes('line-delete')
        && !node.className.includes('stream-monaco-fallback'),
      ),
    )
    const finalFallbackFrames = finalVersionFrames.filter(frame =>
      frame.blockPending === 'true'
      || (typeof frame.editorContainerClassName === 'string' && frame.editorContainerClassName.includes('is-hidden'))
      || frame.visibleOldNodes.some(node => node.className.includes('stream-monaco-fallback')),
    )
    const finalSignatureValues = finalVersionFrames.map(frame =>
      JSON.stringify(frame.visibleDiffTexts.map(item => item.text)),
    )
    const result = {
      activeFrameCount: activeFrames.length,
      stableFrameCount: stableFrames.length,
      versionFrameCount: versionFrames.length,
      finalFrameCount: finalVersionFrames.length,
      oldOnlyFramesBeforePair: oldOnlyFramesBeforePair.length,
      newOnlyFramesBeforePair: newOnlyFramesBeforePair.length,
      previewScrollTopRange: range(versionFrames.map(frame => frame.previewScrollTop).filter(Number.isFinite)),
      blockTopRange: range(versionFrames.map(frame => frame.blockTop).filter(Number.isFinite)),
      modifiedScrollTopRange: range(versionFrames.map(frame => frame.modifiedScrollTop).filter(Number.isFinite)),
      versionTopRange: range(versionFrames.map(frame => frame.versionTop).filter(Number.isFinite)),
      diffSignatureCount: new Set(signatureValues).size,
      finalDiffSignatureCount: new Set(finalSignatureValues).size,
      finalNativeReadyFrames: finalNativeReadyFrames.length,
      finalFallbackFrames: finalFallbackFrames.length,
      duplicateOldVisibleFrames: versionFrames.filter(frame =>
        frame.visibleOldNodes.filter(node => node.className.includes('stream-monaco-fallback-inline-delete-zone')).length > 1,
      ).length,
      missingVersionFrames: missingVersionFrames.length,
      zeroDiffStatsFrames: zeroDiffStatsFrames.length,
      blankViewportFrames: blankViewportFrames.length,
      extraFallbackZoneFrames: versionFrames.filter(frame => frame.extraFallbackZones.length > 0).length,
      multipleVisibleViewLineGroupFrames: versionFrames.filter(frame => frame.visibleViewLineGroups.length > 1).length,
      badSignatureFrames: versionFrames.filter((frame) => {
        const texts = frame.visibleDiffTexts.map(item => item.text)
        return !texts.some(text => text.includes('"version"') && text.includes('0.0.49'))
          || !texts.some(text => text.includes('"version"') && text.includes('0.0.54-beta.1'))
      }).length,
      shiftedFrames: versionFrames
        .filter(frame =>
          frame.versionTop !== versionFrames[0]?.versionTop,
        )
        .slice(0, 12),
      firstVersionFrame: versionFrames[0] ?? null,
      firstActiveFrame: activeFrames[0] ?? null,
      firstBadOldFrame: versionFrames.find(frame =>
        frame.visibleOldNodes.filter(node => node.className.includes('stream-monaco-fallback-inline-delete-zone')).length > 1,
      ) ?? null,
      firstOldOnlyFrame: oldOnlyFramesBeforePair[0] ?? null,
      firstNewOnlyFrame: newOnlyFramesBeforePair[0] ?? null,
      firstMissingVersionFrame: missingVersionFrames[0] ?? null,
      firstZeroDiffStatsFrame: zeroDiffStatsFrames[0] ?? null,
      firstBlankViewportFrame: blankViewportFrames[0] ?? null,
      firstBadFinalFrame: finalVersionFrames.find(frame =>
        frame.blockEnhanced !== 'true'
        || typeof frame.editorContainerClassName !== 'string'
        || frame.editorContainerClassName.includes('is-hidden')
        || !frame.visibleOldNodes.some(node =>
          node.className.includes('line-delete')
          && !node.className.includes('stream-monaco-fallback'),
        )
        || frame.visibleOldNodes.some(node => node.className.includes('stream-monaco-fallback')),
      ) ?? null,
      firstBadSignatureFrame: versionFrames.find((frame) => {
        const texts = frame.visibleDiffTexts.map(item => item.text)
        return !texts.some(text => text.includes('"version"') && text.includes('0.0.49'))
          || !texts.some(text => text.includes('"version"') && text.includes('0.0.54-beta.1'))
      }) ?? null,
    }

    const ok = result.activeFrameCount >= 12
      && result.stableFrameCount > 0
      && result.versionFrameCount > 0
      && result.finalFrameCount >= 12
      && result.newOnlyFramesBeforePair === 0
      && result.previewScrollTopRange === 0
      && result.blockTopRange === 0
      && result.modifiedScrollTopRange === 0
      && result.missingVersionFrames === 0
      && result.zeroDiffStatsFrames === 0
      && result.blankViewportFrames === 0
      && result.versionTopRange === 0
      && result.finalDiffSignatureCount === 1
      && result.finalNativeReadyFrames === result.finalFrameCount
      && result.finalFallbackFrames === 0
      && result.duplicateOldVisibleFrames === 0
      && result.extraFallbackZoneFrames === 0
      && result.multipleVisibleViewLineGroupFrames === 0
      && result.badSignatureFrames === 0

    console.log(JSON.stringify({ ok, ...result }, null, 2))

    await context.close()
    await browser.close()
    killProcessTree(server.child)
    process.exit(ok ? 0 : 1)
  }
  catch (error) {
    killProcessTree(server.child)
    console.error(server.getLogs())
    console.error(error)
    process.exit(1)
  }
}

main()
