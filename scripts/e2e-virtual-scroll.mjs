#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'
const virtualScrollDistDir = '.tmp/virtual-scroll-e2e-dist'

function readMode() {
  const arg = process.argv.find(value => value.startsWith('--mode='))
  const raw = arg
    ? arg.slice('--mode='.length)
    : process.env.MARKSTREAM_E2E_VIRTUAL_SCROLL_MODE || 'smoke'

  if (raw !== 'smoke' && raw !== 'stress')
    throw new Error(`Invalid virtual-scroll e2e mode: ${raw}`)

  return raw
}

const mode = readMode()
const stressMode = mode === 'stress'

function assert(condition, message, details) {
  if (condition)
    return

  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : ''
  throw new Error(`${message}${suffix}`)
}

function isRecoverableNavigationError(error) {
  const message = String(error?.message || error)
  return message.includes('ERR_CONNECTION_REFUSED')
    || message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')
}

async function gotoWithServer(page, url, options, ensureServerRunning) {
  await ensureServerRunning?.()

  try {
    return await page.goto(url, options)
  }
  catch (error) {
    if (!ensureServerRunning || !isRecoverableNavigationError(error))
      throw error

    await ensureServerRunning()
    return await page.goto(url, options)
  }
}

async function reloadWithServer(page, options, ensureServerRunning) {
  await ensureServerRunning?.()

  try {
    return await page.reload(options)
  }
  catch (error) {
    if (!ensureServerRunning || !isRecoverableNavigationError(error))
      throw error

    const url = page.url()
    await ensureServerRunning()
    return await page.goto(url, options)
  }
}

function outerAnchorDelta(before, after) {
  if (!before || !after || before.type !== after.type)
    return Number.POSITIVE_INFINITY

  if (before.type === 'bottom') {
    return Math.abs(
      Number(before.distanceFromBottomPx ?? 0)
      - Number(after.distanceFromBottomPx ?? 0),
    )
  }

  if (before.messageKey && after.messageKey && before.messageKey !== after.messageKey)
    return Number.POSITIVE_INFINITY

  if (before.messageKey == null && after.messageKey == null && before.index !== after.index)
    return Number.POSITIVE_INFINITY

  return Math.abs(Number(before.offsetPx ?? 0) - Number(after.offsetPx ?? 0))
}

function assertThreadRestore(label, before, after) {
  const scrollDelta = Math.abs(before.scrollTop - after.scrollTop)
  const anchorDelta = outerAnchorDelta(before.outerAnchor, after.outerAnchor)
  const sameFirstVisible = Boolean(
    before.firstVisibleMessageId
    && after.firstVisibleMessageId
    && before.firstVisibleMessageId === after.firstVisibleMessageId,
  )

  assert(
    sameFirstVisible || scrollDelta < 32 || anchorDelta < 32,
    `${label} scroll position was not restored accurately`,
    {
      before: {
        scrollTop: before.scrollTop,
        firstVisibleMessageId: before.firstVisibleMessageId,
        outerAnchor: before.outerAnchor,
      },
      after: {
        scrollTop: after.scrollTop,
        firstVisibleMessageId: after.firstVisibleMessageId,
        outerAnchor: after.outerAnchor,
      },
      sameFirstVisible,
      scrollDelta,
      anchorDelta,
    },
  )
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

async function findFreePort(start = 4360, end = 4399) {
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

async function waitForHttpReady(port, pathName = '/', timeoutMs = 60000) {
  const startedAt = Date.now()
  const url = `http://${host}:${port}${pathName}`
  let lastStatus = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      })

      lastStatus = `${response.status} ${response.statusText}`.trim()

      if (response.ok)
        return
    }
    catch (error) {
      lastStatus = error?.message || String(error)
    }

    await new Promise(resolve => setTimeout(resolve, 150))
  }

  throw new Error(`Timed out waiting for ${url} to be ready: ${lastStatus}`)
}

function killProcessTree(child) {
  if (!child || child.killed)
    return

  try {
    if (process.platform !== 'win32' && child.pid)
      process.kill(-child.pid, 'SIGTERM')
    else
      child.kill('SIGTERM')
  }
  catch {}

  setTimeout(() => {
    try {
      if (process.platform !== 'win32' && child.pid)
        process.kill(-child.pid, 'SIGKILL')
      else if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    typeof chromium.executablePath === 'function'
      ? chromium.executablePath()
      : '',
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
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  }
}

function runCommand(command, args, options = {}) {
  const logs = []

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
      },
      ...options,
    })

    child.stdout.on('data', chunk => logs.push(String(chunk)))
    child.stderr.on('data', chunk => logs.push(String(chunk)))

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({ logs: logs.join('') })
        return
      }

      reject(new Error([
        `${command} ${args.join(' ')} failed`,
        `exitCode=${code}`,
        `signal=${signal || ''}`,
        logs.join(''),
      ].join('\n')))
    })
  })
}

async function buildPlaygroundForE2E() {
  await runCommand('pnpm', [
    '-C',
    playgroundDir,
    'exec',
    'vite',
    'build',
    '--outDir',
    virtualScrollDistDir,
    '--emptyOutDir',
  ], {
    cwd: repoRoot,
  })
}

function startPreviewServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    [
      '-C',
      playgroundDir,
      'exec',
      'vite',
      'preview',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort',
      '--outDir',
      virtualScrollDistDir,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
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

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    [
      '-C',
      playgroundDir,
      'exec',
      'vite',
      '--force',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
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

async function collectPageDebugState(page) {
  if (!page)
    return null

  return page.evaluate(() => {
    const app = document.querySelector('#app')
    const root = document.querySelector('[data-testid="virtual-scroll-root"]')
    const api = window.__markstreamVirtualScrollLab
    const timelineApi = window.__markstreamVirtualTimelineZero

    let snapshot = null
    try {
      snapshot = api?.read?.() ?? null
    }
    catch {}

    let timelineSnapshot = null
    try {
      timelineSnapshot = timelineApi?.read?.() ?? null
    }
    catch {}

    return {
      href: window.location.href,
      readyState: document.readyState,
      title: document.title,
      hasLabApi: Boolean(api),
      hasVirtualTimelineZeroApi: Boolean(timelineApi),
      hasApp: Boolean(app),
      appHtmlLength: app?.innerHTML?.length ?? 0,
      appText: app?.textContent?.slice(0, 1000) ?? '',
      hasScrollRoot: Boolean(root),
      bodyText: document.body?.textContent?.slice(0, 1000) ?? '',
      scriptCount: document.scripts.length,
      snapshot,
      timelineSnapshot,
    }
  }).catch(() => null)
}

async function waitForLabReady(page, timeoutMs = 120000) {
  const startedAt = Date.now()
  let lastDebugState = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})

      const stable = await page.evaluate(async () => {
        const api = window.__markstreamVirtualScrollLab
        const root = document.querySelector('[data-testid="virtual-scroll-root"]')

        if (!api || typeof api.read !== 'function' || typeof api.nextFrame !== 'function')
          return false

        if (!root)
          return false

        for (let i = 0; i < 3; i++)
          await api.nextFrame()

        const snapshot = api.read()
        return Boolean(
          snapshot
          && snapshot.ready === true
          && snapshot.labStatus !== 'warming'
          && snapshot.health
          && document.querySelector('[data-testid="virtual-scroll-root"]'),
        )
      }).catch(() => false)

      if (stable)
        return
    }
    catch {}

    lastDebugState = await collectPageDebugState(page)
    await page.waitForTimeout(150)
  }

  throw new Error(`Timed out waiting for virtual-scroll lab readiness\n${JSON.stringify(lastDebugState, null, 2)}`)
}

async function evaluateWithLab(page, task, arg) {
  await waitForLabReady(page)

  return page.evaluate(async ([fnSource, payload]) => {
    const api = window.__markstreamVirtualScrollLab

    if (!api || typeof api.read !== 'function' || typeof api.nextFrame !== 'function')
      throw new Error('virtual-scroll lab API disappeared before evaluation')

    const fn = eval(`(${fnSource})`)
    return fn(api, payload)
  }, [String(task), arg])
}

const virtualTimelineZeroStorageKey = 'markstream-vue:virtual-timeline-zero:thread-states:v1'

function summarizeVirtualTimelineZeroSample(sample) {
  if (!sample)
    return null

  const { storagePayload, ...rest } = sample

  return {
    ...rest,
    visibleText: typeof rest.visibleText === 'string'
      ? rest.visibleText.slice(0, 240)
      : '',
    viewportText: typeof rest.viewportText === 'string'
      ? rest.viewportText.slice(0, 240)
      : '',
  }
}

async function waitForVirtualTimelineZeroReady(page, timeoutMs = 60000) {
  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualTimelineZero
    const snapshot = api?.read?.()
    return Boolean(
      api
      && typeof api.read === 'function'
      && typeof api.nextFrame === 'function'
      && document.querySelector('[data-testid="markstream-virtual-timeline"]')
      && snapshot?.state
      && snapshot.clientHeight > 0,
    )
  }, { timeout: timeoutMs })
}

async function waitForVirtualTimelineZeroPaintReady(page, timeoutMs = 60000) {
  await waitForVirtualTimelineZeroReady(page, timeoutMs)
  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualTimelineZero
    const snapshot = api?.read?.()
    return Boolean(snapshot && snapshot.restoring !== true)
  }, { timeout: timeoutMs })
}

async function runVirtualTimelineZeroReloadProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-timeline-zero`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  await page.evaluate((storageKey) => {
    window.sessionStorage.removeItem(storageKey)
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)
  await waitForVirtualTimelineZeroPaintReady(page)

  const beforeReload = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero
    let snapshot = api.read()

    for (let i = 0; i < 120; i++) {
      if (
        snapshot.state?.itemHeights?.['a-md-1'] > 4000
        && snapshot.state?.markdownStates?.['a-md-1']
      ) {
        break
      }

      await api.nextFrame()
      snapshot = api.read()
    }

    const markdownHeight = Number(snapshot.state?.itemHeights?.['a-md-1'] ?? 0)
    const offsetWithinItemPx = Math.min(7600, Math.max(1200, markdownHeight - 1600))
    const targetScrollTop = ['a-d-1', 'a-u-1', 'a-t-1', 'a-tool-1']
      .reduce((total, key) => total + Number(snapshot.state?.itemHeights?.[key] ?? 0), 0)
      + offsetWithinItemPx

    for (let attempt = 0; attempt < 4; attempt++) {
      snapshot = await api.scrollTo(targetScrollTop)

      for (let frame = 0; frame < 20; frame++)
        await api.nextFrame()

      snapshot = api.read()

      if (
        snapshot.state?.outerAnchor?.type !== 'bottom'
        && Math.abs(snapshot.scrollTop - targetScrollTop) <= 32
      ) {
        break
      }
    }

    const storagePayload = JSON.stringify({
      [snapshot.state.threadKey]: snapshot.state,
    })

    return {
      ...snapshot,
      storagePayload,
    }
  })

  assert(
    beforeReload.state?.outerAnchor?.type !== 'bottom',
    'virtual timeline reload probe did not reach a non-bottom anchor',
    summarizeVirtualTimelineZeroSample(beforeReload),
  )

  await page.evaluate(({ storageKey, storagePayload }) => {
    window.sessionStorage.setItem(storageKey, storagePayload)
  }, {
    storageKey: virtualTimelineZeroStorageKey,
    storagePayload: beforeReload.storagePayload,
  })

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  const samples = []
  const visibleSamples = []
  for (let i = 0; i < 300 && visibleSamples.length < 12; i++) {
    const sample = await page.evaluate(() => {
      return window.__markstreamVirtualTimelineZero.read()
    })
    samples.push(sample)
    if (!sample.restoring)
      visibleSamples.push(sample)

    await page.evaluate(() => {
      return window.__markstreamVirtualTimelineZero.nextFrame()
    })
  }

  const badSample = visibleSamples.find(sample => (
    Math.abs(sample.scrollTop - beforeReload.scrollTop) > 32
  ))

  assert(
    visibleSamples.length > 0,
    'virtual timeline reload probe did not observe a visible restored frame',
    {
      beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
      samples: samples.map(summarizeVirtualTimelineZeroSample),
    },
  )

  assert(
    !badSample,
    'virtual timeline reload restored through a visible intermediate scroll position',
    {
      beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
      samples: samples.map(summarizeVirtualTimelineZeroSample),
      badSample: summarizeVirtualTimelineZeroSample(badSample),
    },
  )

  const threadSwitch = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero

    const beforeSwitch = api.read()
    const threadB = await api.switchThread('thread-b')
    for (let i = 0; i < 12; i++)
      await api.nextFrame()

    const afterThreadBSettled = api.read()
    const threadA = await api.switchThread('thread-a')
    for (let i = 0; i < 12; i++)
      await api.nextFrame()

    return {
      beforeSwitch,
      threadB,
      afterThreadBSettled,
      threadA,
      afterThreadARestored: api.read(),
    }
  })

  assert(
    threadSwitch.afterThreadBSettled.threadId === 'thread-b'
    && threadSwitch.afterThreadARestored.threadId === 'thread-a',
    'virtual timeline thread switch probe did not settle on the expected threads',
    {
      beforeSwitch: summarizeVirtualTimelineZeroSample(threadSwitch.beforeSwitch),
      afterThreadBSettled: summarizeVirtualTimelineZeroSample(threadSwitch.afterThreadBSettled),
      afterThreadARestored: summarizeVirtualTimelineZeroSample(threadSwitch.afterThreadARestored),
    },
  )

  return {
    beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
    firstSample: summarizeVirtualTimelineZeroSample(samples[0]),
    firstVisibleSample: summarizeVirtualTimelineZeroSample(visibleSamples[0]),
    lastVisibleSample: summarizeVirtualTimelineZeroSample(visibleSamples[visibleSamples.length - 1]),
    threadSwitch: {
      afterThreadBSettled: summarizeVirtualTimelineZeroSample(threadSwitch.afterThreadBSettled),
      afterThreadARestored: summarizeVirtualTimelineZeroSample(threadSwitch.afterThreadARestored),
    },
  }
}

async function runVirtualTimelineZeroColdThreadSwitchProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-timeline-zero`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  await page.evaluate((storageKey) => {
    window.sessionStorage.removeItem(storageKey)
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  const result = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero

    const before = api.read()

    const readVisibleMermaidProbes = () => {
      const root = document.querySelector('[data-testid="markstream-virtual-timeline"]')
      if (!root)
        return []

      const rootRect = root.getBoundingClientRect()
      return Array.from(root.querySelectorAll('[data-markstream-mermaid]'))
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const visible = rect.bottom >= rootRect.top
            && rect.top <= rootRect.bottom
            && rect.width > 0
            && rect.height > 0

          return {
            visible,
            mode: element.getAttribute('data-markstream-mode') || '',
            pending: element.getAttribute('data-markstream-pending') === 'true',
            hasSvg: Boolean(element.querySelector('svg')),
            sourceText: element.querySelector('.mermaid-source-code')?.textContent?.trim() || '',
          }
        })
        .filter(probe => probe.visible)
    }

    const readSample = () => ({
      ...api.read(),
      visibleMermaidProbes: readVisibleMermaidProbes(),
    })

    const threadBButton = Array
      .from(document.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Thread B')

    if (!threadBButton)
      throw new Error('Thread B button not found')

    threadBButton.click()

    const samples = []
    for (let i = 0; i < 120; i++) {
      samples.push(readSample())
      await api.nextFrame()
    }

    const visibleSamples = samples.filter(sample => !sample.restoring)
    const firstVisible = visibleSamples[0] ?? null
    const mermaidBlankVisible = visibleSamples.some(sample =>
      sample.visibleMermaidProbes.some(probe =>
        probe.pending
        || probe.mode === 'pending'
        || (probe.mode === 'preview' && !probe.hasSvg)
        || (probe.mode === 'fallback' && !probe.sourceText),
      ),
    )
    const scrollTops = visibleSamples.map(sample => sample.scrollTop)
    const totalHeights = visibleSamples.map(sample => Number(sample.totalHeight || 0))

    return {
      before,
      firstVisible,
      visibleSampleCount: visibleSamples.length,
      restoringSampleCount: samples.filter(sample => sample.restoring).length,
      visibleMermaidProbeCount: visibleSamples.reduce(
        (total, sample) => total + sample.visibleMermaidProbes.length,
        0,
      ),
      mermaidBlankVisible,
      scrollTopRange: scrollTops.length
        ? Math.max(...scrollTops) - Math.min(...scrollTops)
        : Number.POSITIVE_INFINITY,
      totalHeightRange: totalHeights.length
        ? Math.max(...totalHeights) - Math.min(...totalHeights)
        : Number.POSITIVE_INFINITY,
      samples,
    }
  })

  assert(
    result.visibleSampleCount > 0
    && result.restoringSampleCount > 0
    && !result.mermaidBlankVisible
    && result.scrollTopRange <= 1
    && result.totalHeightRange <= 1,
    'virtual-timeline-zero cold Thread B switch exposed DOM/height change before restore readiness',
    {
      visibleSampleCount: result.visibleSampleCount,
      restoringSampleCount: result.restoringSampleCount,
      visibleMermaidProbeCount: result.visibleMermaidProbeCount,
      mermaidBlankVisible: result.mermaidBlankVisible,
      scrollTopRange: result.scrollTopRange,
      totalHeightRange: result.totalHeightRange,
      firstVisible: summarizeVirtualTimelineZeroSample(result.firstVisible),
      samples: result.samples.map(summarizeVirtualTimelineZeroSample),
    },
  )

  return {
    visibleSampleCount: result.visibleSampleCount,
    restoringSampleCount: result.restoringSampleCount,
    visibleMermaidProbeCount: result.visibleMermaidProbeCount,
    scrollTopRange: result.scrollTopRange,
    totalHeightRange: result.totalHeightRange,
  }
}

async function runVirtualScrollQuickReloadHealthProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-scroll?profile=smoke&strict=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForLabReady(page)

  for (let i = 0; i < 3; i++) {
    await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
    await waitForLabReady(page)
  }

  const result = await evaluateWithLab(page, async (api) => {
    let latest = api.read()

    for (let i = 0; i < 120; i++) {
      await api.nextFrame()
      latest = api.read()

      if (latest.labStatus === 'ok' && latest.health.layoutIntegrityOk)
        break
    }

    return latest
  })

  assert(
    result.labStatus === 'ok'
    && result.health.layoutIntegrityOk,
    'virtual-scroll quick reload left layout diagnostics in a bad state',
    result,
  )

  return {
    labStatus: result.labStatus,
    layoutIntegrityOk: result.health.layoutIntegrityOk,
  }
}

async function runVirtualScrollToolbarInteractionProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-scroll?profile=smoke&strict=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForLabReady(page)

  await page.getByRole('button', { name: 'Bottom' }).click()
  await page.getByRole('button', { name: 'Stream last huge message' }).click()

  const streamResult = await evaluateWithLab(page, async (api) => {
    let latest = api.read()
    let stableFrames = 0
    const samples = []

    for (let i = 0; i < 420; i++) {
      await api.nextFrame()
      latest = api.read()
      samples.push(latest)

      if (
        !latest.streamingActive
        && latest.labStatus === 'ok'
        && latest.health.layoutIntegrityOk
      ) {
        stableFrames += 1
      }
      else {
        stableFrames = 0
      }

      if (stableFrames >= 6)
        break
    }

    return {
      final: latest,
      badSample: samples.find(sample =>
        sample.health.maxObservedScrollJumpPx > 32
        || sample.health.maxObservedHeightDriftPx >= 24
        || String(sample.labStatus).includes('scroll jitter=')
        || String(sample.labStatus).includes('observed height drift='),
      ) ?? null,
    }
  })

  assert(
    !streamResult.badSample
    && streamResult.final.labStatus === 'ok'
    && streamResult.final.health.layoutIntegrityOk,
    'virtual-scroll toolbar streaming produced scroll jitter or persistent height drift',
    streamResult,
  )

  await page.getByRole('button', { name: 'Stress scroll' }).click()

  const stressResult = await evaluateWithLab(page, async (api) => {
    let latest = api.read()
    const samples = []

    for (let i = 0; i < 180; i++) {
      await api.nextFrame()
      latest = api.read()
      samples.push(latest)
    }

    return {
      during: latest,
      badSample: samples.find(sample =>
        sample.stats.blankProbeCount > 0
        || sample.blankFrameCount > 0
        || sample.visibleCoverageOk !== true
        || sample.health.virtualDomWithinLimit !== true
        || sample.health.hugeRendererDomWithinLimit !== true,
      ) ?? null,
    }
  })

  await page.getByRole('button', { name: 'Stop stress' }).click()

  const final = await evaluateWithLab(page, async (api) => {
    let latest = api.read()

    for (let i = 0; i < 120; i++) {
      await api.nextFrame()
      latest = api.read()

      if (latest.labStatus === 'ok' && latest.health.layoutIntegrityOk)
        break
    }

    return latest
  })

  assert(
    !stressResult.badSample
    && final.labStatus === 'ok'
    && final.health.layoutIntegrityOk,
    'virtual-scroll toolbar fast scroll produced blank frame, DOM regression, or persistent height drift',
    { stressResult, final },
  )

  return {
    streamStatus: streamResult.final.labStatus,
    stressStatus: final.labStatus,
    maxObservedScrollJumpPx: Math.max(
      streamResult.final.health.maxObservedScrollJumpPx,
      final.health.maxObservedScrollJumpPx,
    ),
    maxObservedHeightDriftPx: Math.max(
      streamResult.final.health.maxObservedHeightDriftPx,
      final.health.maxObservedHeightDriftPx,
    ),
  }
}

async function runVirtualScrollManualFastWheelProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-scroll`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForLabReady(page)

  const rootLocator = page.locator('[data-testid="virtual-scroll-root"]')
  await rootLocator.hover()

  await evaluateWithLab(page, async (api) => {
    api.clearEvents()
  })

  const duringSamples = []

  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, i % 2 === 0 ? 1400 : -900)
    await page.waitForTimeout(16)

    const sample = await page.evaluate(() => {
      return window.__markstreamVirtualScrollLab?.read?.() ?? null
    })

    if (sample)
      duringSamples.push(sample)
  }

  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 1600)
    await page.waitForTimeout(8)

    const sample = await page.evaluate(() => {
      return window.__markstreamVirtualScrollLab?.read?.() ?? null
    })

    if (sample)
      duringSamples.push(sample)
  }

  const badDuring = duringSamples.find(sample =>
    sample.stats.blankProbeCount > 0
    || sample.blankFrameCount > 0
    || sample.visibleCoverageOk !== true
    || sample.health.virtualDomWithinLimit !== true
    || sample.health.hugeRendererDomWithinLimit !== true,
  )

  const after = await evaluateWithLab(page, async (api) => {
    let latest = api.read()

    for (let i = 0; i < 120; i++) {
      await api.nextFrame()
      latest = api.read()

      if (latest.labStatus === 'ok' && latest.health.layoutIntegrityOk)
        break
    }

    return latest
  })

  assert(
    !badDuring
    && after.labStatus === 'ok'
    && after.health.layoutIntegrityOk,
    'manual fast wheel scroll produced blank frame, DOM regression, or persistent height drift',
    {
      badDuring,
      after,
      duringSamples: duringSamples.map(sample => ({
        labStatus: sample.labStatus,
        scrollTop: sample.scrollTop,
        maxObservedScrollJumpPx: sample.health.maxObservedScrollJumpPx,
        maxObservedHeightDriftPx: sample.health.maxObservedHeightDriftPx,
        blankProbeCount: sample.stats.blankProbeCount,
        visibleCoverageOk: sample.visibleCoverageOk,
      })),
    },
  )

  return {
    afterStatus: after.labStatus,
    maxObservedScrollJumpPx: after.health.maxObservedScrollJumpPx,
    maxObservedHeightDriftPx: after.health.maxObservedHeightDriftPx,
  }
}

async function runVirtualScrollerMarkstreamReloadProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-scroller-markstream`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)

  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualScrollerMarkstream
    return Boolean(api && typeof api.read === 'function' && typeof api.nextFrame === 'function')
  }, { timeout: 60000 })

  await page.evaluate(async () => {
    const api = window.__markstreamVirtualScrollerMarkstream

    let snapshot = api.read()
    for (let i = 0; i < 120; i++) {
      await api.nextFrame()
      snapshot = api.read()

      if (!snapshot.restoring && snapshot.totalHeight > 100000)
        break
    }

    await api.scrollTo(58772)

    for (let i = 0; i < 180; i++)
      await api.nextFrame()
  })

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)

  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualScrollerMarkstream
    return Boolean(api && typeof api.read === 'function' && typeof api.nextFrame === 'function')
  }, { timeout: 60000 })

  await page.evaluate(async () => {
    const api = window.__markstreamVirtualScrollerMarkstream
    for (let i = 0; i < 30; i++)
      await api.nextFrame()
  })

  const beforeReload = await page.evaluate(async () => {
    const api = window.__markstreamVirtualScrollerMarkstream
    for (let i = 0; i < 180; i++)
      await api.nextFrame()

    const snapshot = api.read()
    return {
      scrollTop: snapshot.scrollTop,
      totalHeight: snapshot.totalHeight,
      visibleRange: snapshot.visibleRange,
      viewportText: snapshot.viewportText.slice(0, 240),
    }
  })

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)

  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualScrollerMarkstream
    return Boolean(api && typeof api.read === 'function' && typeof api.nextFrame === 'function')
  }, { timeout: 60000 })

  await page.evaluate(async () => {
    const api = window.__markstreamVirtualScrollerMarkstream
    for (let i = 0; i < 30; i++)
      await api.nextFrame()
  })

  const result = await page.evaluate(async (before) => {
    const api = window.__markstreamVirtualScrollerMarkstream
    const samples = []
    const visibleSamples = []

    for (let i = 0; i < 180; i++) {
      await api.nextFrame()
      const sample = api.read()
      samples.push(sample)

      if (!sample.restoring)
        visibleSamples.push(sample)
    }

    const firstVisible = visibleSamples[0] ?? null
    const lastVisible = visibleSamples[visibleSamples.length - 1] ?? null
    const scrollTops = visibleSamples.map(sample => sample.scrollTop)
    const totalHeights = visibleSamples.map(sample => sample.totalHeight)

    return {
      before,
      visibleSampleCount: visibleSamples.length,
      firstVisible,
      lastVisible,
      scrollTopRange: scrollTops.length ? Math.max(...scrollTops) - Math.min(...scrollTops) : Number.POSITIVE_INFINITY,
      totalHeightRange: totalHeights.length ? Math.max(...totalHeights) - Math.min(...totalHeights) : Number.POSITIVE_INFINITY,
      firstViewportText: firstVisible?.viewportText?.slice?.(0, 240) ?? '',
      lastViewportText: lastVisible?.viewportText?.slice?.(0, 240) ?? '',
      samples: samples.map(sample => ({
        scrollTop: sample.scrollTop,
        totalHeight: sample.totalHeight,
        visibleRange: sample.visibleRange,
        restoring: sample.restoring,
        viewportText: String(sample.viewportText || '').slice(0, 180),
      })),
    }
  }, beforeReload)

  assert(
    result.visibleSampleCount > 0
    && result.scrollTopRange <= 1
    && result.totalHeightRange <= 1
    && result.firstViewportText === result.before.viewportText
    && result.firstViewportText === result.lastViewportText,
    'virtual-scroller-markstream reload exposed visible row height / viewport text jitter',
    result,
  )

  return {
    beforeReload,
    visibleSampleCount: result.visibleSampleCount,
    scrollTopRange: result.scrollTopRange,
    totalHeightRange: result.totalHeightRange,
    firstViewportText: result.firstViewportText,
  }
}

async function runVirtualTimelineZeroCodeBlockJitterProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-timeline-zero`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  await page.evaluate((storageKey) => {
    window.sessionStorage.removeItem(storageKey)
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  const beforeReload = await page.evaluate(async (storageKey) => {
    const api = window.__markstreamVirtualTimelineZero

    let snapshot = api.read()
    for (let i = 0; i < 160; i++) {
      await api.nextFrame()
      snapshot = api.read()

      if (
        snapshot.state?.itemHeights?.['a-md-1'] > 4000
        && snapshot.state?.markdownStates?.['a-md-1']
      ) {
        break
      }
    }

    let found = null
    let finalReadySnapshot = null
    let stableReadyKey = ''
    let stableReadyFrames = 0
    const total = Math.max(1, snapshot.totalHeight || snapshot.scrollHeight || 1)
    const readMarkdownPersistenceReadiness = (sample) => {
      const markdownMetrics = sample.state?.markdownStates?.['a-md-1']?.metrics
      const itemHeight = Number(sample.state?.itemHeights?.['a-md-1'] ?? 0)
      const metricsHeight = Number(markdownMetrics?.totalHeight ?? 0)
      const estimatedCount = Number(markdownMetrics?.estimatedCount ?? 0)
      const measuredCount = Number(markdownMetrics?.measuredCount ?? 0)
      const nodeCount = Number(markdownMetrics?.nodeCount ?? 1)
      const liveStart = Math.max(0, Number(markdownMetrics?.liveRange?.start ?? 0))
      const liveEnd = Math.min(nodeCount, Math.max(liveStart, Number(markdownMetrics?.liveRange?.end ?? 0)))
      const liveRangeCount = Math.max(0, liveEnd - liveStart)
      const heightDelta = Math.abs(itemHeight - metricsHeight)
      const heightDeltaTolerance = Math.min(
        1600,
        Math.max(320, Math.ceil(metricsHeight * 0.02) + measuredCount * 16),
      )
      const confidence = markdownMetrics?.confidence
      const hasMeasuredOrFinalConfidence = confidence === 'measured'
        || confidence === 'final'

      const hasCompleteMeasuredMetrics = hasMeasuredOrFinalConfidence
        && measuredCount >= nodeCount
        && estimatedCount === 0

      const hasStableMixedVirtualMetrics = confidence === 'mixed'
        && markdownMetrics?.stable === true
        && measuredCount > 0
        && measuredCount < nodeCount
        && (liveRangeCount <= 0 || measuredCount >= liveRangeCount)

      return {
        key: [
          itemHeight,
          metricsHeight,
          heightDelta,
          confidence ?? 'none',
          Boolean(markdownMetrics?.stable),
          estimatedCount,
          measuredCount,
          liveStart,
          liveEnd,
          nodeCount,
        ].join(':'),
        ready: Boolean(
          markdownMetrics?.final === true
          && (hasCompleteMeasuredMetrics || hasStableMixedVirtualMetrics)
          && itemHeight > 0
          && metricsHeight > 0
          && heightDelta <= heightDeltaTolerance,
        ),
        itemHeight,
        metrics: markdownMetrics,
        metricsHeight,
        heightDelta,
      }
    }

    // Locate the region around "PR analysis section 13", which is below the
    // section-6 area and keeps normal ts CodeBlockNode instances above it.
    // Keep scanning until the markdown metrics are final enough for persistence;
    // otherwise the reload probe stores a transient partial height cache and the
    // e2e assertion reports expected measurement settlement as visible jitter.
    for (let pass = 0; pass < 3 && !finalReadySnapshot; pass++) {
      for (let offset = 0; offset < total; offset += 420) {
        snapshot = await api.scrollTo(offset)

        for (let frame = 0; frame < 8; frame++)
          await api.nextFrame()

        snapshot = api.read()

        const viewportText = String(snapshot.viewportText || snapshot.visibleText || '')
        if (
          viewportText.includes('PR analysis section 13')
          || viewportText.includes('section13')
        ) {
          found = snapshot
        }

        const readiness = readMarkdownPersistenceReadiness(snapshot)
        const markdownReady = found && readiness.ready

        if (markdownReady) {
          if (readiness.key === stableReadyKey) {
            stableReadyFrames += 1
          }
          else {
            stableReadyKey = readiness.key
            stableReadyFrames = 1
          }

          if (stableReadyFrames >= 3) {
            finalReadySnapshot = found
            break
          }
        }
        else {
          stableReadyKey = ''
          stableReadyFrames = 0
        }
      }
    }

    if (!found)
      throw new Error(`Could not locate PR analysis section 13. Last visible text: ${snapshot.visibleText.slice(0, 400)}`)

    if (!finalReadySnapshot) {
      throw new Error([
        'Could not observe final stable markdown metrics before storing virtual-timeline-zero reload state.',
        `Last itemHeight=${snapshot.state?.itemHeights?.['a-md-1'] ?? 'n/a'}`,
        `Last metrics=${JSON.stringify(snapshot.state?.markdownStates?.['a-md-1']?.metrics ?? null)}`,
      ].join('\n'))
    }

    const persistedHeightDelta = Math.abs(
      Number(finalReadySnapshot.state?.itemHeights?.['a-md-1'] ?? 0)
      - Number(finalReadySnapshot.state?.markdownStates?.['a-md-1']?.metrics?.totalHeight ?? 0),
    )

    if (persistedHeightDelta > 1600) {
      throw new Error(`virtual-timeline-zero stored a reload state before markdown item height was close to final metrics: ${JSON.stringify({
        persistedHeightDelta,
        itemHeight: finalReadySnapshot.state?.itemHeights?.['a-md-1'],
        metrics: finalReadySnapshot.state?.markdownStates?.['a-md-1']?.metrics,
      })}`)
    }

    const anchorSnapshot = finalReadySnapshot

    // Put the anchor just below the sensitive region.
    snapshot = await api.scrollTo(Math.max(0, anchorSnapshot.scrollTop + 120))

    for (let frame = 0; frame < 30; frame++)
      await api.nextFrame()

    snapshot = api.read()
    const finalReadiness = readMarkdownPersistenceReadiness(snapshot)

    if (!finalReadiness.ready) {
      throw new Error(`virtual-timeline-zero stored snapshot was not final-stable enough after anchor adjustment: ${JSON.stringify({
        itemHeight: finalReadiness.itemHeight,
        metricsHeight: finalReadiness.metricsHeight,
        heightDelta: finalReadiness.heightDelta,
        metrics: finalReadiness.metrics,
      })}`)
    }

    const storagePayload = JSON.stringify({
      [snapshot.state.threadKey]: snapshot.state,
    })
    window.sessionStorage.setItem(storageKey, storagePayload)

    return {
      ...snapshot,
      storagePayload,
    }
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)
  await waitForVirtualTimelineZeroPaintReady(page)

  const probe = await page.evaluate(async (beforeReloadItemHeight) => {
    const api = window.__markstreamVirtualTimelineZero
    const samples = []
    const visibleSamples = []

    for (let i = 0; i < 120; i++) {
      const sample = api.read()
      samples.push(sample)

      if (!sample.restoring)
        visibleSamples.push(sample)

      await api.nextFrame()
    }

    const stableWindow = visibleSamples.slice(3)
    const scrollTops = stableWindow.map(sample => Number(sample.scrollTop || 0))
    const visibleItemHeights = stableWindow.map(sample => Number(sample.state?.itemHeights?.['a-md-1'] || 0))
    const baselineItemHeight = Number(beforeReloadItemHeight || 0)

    const scrollTopMin = Math.min(...scrollTops)
    const scrollTopMax = Math.max(...scrollTops)

    const itemHeightDeltaPx = Math.max(
      0,
      ...visibleItemHeights.map(height => Math.abs(height - baselineItemHeight)),
    )
    const itemHeightRangePx = Math.max(...visibleItemHeights) - Math.min(...visibleItemHeights)

    return {
      visibleSamples,
      firstVisible: visibleSamples[0] ?? null,
      lastVisible: visibleSamples[visibleSamples.length - 1] ?? null,
      scrollTopRangePx: scrollTopMax - scrollTopMin,
      itemHeightDeltaPx,
      itemHeightRangePx,
      samples: samples.map(sample => ({
        scrollTop: sample.scrollTop,
        totalHeight: sample.totalHeight,
        restoring: sample.restoring,
        codeBlockProbe: sample.codeBlockProbe,
        itemHeight: sample.state?.itemHeights?.['a-md-1'],
        visibleText: String(sample.visibleText || '').slice(0, 240),
        viewportText: String(sample.viewportText || '').slice(0, 240),
      })),
    }
  }, Number(beforeReload.state?.itemHeights?.['a-md-1'] || 0))

  assert(
    probe.visibleSamples.length > 0,
    'code block jitter probe did not observe visible restored frames',
    {
      beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
      probe,
    },
  )

  assert(
    probe.scrollTopRangePx <= 0.5
    && probe.itemHeightRangePx <= 0.5
    && probe.itemHeightDeltaPx <= 2,
    'CodeBlockNode caused visible reload jitter around PR analysis section 6/13',
    {
      beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
      scrollTopRangePx: probe.scrollTopRangePx,
      itemHeightRangePx: probe.itemHeightRangePx,
      itemHeightDeltaPx: probe.itemHeightDeltaPx,
      firstVisible: summarizeVirtualTimelineZeroSample(probe.firstVisible),
      lastVisible: summarizeVirtualTimelineZeroSample(probe.lastVisible),
      samples: probe.samples,
    },
  )

  return {
    beforeReload: summarizeVirtualTimelineZeroSample(beforeReload),
    firstVisible: summarizeVirtualTimelineZeroSample(probe.firstVisible),
    lastVisible: summarizeVirtualTimelineZeroSample(probe.lastVisible),
    scrollTopRangePx: probe.scrollTopRangePx,
    itemHeightRangePx: probe.itemHeightRangePx,
    itemHeightDeltaPx: probe.itemHeightDeltaPx,
  }
}

async function runVirtualTimelineZeroStreamingProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-timeline-zero`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)

  await page.evaluate((storageKey) => {
    window.sessionStorage.removeItem(storageKey)
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)
  await waitForVirtualTimelineZeroPaintReady(page)

  const bottom = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero

    if (!api || typeof api.monitorBottomStreaming !== 'function')
      throw new Error('virtual-timeline-zero bottom streaming monitor API is missing')

    return api.monitorBottomStreaming()
  })

  await page.evaluate((storageKey) => {
    window.sessionStorage.removeItem(storageKey)
  }, virtualTimelineZeroStorageKey)

  await reloadWithServer(page, { waitUntil: 'domcontentloaded', timeout: 60000 }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)
  await waitForVirtualTimelineZeroPaintReady(page)

  const nonBottom = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero

    if (!api || typeof api.monitorNonBottomStreaming !== 'function')
      throw new Error('virtual-timeline-zero non-bottom streaming monitor API is missing')

    return api.monitorNonBottomStreaming()
  })

  const result = { bottom, nonBottom }
  const exactBottomTolerancePx = 2
  const maxTransientBottomDriftPx = 192
  const maxAllowedConsecutiveBottomDriftFrames = 2
  const bottomSamples = result.bottom.visibleSamples
  const bottomDistances = bottomSamples.map((sample) => {
    return Math.max(0, sample.scrollHeight - sample.scrollTop - sample.clientHeight)
  })
  const finalBottomSample = bottomSamples.at(-1) ?? null
  const finalDistanceFromBottom = bottomDistances.at(-1) ?? null
  const peakDistanceFromBottom = bottomDistances.length
    ? Math.max(...bottomDistances)
    : null
  const sortedBottomDistances = [...bottomDistances].sort((a, b) => a - b)
  const p90DistanceFromBottom = sortedBottomDistances.length
    ? sortedBottomDistances[Math.ceil(sortedBottomDistances.length * 0.9) - 1]
    : null
  const bottomDriftFrameCount = bottomDistances.filter(
    distance => distance > exactBottomTolerancePx,
  ).length
  let consecutiveBottomDriftFrames = 0
  let maxConsecutiveBottomDriftFrames = 0

  for (const distance of bottomDistances) {
    if (distance > exactBottomTolerancePx) {
      consecutiveBottomDriftFrames += 1
      maxConsecutiveBottomDriftFrames = Math.max(
        maxConsecutiveBottomDriftFrames,
        consecutiveBottomDriftFrames,
      )
    }
    else {
      consecutiveBottomDriftFrames = 0
    }
  }

  const finalBottomAnchor = finalBottomSample?.state?.outerAnchor ?? null

  assert(
    result.bottom.visibleSampleCount > 0
    && result.bottom.blankFrames === 0
    && finalDistanceFromBottom != null
    && finalDistanceFromBottom <= exactBottomTolerancePx
    && finalBottomAnchor?.type === 'bottom'
    && peakDistanceFromBottom != null
    && peakDistanceFromBottom <= maxTransientBottomDriftPx
    && maxConsecutiveBottomDriftFrames <= maxAllowedConsecutiveBottomDriftFrames,
    'virtual-timeline-zero bottom-pinned streaming exceeded the bounded catch-up budget',
    {
      visibleSampleCount: result.bottom.visibleSampleCount,
      blankFrames: result.bottom.blankFrames,
      finalDistanceFromBottom,
      finalBottomAnchor,
      peakDistanceFromBottom,
      p90DistanceFromBottom,
      bottomDriftFrameCount,
      maxConsecutiveBottomDriftFrames,
      limits: {
        exactBottomTolerancePx,
        maxTransientBottomDriftPx,
        maxAllowedConsecutiveBottomDriftFrames,
      },
      before: summarizeVirtualTimelineZeroSample(result.bottom.before),
      lastSample: summarizeVirtualTimelineZeroSample(finalBottomSample),
    },
  )

  assert(
    result.nonBottom.visibleSampleCount > 0
    && result.nonBottom.scrollTopRange <= 1
    && result.nonBottom.firstVisibleTextStable === true,
    'virtual-timeline-zero non-bottom streaming changed the visible viewport or never produced visible samples',
    {
      visibleSampleCount: result.nonBottom.visibleSampleCount,
      scrollTopRange: result.nonBottom.scrollTopRange,
      firstVisibleTextStable: result.nonBottom.firstVisibleTextStable,
      before: summarizeVirtualTimelineZeroSample(result.nonBottom.before),
      lastSample: summarizeVirtualTimelineZeroSample(result.nonBottom.samples?.at?.(-1)),
    },
  )

  const bottomRestoringFrames = result.bottom.samples
    .filter(sample => sample.restoring)
    .length

  const nonBottomRestoringFrames = result.nonBottom.samples
    .filter(sample => sample.restoring)
    .length

  assert(
    bottomRestoringFrames === 0 && nonBottomRestoringFrames === 0,
    'virtual-timeline-zero streaming unexpectedly entered thread restore state',
    {
      bottomRestoringFrames,
      nonBottomRestoringFrames,
    },
  )

  return {
    bottom: {
      visibleSampleCount: result.bottom.visibleSampleCount,
      maxDistanceFromBottom: peakDistanceFromBottom,
      finalDistanceFromBottom,
      p90DistanceFromBottom,
      bottomDriftFrameCount,
      maxConsecutiveBottomDriftFrames,
      blankFrames: result.bottom.blankFrames,
    },
    nonBottom: {
      visibleSampleCount: result.nonBottom.visibleSampleCount,
      scrollTopRange: result.nonBottom.scrollTopRange,
      firstVisibleTextStable: result.nonBottom.firstVisibleTextStable,
    },
  }
}

async function runVirtualTimelineZeroDiffCodeBlockStateProbe(page, port, ensureServerRunning) {
  await gotoWithServer(page, `http://${host}:${port}/virtual-timeline-zero`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }, ensureServerRunning)
  await waitForVirtualTimelineZeroReady(page)
  await waitForVirtualTimelineZeroPaintReady(page)

  const result = await page.evaluate(async () => {
    const api = window.__markstreamVirtualTimelineZero
    const samples = []
    const total = Math.max(api.read().totalHeight, 1)

    for (let offset = 0; offset < total; offset += 360) {
      await api.scrollTo(offset)
      for (let i = 0; i < 8; i++)
        await api.nextFrame()

      for (let i = 0; i < 8; i++) {
        const sample = api.read()
        samples.push({
          scrollTop: sample.scrollTop,
          probes: sample.diffCodeBlockProbe ?? [],
          visibleText: String(sample.visibleText || '').slice(0, 240),
        })
        await api.nextFrame()
      }
    }

    const observedProbeCount = samples.reduce(
      (total, sample) => total + sample.probes.length,
      0,
    )

    const bad = samples.find(sample =>
      sample.probes.some(probe =>
        // Forbidden third state: fallback gone, stream-diffs not visible, and not enhanced.
        // A hidden editor host alone is still a blank visible shell.
        !probe.enhanced && !probe.fallbackVisible && !probe.diffSurfaceVisible,
      ),
    )

    const doubleHeightSample = samples.find(sample =>
      sample.probes.some(probe =>
        probe.fallbackVisible
        && probe.hiddenEditor
        && probe.editorHostHeight > 0
        && probe.editorLayerHeight > probe.fallbackHeight + probe.editorHostHeight - 2,
      ),
    )

    return { bad, doubleHeightSample, observedProbeCount, sampleCount: samples.length }
  })

  assert(
    result.observedProbeCount > 0,
    'diff CodeBlockNode probe did not observe any diff code block',
    result,
  )

  assert(
    !result.bad,
    'diff CodeBlockNode exposed an intermediate blank state between pre fallback and stream-diffs',
    result,
  )

  assert(
    !result.doubleHeightSample,
    'CodeBlock hidden editor participated in layout while fallback was visible',
    result.doubleHeightSample,
  )

  return {
    sampleCount: result.sampleCount,
    observedProbeCount: result.observedProbeCount,
  }
}

async function run() {
  const port = await findFreePort()
  const useDevServer = process.env.MARKSTREAM_E2E_VIRTUAL_SCROLL_DEV === '1'
  const profile = stressMode ? 'stress' : 'smoke'

  if (!useDevServer)
    await buildPlaygroundForE2E()

  let server = useDevServer
    ? startDevServer(port)
    : startPreviewServer(port)

  let browser
  let page
  const pageErrors = []
  const consoleMessages = []
  const requestFailures = []

  try {
    await waitForPort(port)
    await waitForHttpReady(port, `/virtual-scroll?profile=${profile}&strict=1`)

    const ensureServerRunning = async () => {
      if (!await isPortOpen(port)) {
        killProcessTree(server.child)
        server = useDevServer
          ? startDevServer(port)
          : startPreviewServer(port)
        await waitForPort(port)
      }

      await waitForHttpReady(port, `/virtual-scroll?profile=${profile}&strict=1`)
    }

    try {
      browser = await chromium.launch(resolveChromeLaunchOptions())
    }
    catch (error) {
      throw new Error(
        [
          'Unable to launch Chromium for virtual-scroll e2e.',
          'Install Chrome/Chromium in CI or set PLAYWRIGHT_CHROME_PATH / PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.',
          `Original error: ${error?.message || String(error)}`,
        ].join('\n'),
      )
    }
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })

    page.on('console', (msg) => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location?.(),
      }
      consoleMessages.push(entry)

      if (msg.type() === 'error')
        process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`)
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.stack || error.message || String(error))
      process.stderr.write(`[browser:pageerror] ${error.stack || error.message}\n`)
    })

    page.on('requestfailed', (request) => {
      requestFailures.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText ?? '',
      })
    })

    function assertNoPageErrors(label) {
      assert(
        pageErrors.length === 0,
        `${label} produced browser page errors`,
        { pageErrors },
      )
    }

    function assertNoRestoreViewportWarnings(label) {
      const warnings = consoleMessages.filter(entry =>
        String(entry.text || '').includes('MarkstreamVirtualTimeline restore viewport did not become ready'),
      )

      assert(
        warnings.length === 0,
        `${label} produced restore viewport readiness warnings`,
        { warnings },
      )
    }

    await gotoWithServer(page, `http://${host}:${port}/virtual-scroll?profile=${profile}&strict=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }, ensureServerRunning)

    await waitForLabReady(page)

    const rootLocator = page.locator('[data-testid="virtual-scroll-root"]')
    await rootLocator.hover()

    const wheelSamples = []

    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(16)

      const sample = await page.evaluate(() => {
        const api = window.__markstreamVirtualScrollLab
        return api?.read?.() ?? null
      })

      if (sample)
        wheelSamples.push(sample)
    }

    const wheelProbe = await evaluateWithLab(page, async (api) => {
      for (let i = 0; i < 20; i++)
        await api.nextFrame()
      return api.read()
    })

    const badWheelSample = wheelSamples.find((sample) => {
      return sample.stats.blankProbeCount > 0
        || sample.blankFrameCount > 0
        || sample.visibleCoverageOk !== true
        || sample.health.strictClippingOk !== true
        || sample.health.virtualDomWithinLimit !== true
        || sample.health.hugeRendererDomWithinLimit !== true
    })

    assert(
      !badWheelSample,
      'blank frame, coverage, clipping, or DOM budget regression observed during wheel scrolling',
      {
        badWheelSample,
        sampleCount: wheelSamples.length,
      },
    )

    assert(
      wheelProbe.stats.blankProbeCount === 0
      && wheelProbe.blankFrameCount === 0
      && wheelProbe.visibleCoverageOk === true
      && wheelProbe.health.strictClippingOk === true
      && wheelProbe.health.virtualDomWithinLimit === true
      && wheelProbe.health.hugeRendererDomWithinLimit === true,
      'blank frame, coverage, or DOM budget regression observed after real wheel scrolling',
      wheelProbe,
    )

    if (!stressMode) {
      const directJumpProbe = await evaluateWithLab(page, async (api) => {
        api.clearEvents()

        const ratios = [0.03, 0.96, 0.18, 0.74, 0.42, 1, 0]
        const samples = []

        for (const ratio of ratios) {
          await api.scrollToRatio(ratio)

          for (let i = 0; i < 8; i++)
            await api.nextFrame()

          samples.push(api.read())
        }

        return {
          final: api.read(),
          badSample: samples.find(sample => (
            sample.stats.blankProbeCount > 0
            || sample.blankFrameCount > 0
            || sample.visibleCoverageOk !== true
            || sample.health.strictClippingOk !== true
            || sample.health.virtualDomWithinLimit !== true
            || sample.health.hugeRendererDomWithinLimit !== true
            || sample.health.maxObservedCoverageGapPx > 24
          )) ?? null,
          samples,
        }
      })

      assert(
        !directJumpProbe.badSample,
        'direct scrollTop jumps caused blank frame, coverage gap, clipping, or DOM budget regression',
        directJumpProbe,
      )

      assert(
        directJumpProbe.final.maxHugeMessageSlotCount <= directJumpProbe.final.hugeRendererSlotBudget
        && directJumpProbe.final.domNodeCount <= directJumpProbe.final.expectedDomNodeCeiling
        && directJumpProbe.final.markdownSlotCount <= directJumpProbe.final.expectedMarkdownSlotCeiling,
        'virtual-scroll DOM-size budget was exceeded after direct jumps',
        directJumpProbe.final,
      )

      const smoke = await evaluateWithLab(page, async (api) => {
        const waitHealthy = async (frames = 90) => {
          let latest = api.read()
          for (let i = 0; i < frames; i++) {
            await api.nextFrame()
            latest = api.read()

            if (
              latest.stats.blankProbeCount === 0
              && latest.stats.placeholderProbeCount === 0
              && latest.stats.emptyCardProbeCount === 0
              && latest.blankFrameCount === 0
              && latest.visibleCoverageOk
              && latest.health.virtualDomWithinLimit
              && latest.health.hugeRendererDomWithinLimit
              && latest.health.threadRestoreOk
              && latest.health.strictClippingOk
              && latest.maxItemHeightDriftPx < 24
            ) {
              api.clearEvents()
              await api.nextFrame()
              latest = api.read()
              return latest
            }
          }

          return latest
        }

        await api.clearEvents()
        await api.scrollToRatio(0.82)
        const before = await waitHealthy()

        await api.switchThread('thread-b')
        await waitHealthy()

        await api.switchThread(before.threadId)
        const restored = await waitHealthy()

        await api.settleVisibleRenderers()
        const final = await waitHealthy()

        api.clearEvents()
        await api.toggleReverseFlexMode()
        await api.nextFrame()
        await api.scrollToRatio(0.62)

        const reverseBefore = api.read()
        const reverseOtherThread = reverseBefore.threadId === 'thread-a' ? 'thread-b' : 'thread-a'

        await api.switchThread(reverseOtherThread)
        await api.scrollToRatio(0.28)
        await api.switchThread(reverseBefore.threadId)

        for (let i = 0; i < 60; i++)
          await api.nextFrame()
        api.clearEvents()
        await api.nextFrame()

        const reverseAfter = api.read()

        if (!reverseAfter.health.threadRestoreOk) {
          throw new Error(
            `reverse-flex thread restore failed: delta=${reverseAfter.lastThreadRestoreDeltaPx}, anchorDelta=${reverseAfter.lastThreadRestoreAnchorDeltaPx}`,
          )
        }

        if (!reverseAfter.health.layoutIntegrityOk)
          throw new Error(`reverse-flex layout integrity failed: ${reverseAfter.labStatus}`)

        if (Math.abs(reverseAfter.scrollTop - reverseBefore.scrollTop) > 48 && !reverseAfter.health.threadRestoreOk) {
          throw new Error(
            `reverse-flex scrollTop drift too large: before=${reverseBefore.scrollTop}, after=${reverseAfter.scrollTop}`,
          )
        }

        await api.toggleReverseFlexMode()
        await waitHealthy()

        api.clearEvents()
        await api.scrollToRatio(0.82)
        for (let i = 0; i < 20; i++)
          await api.nextFrame()

        const unmountBefore = api.read()

        api.clearEvents()
        await api.forceUnmountVisibleHugeMessage()

        for (let i = 0; i < 60; i++)
          await api.nextFrame()

        const unmountAfter = api.read()

        api.clearEvents()
        await api.scrollToRatio(0.72)
        for (let i = 0; i < 20; i++)
          await api.nextFrame()

        api.clearEvents()
        await api.nextFrame()
        const sameShapeBefore = api.read()

        if (typeof api.replaceVisibleHugeMessageSameShape !== 'function')
          throw new Error('replaceVisibleHugeMessageSameShape lab action is missing')

        await api.replaceVisibleHugeMessageSameShape()

        for (let i = 0; i < 90; i++)
          await api.nextFrame()

        const sameShapeAfter = api.read()

        // Settling can change the total height more than once. Finish positioning
        // at the measured bottom before recording streaming scroll diagnostics.
        for (let attempt = 0; attempt < 4; attempt++) {
          await api.scrollToRatio(1)
          await api.settleVisibleRenderers()
          for (let i = 0; i < 20; i++)
            await api.nextFrame()

          if (api.read().distanceFromBottomPx <= 32)
            break
        }

        api.clearEvents()
        await api.nextFrame()

        const streamingBefore = api.read()
        if (streamingBefore.distanceFromBottomPx > 32) {
          throw new Error(`Could not reach the bottom before the streaming probe: ${JSON.stringify({
            scrollTop: streamingBefore.scrollTop,
            totalHeight: streamingBefore.totalHeight,
            viewportHeight: streamingBefore.viewportHeight,
            distanceFromBottomPx: streamingBefore.distanceFromBottomPx,
          })}`)
        }

        await api.startStreamingLastMessage({
          blocks: 520,
          initialChars: 1200,
          chunkSize: 3000,
          intervalMs: 16,
        })

        let streamingAfter = api.read()
        for (let i = 0; i < 240; i++) {
          await api.nextFrame()
          streamingAfter = api.read()
          if (!streamingAfter.streamingActive && streamingAfter.settledEvents > 0)
            break
        }

        await api.settleVisibleRenderers()
        for (let i = 0; i < 60; i++)
          await api.nextFrame()

        const streamingFinal = api.read()

        api.clearEvents()
        await api.rapidSwitchThreads(['thread-a', 'thread-b'], 8)
        for (let i = 0; i < 80; i++)
          await api.nextFrame()

        const rapidSwitchAfter = api.read()

        return {
          before,
          restored,
          final,
          reverseFlexProbe: {
            before: reverseBefore,
            after: reverseAfter,
          },
          unmountProbe: {
            before: unmountBefore,
            after: unmountAfter,
          },
          sameShapeProbe: {
            before: sameShapeBefore,
            after: sameShapeAfter,
          },
          streamingProbe: {
            before: streamingBefore,
            after: streamingAfter,
            final: streamingFinal,
          },
          rapidSwitchProbe: rapidSwitchAfter,
        }
      })

      assertThreadRestore('smoke thread restore', smoke.before, smoke.restored)
      assertThreadRestore(
        'reverse flex thread restore',
        smoke.reverseFlexProbe.before,
        smoke.reverseFlexProbe.after,
      )

      assert(
        smoke.final.health.layoutIntegrityOk
        && smoke.final.health.virtualDomWithinLimit
        && smoke.final.health.hugeRendererDomWithinLimit
        && smoke.final.health.maxObservedBlankProbes === 0,
        'virtual-scroll smoke health check failed',
        smoke.final,
      )

      assert(
        smoke.final.heightCacheStateCount > 0
        && (!smoke.final.streamingActive || smoke.final.settledEvents > 0),
        'settled virtual-scroll renderers did not persist heightCache state',
        smoke.final,
      )

      assert(
        smoke.unmountProbe.after.health.threadRestoreOk
        && smoke.unmountProbe.after.health.maxObservedBlankProbes === 0
        && smoke.unmountProbe.after.blankFrameCount === 0
        && smoke.unmountProbe.after.health.maxObservedScrollJumpPx <= 32
        && smoke.unmountProbe.after.health.hugeRendererDomWithinLimit,
        'forced renderer unmount caused lost virtual state, blank frame, or scroll jump',
        smoke.unmountProbe,
      )

      assert(
        smoke.sameShapeProbe.after.stats.blankProbeCount === 0
        && smoke.sameShapeProbe.after.blankFrameCount === 0
        && smoke.sameShapeProbe.after.visibleCoverageOk
        && smoke.sameShapeProbe.after.health.virtualDomWithinLimit
        && smoke.sameShapeProbe.after.health.hugeRendererDomWithinLimit
        && smoke.sameShapeProbe.after.health.maxObservedScrollJumpPx <= 32,
        'same-shape virtual session replacement caused blank frame, DOM budget regression, or scroll jump',
        smoke.sameShapeProbe,
      )

      assert(
        smoke.streamingProbe.final.distanceFromBottomPx < 48
        && smoke.streamingProbe.final.stats.blankProbeCount === 0
        && smoke.streamingProbe.final.blankFrameCount === 0
        && smoke.streamingProbe.final.visibleCoverageOk
        && smoke.streamingProbe.final.health.virtualDomWithinLimit
        && smoke.streamingProbe.final.health.hugeRendererDomWithinLimit
        && smoke.streamingProbe.final.health.maxObservedScrollJumpPx <= 32,
        'streaming bottom-pinned render caused scroll drift, blank frame, or DOM budget regression',
        smoke.streamingProbe,
      )

      assert(
        smoke.rapidSwitchProbe.health.threadRestoreOk
        && smoke.rapidSwitchProbe.stats.blankProbeCount === 0
        && smoke.rapidSwitchProbe.blankFrameCount === 0
        && smoke.rapidSwitchProbe.health.virtualDomWithinLimit
        && smoke.rapidSwitchProbe.health.hugeRendererDomWithinLimit,
        'rapid thread switching lost scroll state or created blank/DOM regression',
        smoke.rapidSwitchProbe,
      )

      assertNoPageErrors('virtual-scroll smoke e2e')

      await ensureServerRunning()
      const virtualTimelineReload = await runVirtualTimelineZeroReloadProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualTimelineColdThreadSwitch = await runVirtualTimelineZeroColdThreadSwitchProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualTimelineDiffCodeBlockState = await runVirtualTimelineZeroDiffCodeBlockStateProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualTimelineCodeBlockJitter = await runVirtualTimelineZeroCodeBlockJitterProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualTimelineStreaming = await runVirtualTimelineZeroStreamingProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualScrollerMarkstreamReload = await runVirtualScrollerMarkstreamReloadProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const quickReloadHealth = await runVirtualScrollQuickReloadHealthProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const toolbarInteraction = await runVirtualScrollToolbarInteractionProbe(page, port, ensureServerRunning)
      await ensureServerRunning()
      const virtualScrollManualFastWheel = await runVirtualScrollManualFastWheelProbe(page, port, ensureServerRunning)

      assertNoPageErrors('virtual-timeline-zero reload e2e')
      assertNoRestoreViewportWarnings('virtual-timeline-zero e2e')

      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode,
        health: smoke.final.health,
        quickReloadHealth,
        virtualTimelineReload,
        virtualTimelineColdThreadSwitch,
        virtualTimelineCodeBlockJitter,
        virtualTimelineDiffCodeBlockState,
        virtualTimelineStreaming,
        virtualScrollerMarkstreamReload,
        toolbarInteraction,
        virtualScrollManualFastWheel,
      }, null, 2)}\n`)

      return
    }

    await evaluateWithLab(page, async (api) => {
      api.clearEvents()
    })

    await evaluateWithLab(page, async (api) => {
      for (let i = 0; i < 8; i++)
        await api.nextFrame()
      await api.scrollToRatio(0)
      await api.nextFrame()
      await api.scrollToRatio(0.5)
      await api.nextFrame()
      await api.scrollToRatio(0)
      await api.nextFrame()
    })

    const rootScrollSync = await evaluateWithLab(page, async (api) => {
      const root = document.querySelector('[data-testid="virtual-scroll-root"]')
      const snapshot = api.read()

      return {
        domScrollTop: root?.scrollTop ?? null,
        snapshotScrollTop: snapshot.scrollTop,
        delta: root
          ? Math.abs(root.scrollTop - snapshot.scrollTop)
          : Number.POSITIVE_INFINITY,
      }
    })

    assert(
      rootScrollSync.delta <= 1,
      'virtual-scroll lab snapshot scrollTop is out of sync with DOM scrollTop',
      rootScrollSync,
    )

    await evaluateWithLab(page, async (api) => {
      api.clearEvents()
    })

    const result = await evaluateWithLab(page, async (api) => {
      const waitHealthy = async (frames = 30, options = {}) => {
        let latest = api.read()
        for (let i = 0; i < frames; i++) {
          await api.nextFrame()
          latest = api.read()
          const blankProbeOk = options.clearEvents === false
            ? latest.health.maxObservedBlankProbes === 0
            : latest.stats.blankProbeCount === 0
          if (
            blankProbeOk
            && latest.blankFrameCount === 0
            && latest.visibleCoverageOk
            && latest.health.virtualDomWithinLimit
            && latest.health.scrollJitterOk
            && latest.health.strictClippingOk
            && latest.maxItemHeightDriftPx < 24
          ) {
            if (options.clearEvents !== false) {
              api.clearEvents()
              await api.nextFrame()
              latest = api.read()
            }
            return latest
          }
        }
        return latest
      }
      const scrollToSettledBottom = async () => {
        let latest = api.read()
        for (let i = 0; i < 4; i++) {
          await api.scrollToRatio(1)
          latest = await waitHealthy(45)
          if (latest.distanceFromBottomPx < 32)
            return latest
        }
        return latest
      }
      const waitUntil = async (predicate, frames = 180) => {
        let latest = api.read()
        for (let i = 0; i < frames; i++) {
          if (predicate(latest))
            return latest
          await api.nextFrame()
          latest = api.read()
        }
        return latest
      }
      const getOuterAnchorDelta = (before, after) => {
        if (!before || !after || before.type !== after.type)
          return Number.POSITIVE_INFINITY

        if (before.type === 'bottom') {
          return Math.abs(
            Number(before.distanceFromBottomPx ?? 0)
            - Number(after.distanceFromBottomPx ?? 0),
          )
        }

        if (before.messageKey && after.messageKey && before.messageKey !== after.messageKey)
          return Number.POSITIVE_INFINITY

        if (before.messageKey == null && after.messageKey == null && before.index !== after.index)
          return Number.POSITIVE_INFINITY

        return Math.abs(Number(before.offsetPx ?? 0) - Number(after.offsetPx ?? 0))
      }
      const isCurrentHealthy = snapshot => (
        snapshot.stats.blankProbeCount === 0
        && snapshot.blankFrameCount === 0
        && snapshot.visibleCoverageOk
        && snapshot.health.maxObservedCoverageGapPx <= 24
        && snapshot.health.strictClippingOk
        && snapshot.health.virtualDomWithinLimit
        && snapshot.health.hugeRendererDomWithinLimit
        && snapshot.maxItemHeightDriftPx < 24
      )
      const isStableSnapshot = (previous, next) => (
        Math.abs(previous.scrollTop - next.scrollTop) <= 1
        && Math.abs(previous.totalHeight - next.totalHeight) <= 1
        && getOuterAnchorDelta(previous.outerAnchor, next.outerAnchor) <= 1
      )
      const waitCurrentHealthy = async (frames = 120) => {
        let latest = api.read()
        let previousHealthy = null
        let stableFrames = 0

        for (let i = 0; i < frames; i++) {
          await api.nextFrame()
          latest = api.read()

          if (!isCurrentHealthy(latest)) {
            previousHealthy = null
            stableFrames = 0
            continue
          }

          if (previousHealthy && isStableSnapshot(previousHealthy, latest))
            stableFrames += 1
          else
            stableFrames = 0

          previousHealthy = latest

          if (stableFrames >= 2)
            return latest
        }

        return latest
      }
      const waitCurrentHealthyAndClear = async (frames = 120) => {
        const latest = await waitCurrentHealthy(frames)
        if (!isCurrentHealthy(latest))
          return latest

        api.clearEvents()
        await api.nextFrame()
        return api.read()
      }

      await api.scrollToRatio(0.15)
      await waitCurrentHealthy()
      api.clearEvents()

      await api.scrollToRatio(0.82)
      const threadABefore = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-b')
      await waitCurrentHealthy()
      await api.scrollToRatio(0.58)
      const threadBBefore = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-a')
      const threadAAfter = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-b')
      const threadBAfter = await waitCurrentHealthy()
      api.clearEvents()

      await api.rapidSwitchThreads(
        ['thread-a', 'thread-b'],
        12,
      )
      await waitCurrentHealthy()
      api.clearEvents()

      await api.scrollToRatio(0.04)
      await api.nextFrame()
      await api.scrollToRatio(0.95)
      await api.nextFrame()
      const switchAfter = await waitHealthy(60, { clearEvents: false })

      api.clearEvents()
      api.startStressScroll()
      for (let i = 0; i < 180; i++)
        await api.nextFrame()
      api.stopStressScroll()
      const stressAfter = await waitHealthy(45, { clearEvents: false })
      api.clearEvents()
      await api.nextFrame()

      await scrollToSettledBottom()
      api.clearEvents()
      await api.nextFrame()
      const settledEventsBeforeStream = api.read().settledEvents
      api.startStreamingLastMessage({
        blocks: 160,
        chunkSize: 2600,
        intervalMs: 32,
      })

      for (let i = 0; i < 80; i++) {
        await api.nextFrame()
        const snapshot = api.read()

        if (snapshot.health.maxObservedBlankProbes > 0)
          throw new Error(`blank frame during streaming: ${snapshot.health.maxObservedBlankProbes}`)

        if (!snapshot.health.hugeRendererDomWithinLimit) {
          throw new Error(
            `DOM budget exceeded during streaming: slots=${snapshot.maxHugeMessageSlotCount}, budget=${snapshot.hugeRendererSlotBudget}`,
          )
        }

        if (!snapshot.health.scrollJitterOk)
          throw new Error(`unexpected scroll jitter during streaming: ${snapshot.health.maxObservedScrollJumpPx}px`)
      }

      await waitUntil(snapshot => snapshot.streamingActive === false, 720)
      await waitUntil(snapshot => snapshot.settledEvents > settledEventsBeforeStream, 180)
      await api.settleVisibleRenderers()
      api.clearEvents()
      await api.nextFrame()
      const streamAfter = await waitHealthy(120, { clearEvents: false })

      if (!streamAfter.health.layoutIntegrityOk)
        throw new Error(`streaming final layout failed: ${streamAfter.labStatus}`)

      api.clearEvents()
      await api.nextFrame()

      await api.toggleDensity()
      await api.toggleFontScale()
      await api.settleVisibleRenderers()
      const relayoutAfter = await waitCurrentHealthyAndClear(120)

      await api.toggleNarrowMode()
      await api.settleVisibleRenderers()
      await api.scrollToRatio(0.62)
      await api.settleVisibleRenderers()
      const narrowAfter = await waitCurrentHealthyAndClear(180)

      await api.toggleSmallMessageCoordination()
      await api.settleVisibleRenderers()
      const smallCoordinationAfter = await waitCurrentHealthyAndClear(180)

      await api.scrollToRatio(0.62)
      await waitCurrentHealthy()
      api.clearEvents()
      const relayoutThreadBefore = await waitCurrentHealthy()
      const settledEventsBeforeRelayoutRestore = relayoutThreadBefore.settledEvents
      const relayoutOtherThread
        = relayoutThreadBefore.threadId === 'thread-a' ? 'thread-b' : 'thread-a'

      await api.switchThread(relayoutOtherThread)
      await waitCurrentHealthy()
      await api.switchThread(relayoutThreadBefore.threadId)
      let relayoutThreadAfter = await waitCurrentHealthy()
      await waitUntil(
        snapshot => snapshot.settledEvents > settledEventsBeforeRelayoutRestore,
        180,
      )
      for (let i = 0; i < 8; i++)
        await api.nextFrame()
      relayoutThreadAfter = api.read()
      api.clearEvents()
      await api.nextFrame()

      const finalSettleResults = await api.settleVisibleRenderers()
      const finalAfter = await waitHealthy(45)

      return {
        threadABefore,
        threadBBefore,
        threadAAfter,
        threadBAfter,
        switchAfter,
        stressAfter,
        streamAfter,
        relayoutAfter,
        narrowAfter,
        smallCoordinationAfter,
        relayoutThreadBefore,
        relayoutThreadAfter,
        finalSettleResults,
        final: finalAfter,
      }
    })

    const {
      threadABefore,
      threadBBefore,
      threadAAfter,
      threadBAfter,
      switchAfter,
      stressAfter,
      streamAfter,
      relayoutAfter,
      narrowAfter,
      smallCoordinationAfter,
      relayoutThreadBefore,
      relayoutThreadAfter,
      finalSettleResults,
      final,
    } = result

    assertThreadRestore('thread-a', threadABefore, threadAAfter)
    assertThreadRestore('thread-b', threadBBefore, threadBAfter)
    assertThreadRestore('relayout thread restore', relayoutThreadBefore, relayoutThreadAfter)

    assert(
      switchAfter.health.maxObservedBlankProbes === 0
      && switchAfter.blankFrameCount === 0
      && switchAfter.visibleCoverageOk === true
      && switchAfter.health.maxObservedScrollJumpPx <= 32,
      'blank frame or unexpected scroll jump observed during thread switching',
      {
        health: switchAfter.health,
        events: switchAfter.events.filter(event =>
          (event.blankProbeCount ?? 0) > 0
          || (!event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
        ),
      },
    )

    assert(
      final.health.maxObservedBlankProbes === 0,
      'blank visible item observed during virtual scrolling',
      {
        health: final.health,
        events: final.events.filter(event => (event.blankProbeCount ?? 0) > 0),
      },
    )

    assert(
      final.blankFrameCount === 0,
      'blank frame counter increased during virtual scrolling',
      final,
    )

    assert(
      final.visibleCoverageOk === true,
      'visible probe coverage failed',
      final,
    )

    assert(
      final.health.maxObservedCoverageGapPx <= 24,
      'transient viewport coverage gap exceeded budget during virtual scrolling',
      {
        health: final.health,
        events: final.events.filter(event => (event.maxCoverageGapPx ?? 0) > 24),
      },
    )

    assert(
      final.health.virtualDomWithinLimit === true,
      'markdown DOM slot count exceeded budget',
      final.health,
    )

    assert(
      final.health.hugeRendererDomWithinLimit === true
      && final.maxHugeMessageSlotCount <= final.hugeRendererSlotBudget,
      'a huge Markdown renderer exceeded its per-renderer live node budget',
      {
        maxHugeMessageSlotCount: final.maxHugeMessageSlotCount,
        hugeRendererSlotBudget: final.hugeRendererSlotBudget,
        health: final.health,
      },
    )

    assert(
      final.health.maxObservedMarkdownSlots <= final.health.domSlotBudget,
      'observed markdown node-slot count exceeded budget',
      final.health,
    )

    assert(
      final.maxMarkdownSlotCount <= final.maxExpectedMarkdownSlotCeiling,
      'peak markdown node-slot count exceeded expected ceiling',
      {
        maxMarkdownSlotCount: final.maxMarkdownSlotCount,
        maxExpectedMarkdownSlotCeiling: final.maxExpectedMarkdownSlotCeiling,
      },
    )

    assert(
      final.maxDomNodeCount <= final.maxExpectedDomNodeCeiling,
      'peak DOM node count exceeded expected ceiling',
      {
        maxDomNodeCount: final.maxDomNodeCount,
        maxExpectedDomNodeCeiling: final.maxExpectedDomNodeCeiling,
      },
    )

    assert(
      final.health.maxObservedHeightDriftPx < 24,
      'height drift is too large after coordination',
      {
        health: final.health,
        events: final.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      final.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed during virtual-scroll coordination',
      {
        health: final.health,
        events: final.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      relayoutAfter.health.maxObservedScrollJumpPx <= 32
      && narrowAfter.health.maxObservedScrollJumpPx <= 32,
      'layout changes caused unexpected scroll jump',
      {
        relayout: relayoutAfter.health,
        narrow: narrowAfter.health,
      },
    )

    assert(
      relayoutAfter.maxItemHeightDriftPx < 24
      && narrowAfter.maxItemHeightDriftPx < 24,
      'height model did not converge after layout change',
      {
        relayout: relayoutAfter,
        narrow: narrowAfter,
      },
    )

    assert(
      final.health.layoutIntegrityOk === true,
      'virtual-scroll layout health check failed',
      final.health,
    )

    assert(
      final.health.threadRestoreOk === true,
      'thread restore delta exceeded budget',
      {
        lastThreadRestoreDeltaPx: final.health.lastThreadRestoreDeltaPx,
        lastThreadRestoreAnchorDeltaPx: final.health.lastThreadRestoreAnchorDeltaPx,
        health: final.health,
      },
    )

    assert(
      final.settledEvents > 0,
      'no render-settled events were observed in the virtual-scroll lab',
      {
        final,
        finalSettleResults,
      },
    )

    assert(
      final.heightCacheStateCount > 0,
      'no persisted heightCache state was captured for virtual-scroll renderers',
      final,
    )

    assert(
      stressAfter.health.maxObservedBlankProbes === 0
      && stressAfter.blankFrameCount === 0
      && stressAfter.visibleCoverageOk === true
      && stressAfter.health.maxObservedCoverageGapPx <= 24
      && stressAfter.health.virtualDomWithinLimit === true
      && stressAfter.health.hugeRendererDomWithinLimit === true,
      'blank frame or DOM budget regression observed during stress scroll',
      stressAfter,
    )

    assert(
      stressAfter.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed during stress scroll',
      {
        health: stressAfter.health,
        events: stressAfter.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      stressAfter.maxItemHeightDriftPx < 24,
      'height drift exceeded budget during stress scroll',
      {
        health: stressAfter.health,
        events: stressAfter.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      streamAfter.distanceFromBottomPx < 96,
      'streaming while pinned to bottom caused scroll drift',
      streamAfter,
    )

    assert(
      streamAfter.stats.blankProbeCount === 0,
      'blank frame observed while streaming a huge message',
      streamAfter.health,
    )

    assert(
      streamAfter.blankFrameCount === 0,
      'blank frame observed while streaming a huge message',
      streamAfter,
    )

    assert(
      streamAfter.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed while streaming a huge message',
      {
        health: streamAfter.health,
        events: streamAfter.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      streamAfter.maxItemHeightDriftPx < 24,
      'height drift exceeded budget while streaming a huge message',
      {
        health: streamAfter.health,
        events: streamAfter.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      relayoutAfter.health.maxObservedHeightDriftPx < 24,
      'density/font relayout did not converge',
      relayoutAfter.health,
    )

    assert(
      narrowAfter.layoutWidth > 0 && narrowAfter.layoutWidth < 320,
      'narrow virtual-scroll lab did not enter sub-320px layout',
      narrowAfter,
    )

    assert(
      narrowAfter.health.maxObservedHeightDriftPx < 24,
      'sub-320px virtual-scroll layout did not converge',
      narrowAfter.health,
    )

    assert(
      narrowAfter.health.maxObservedBlankProbes === 0
      && narrowAfter.blankFrameCount === 0
      && narrowAfter.visibleCoverageOk === true,
      'blank frame or coverage regression observed in narrow layout',
      narrowAfter,
    )

    assert(
      narrowAfter.health.maxObservedCoverageGapPx <= 24,
      'transient viewport coverage gap exceeded budget in narrow layout',
      narrowAfter.health,
    )

    assert(
      smallCoordinationAfter.health.maxObservedBlankProbes === 0
      && smallCoordinationAfter.blankFrameCount === 0
      && smallCoordinationAfter.visibleCoverageOk === true
      && smallCoordinationAfter.health.virtualDomWithinLimit === true
      && smallCoordinationAfter.health.maxObservedScrollJumpPx <= 32,
      'small-message virtual-scroll coordination caused blank frame, DOM budget, or jitter regression',
      smallCoordinationAfter,
    )

    const anchorPollutionProbe = await evaluateWithLab(page, async (api) => {
      await api.scrollToRatio(0.73)
      await api.nextFrame()
      const before = api.read()

      await api.toggleDensity()
      await api.settleVisibleRenderers()
      for (let i = 0; i < 30; i++)
        await api.nextFrame()

      const afterRelayout = api.read()

      await api.switchThread(before.threadId === 'thread-a' ? 'thread-b' : 'thread-a')
      for (let i = 0; i < 12; i++)
        await api.nextFrame()

      await api.switchThread(before.threadId)
      for (let i = 0; i < 30; i++)
        await api.nextFrame()

      const restored = api.read()

      return {
        before,
        afterRelayout,
        restored,
      }
    })

    assertThreadRestore(
      'anchor pollution probe',
      anchorPollutionProbe.afterRelayout,
      anchorPollutionProbe.restored,
    )

    assertNoPageErrors('virtual-scroll stress e2e')

    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode,
      health: final.health,
    }, null, 2)}\n`)
  }
  catch (error) {
    if (page) {
      const pageDebugState = await collectPageDebugState(page)
      const snapshot = pageDebugState?.snapshot ?? null

      if (snapshot)
        process.stderr.write(`[virtual-scroll:snapshot]\n${JSON.stringify(snapshot, null, 2)}\n`)

      const snapshotPath = path.join(repoRoot, 'virtual-scroll-failure.json')
      writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            snapshot,
            pageDebugState,
            pageErrors,
            consoleMessages,
            requestFailures,
            error: {
              message: error?.message || String(error),
              stack: error?.stack || '',
            },
          },
          null,
          2,
        ),
      )
      process.stderr.write(`[virtual-scroll:snapshot-file] ${snapshotPath}\n`)

      const screenshotPath = path.join(repoRoot, 'virtual-scroll-failure.png')
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
      process.stderr.write(`[virtual-scroll:screenshot] ${screenshotPath}\n`)
    }

    process.stderr.write(`${server.getLogs()}\n`)
    throw error
  }
  finally {
    if (browser)
      await browser.close().catch(() => {})

    killProcessTree(server.child)
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
