import type { MarkstreamVirtualMetrics, MarkstreamVirtualState } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import MarkstreamVirtualTimeline from '../src/components/MarkstreamVirtualTimeline'

async function flushAnimationFrame() {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve(undefined))
      return
    }

    setTimeout(resolve, 0)
  })
}

async function waitForTimelineRestoreSettled(
  root: HTMLElement,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 1200
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await nextTick()
    await flushAnimationFrame()

    if (!root.classList.contains('is-restoring-thread'))
      return
  }

  expect(root.classList.contains('is-restoring-thread')).toBe(false)
}

function installRestoreGeometryStub(height = 360, width = 800) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const el = this as HTMLElement
    const root = el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
    const hidden = el.closest?.('.code-editor-container.is-hidden')
    const isMeasureRoot = el.hasAttribute('data-test-top')
    const ownTop = el.hasAttribute('data-test-top')
      ? Number(el.dataset.testTop ?? '0')
      : Number(el.querySelector<HTMLElement>('[data-test-top]')?.dataset.testTop ?? '0')
    const ownHeight = el.hasAttribute('data-test-height')
      ? Number(el.dataset.testHeight ?? String(height))
      : Number(el.querySelector<HTMLElement>('[data-test-height]')?.dataset.testHeight ?? String(height))
    const top = (isMeasureRoot || el.hasAttribute('data-markstream-item-key'))
      ? ownTop - (root?.scrollTop || 0)
      : 0
    const rectHeight = (isMeasureRoot || el.hasAttribute('data-markstream-item-key')) ? ownHeight : height

    return {
      x: 0,
      y: top,
      top,
      right: hidden ? 0 : width,
      bottom: hidden ? 0 : top + rectHeight,
      left: 0,
      width: hidden ? 0 : width,
      height: hidden ? 0 : rectHeight,
      toJSON: () => ({}),
    } as DOMRect
  })
}

function timelineItemSource(threadKey: string, itemKey: string, revision?: string | number, widthBucket = 800) {
  return {
    sourceKey: [threadKey, itemKey, revision == null ? '' : String(revision)].join(':'),
    measurementKey: `:${widthBucket}`,
    widthBucket,
  }
}

function timelineMarkdownMeasurementKey(widthBucket = 800, mode = 'docs', codeRenderer = 'stream-diffs') {
  return [`:${widthBucket}`, mode, codeRenderer].join('\u0001')
}

function timelineMarkdownItemSource(threadKey: string, itemKey: string, revision?: string | number, widthBucket = 800) {
  return {
    sourceKey: [threadKey, itemKey, revision == null ? '' : String(revision)].join(':'),
    measurementKey: timelineMarkdownMeasurementKey(widthBucket),
    widthBucket,
  }
}

function createMetrics(totalHeight: number, sessionKey: string): MarkstreamVirtualMetrics {
  return {
    sessionKey,
    phase: 'measuring',
    nodeCount: 1,
    liveRange: { start: 0, end: 1 },
    renderedCount: 1,
    measuredCount: 1,
    estimatedCount: 0,
    averageNodeHeight: totalHeight,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
    visibleDomHeight: totalHeight,
    totalHeight,
    width: 800,
    final: true,
    stable: true,
    confidence: 'measured',
    reason: 'manual',
  }
}

function markMarkdownMetricsReady(
  markdownProps: any,
  totalHeight = 360,
  patch: Partial<MarkstreamVirtualMetrics> = {},
) {
  const sessionKey = markdownProps.virtualScroll.sessionKey
  const metrics = {
    ...createMetrics(totalHeight, sessionKey),
    ...patch,
  }

  markdownProps.onHeightChange(metrics)
  markdownProps.onVirtualStateChange({
    sessionKey,
    threadKey: markdownProps.virtualScroll.threadKey,
    metrics,
    width: 800,
    measurementKey: markdownProps.virtualScroll.measurementKey,
  } as MarkstreamVirtualState)
}

function stubTimelineDom(height = 360) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

describe('virtual timeline restore visual readiness', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16)
    })
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not treat pending math content as restore-ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [{ kind: 'assistant-markdown', id: 'm1', content: 'math', final: true, revision: 1 }],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
                h('div', { class: 'node-content' }, [
                  h('span', {
                    'data-markstream-math': 'inline',
                    'data-markstream-mode': 'fallback',
                    'data-markstream-pending': 'true',
                  }, '$x$'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      const pendingMath = wrapper.get('[data-markstream-math="inline"]')
      pendingMath.element.removeAttribute('data-markstream-pending')
      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps polling restore readiness after the first poll window', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'late math', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
                h('div', { class: 'node-content' }, [
                  h('span', {
                    'data-markstream-math': 'inline',
                    'data-markstream-mode': 'fallback',
                    'data-markstream-pending': 'true',
                  }, '$x$'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // Let the initial 40-frame readiness window expire.
      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // Change DOM readiness without triggering a Vue component update.
      wrapper.get('[data-markstream-math="inline"]').element.removeAttribute('data-markstream-pending')

      // The retry loop should observe the DOM becoming ready and reveal.
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps restored item height while restore DOM measures taller temporarily', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        const measured = el.hasAttribute('data-test-height')
          ? Number(el.dataset.testHeight)
          : Number(el.querySelector<HTMLElement>('[data-test-height]')?.dataset.testHeight)

        return Number.isFinite(measured) && measured > 0 ? measured : 80
      })
      installRestoreGeometryStub(80)
      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Ready', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 320 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', {
              'ref': props.measureRef,
              'data-test-top': '0',
              'data-test-height': '420',
            }, [
              h('div', { class: 'markdown-renderer' }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                }, [
                  h('div', { class: 'node-content' }, '# Ready'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const timeline = wrapper.vm as unknown as { getItemSize: (key: string) => number | undefined }
      expect(timeline.getItemSize('m1')).toBe(320)

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(timeline.getItemSize('m1')).toBe(320)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not treat an empty visible restore viewport as ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1200)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement

        if (el.matches?.('[data-testid="markstream-virtual-timeline"]')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 300,
            left: 0,
            width: 800,
            height: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-markstream-item-key')) {
          return {
            x: 0,
            y: 1000,
            top: 1000,
            right: 800,
            bottom: 1100,
            left: 0,
            width: 800,
            height: 100,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 800,
          bottom: 0,
          left: 0,
          width: 800,
          height: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 1200 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not reveal when a visible markdown item only has offscreen node slots', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom(1200)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement
        const root = el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
        const ownTop = el.hasAttribute('data-test-top')
          ? Number(el.dataset.testTop ?? '0')
          : Number(el.querySelector<HTMLElement>('[data-test-top]')?.dataset.testTop ?? '0')
        const ownHeight = el.hasAttribute('data-test-height')
          ? Number(el.dataset.testHeight ?? '1200')
          : Number(el.querySelector<HTMLElement>('[data-test-height]')?.dataset.testHeight ?? '1200')

        if (el.matches?.('[data-testid="markstream-virtual-timeline"]')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 300,
            left: 0,
            width: 800,
            height: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        const top = (el.hasAttribute('data-test-top') || el.hasAttribute('data-markstream-item-key'))
          ? ownTop - (root?.scrollTop || 0)
          : 0

        return {
          x: 0,
          y: top,
          top,
          right: 800,
          bottom: top + ownHeight,
          left: 0,
          width: 800,
          height: ownHeight,
          toJSON: () => ({}),
        } as DOMRect
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 1200 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', {
              'ref': props.measureRef,
              'data-test-top': '0',
              'data-test-height': '1200',
            }, [
              h('div', { class: 'markdown-renderer' }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'paragraph',
                  'data-test-top': '1000',
                  'data-test-height': '80',
                }, [
                  h('div', { class: 'node-content' }, 'Offscreen node content'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      const slot = wrapper.get('[data-node-index="0"]').element as HTMLElement
      slot.setAttribute('data-test-top', '0')

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('ignores zero-height edge node slots when checking restore readiness', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement

        if (el.matches?.('[data-testid="markstream-virtual-timeline"]')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 300,
            left: 0,
            width: 800,
            height: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-markstream-item-key')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 360,
            left: 0,
            width: 800,
            height: 360,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-test-top')) {
          const top = Number(el.dataset.testTop ?? '0')
          const height = Number(el.dataset.testHeight ?? '80')

          return {
            x: 0,
            y: top,
            top,
            right: 800,
            bottom: top + height,
            left: 0,
            width: 800,
            height,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 800,
          bottom: 80,
          left: 0,
          width: 800,
          height: 80,
          toJSON: () => ({}),
        } as DOMRect
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Ready\n\nPending edge', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { class: 'markdown-renderer' }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                  'data-test-top': '0',
                  'data-test-height': '80',
                }, [
                  h('div', { class: 'node-content' }, '# Ready'),
                ]),
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '1',
                  'data-node-type': 'paragraph',
                  'data-test-top': '300',
                  'data-test-height': '0',
                }, [
                  h('div', { class: 'node-placeholder' }),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals bottom restore when only the restored markdown floor tail is visible', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom(600)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement
        const root = el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
        const scrollTop = root?.scrollTop || 0

        if (el.matches?.('[data-testid="markstream-virtual-timeline"]')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 300,
            left: 0,
            width: 800,
            height: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-markstream-item-key')) {
          const top = -scrollTop

          return {
            x: 0,
            y: top,
            top,
            right: 800,
            bottom: top + 600,
            left: 0,
            width: 800,
            height: 600,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-test-top')) {
          const top = Number(el.dataset.testTop ?? '0') - scrollTop
          const height = Number(el.dataset.testHeight ?? '80')

          return {
            x: 0,
            y: top,
            top,
            right: 800,
            bottom: top + height,
            left: 0,
            width: 800,
            height,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          x: 0,
          y: -scrollTop,
          top: -scrollTop,
          right: 800,
          bottom: 80 - scrollTop,
          left: 0,
          width: 800,
          height: 80,
          toJSON: () => ({}),
        } as DOMRect
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Ready', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: 'auto',
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'bottom', distanceFromBottomPx: 0 },
            itemHeights: { m1: 600 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', {
                'class': 'markdown-renderer',
                'data-test-top': '0',
                'data-test-height': '40',
              }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                  'data-test-top': '0',
                  'data-test-height': '20',
                }, [
                  h('div', { class: 'node-content' }, '# Ready'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals item-anchor restore when only the restored markdown floor tail is visible', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom(600)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement
        const root = el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
        const scrollTop = root?.scrollTop || 0

        if (el.matches?.('[data-testid="markstream-virtual-timeline"]')) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 800,
            bottom: 300,
            left: 0,
            width: 800,
            height: 300,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-markstream-item-key')) {
          const top = -scrollTop

          return {
            x: 0,
            y: top,
            top,
            right: 800,
            bottom: top + 600,
            left: 0,
            width: 800,
            height: 600,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (el.hasAttribute('data-test-top')) {
          const top = Number(el.dataset.testTop ?? '0') - scrollTop
          const height = Number(el.dataset.testHeight ?? '80')

          return {
            x: 0,
            y: top,
            top,
            right: 800,
            bottom: top + height,
            left: 0,
            width: 800,
            height,
            toJSON: () => ({}),
          } as DOMRect
        }

        return {
          x: 0,
          y: -scrollTop,
          top: -scrollTop,
          right: 800,
          bottom: 80 - scrollTop,
          left: 0,
          width: 800,
          height: 80,
          toJSON: () => ({}),
        } as DOMRect
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Ready', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 520 },
            itemHeights: { m1: 600 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', {
                'class': 'markdown-renderer',
                'data-test-top': '0',
                'data-test-height': '40',
              }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                  'data-test-top': '0',
                  'data-test-height': '20',
                }, [
                  h('div', { class: 'node-content' }, '# Ready'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps restore loading on first cold thread switch until routed mermaid content is ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let mermaidReady = false
      let latestMarkdownProps: any

      const threadA = [
        { kind: 'user-message', id: 'a1', text: 'Thread A' },
      ]

      const threadB = [
        { kind: 'assistant-markdown', id: 'b1', content: '```mermaid\nflowchart TD\nA-->B\n```', final: true, revision: 1 },
      ]

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: threadA,
          threadKey: 'thread-a',
          stickToBottom: 'auto',
        },
        slots: {
          default(props: any) {
            if (props.itemKey === 'b1') {
              latestMarkdownProps = props.markdownProps

              return h('div', {
                ref: props.measureRef,
                class: 'markdown-renderer',
              }, [
                h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                  h('div', { class: 'node-content' }, [
                    h('div', {
                      'data-markstream-mermaid': '1',
                      'data-markstream-mode': mermaidReady ? 'preview' : 'pending',
                      'data-markstream-pending': mermaidReady ? undefined : 'true',
                      'class': 'mermaid-block-container',
                    }, [
                      mermaidReady
                        ? h('svg', { width: 100, height: 100 })
                        : h('div', { class: 'mermaid-preview-area' }),
                    ]),
                  ]),
                ]),
              ])
            }

            return h('div', { ref: props.measureRef }, props.item.text ?? '')
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

      expect(root.classList.contains('is-restoring-thread')).toBe(false)

      await wrapper.setProps({
        items: threadB,
        threadKey: 'thread-b',
      })
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      mermaidReady = true
      await wrapper.setProps({ items: [...threadB] })
      await nextTick()
      markMarkdownMetricsReady(latestMarkdownProps)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals cold restored thread when visible markdown DOM and metrics are stable without persisted markdown state', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let latestMarkdownProps: any

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Cold thread\n\n```ts\nconst a = 1\n```', final: true, revision: 1 },
          ],
          threadKey: 'thread-b',
          stickToBottom: false,
        },
        slots: {
          default(props: any) {
            latestMarkdownProps = props.markdownProps

            return h('article', {
              'ref': props.measureRef,
              'data-markstream-item-key': props.itemKey,
            }, [
              h('div', { class: 'markdown-renderer' }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                }, [
                  h('div', { class: 'node-content' }, '# Cold thread'),
                ]),
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '1',
                  'data-node-type': 'code_block',
                }, [
                  h('div', { class: 'node-content' }, [
                    h('div', {
                      'data-markstream-code-block': '1',
                      'data-markstream-enhanced': 'true',
                      'class': 'code-block-container',
                    }, [
                      h('pre', { 'data-markstream-pre': '1' }, 'const a = 1'),
                    ]),
                  ]),
                ]),
              ]),
            ])
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      ;(wrapper.vm as any).restoreThreadState(null, { threadSwitch: true })

      await nextTick()
      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(32)
        await nextTick()
      }

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      markMarkdownMetricsReady(latestMarkdownProps)
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('waits for stable mixed virtual markdown metrics before revealing cold restored thread', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom(920)
      installRestoreGeometryStub(920)

      let latestMarkdownProps: any

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Cold thread\n\nLong final transcript', final: true, revision: 1 },
          ],
          threadKey: 'thread-b',
          stickToBottom: false,
        },
        slots: {
          default(props: any) {
            latestMarkdownProps = props.markdownProps

            return h('article', {
              'ref': props.measureRef,
              'data-markstream-item-key': props.itemKey,
            }, [
              h('div', { class: 'markdown-renderer' }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                }, [
                  h('div', { class: 'node-content' }, '# Cold thread'),
                ]),
              ]),
            ])
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      ;(wrapper.vm as any).restoreThreadState(null, { threadSwitch: true })

      await nextTick()
      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

      markMarkdownMetricsReady(latestMarkdownProps, 920, {
        phase: 'settling',
        nodeCount: 90,
        liveRange: { start: 0, end: 60 },
        renderedCount: 80,
        measuredCount: 60,
        estimatedCount: 22,
        averageNodeHeight: 10,
        visibleDomHeight: 640,
        stable: false,
        confidence: 'mixed',
      })
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

      markMarkdownMetricsReady(latestMarkdownProps, 920, {
        phase: 'settling',
        nodeCount: 90,
        liveRange: { start: 0, end: 60 },
        renderedCount: 80,
        measuredCount: 60,
        estimatedCount: 22,
        averageNodeHeight: 10,
        visibleDomHeight: 640,
        stable: true,
        confidence: 'mixed',
      })
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps restore loading on a cold thread switch while initial restore is still pending', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let mermaidReady = false
      let latestMarkdownProps: any

      const threadA = [
        { kind: 'assistant-markdown', id: 'a1', content: 'pending math', final: true, revision: 1 },
      ]

      const threadB = [
        { kind: 'assistant-markdown', id: 'b1', content: '```mermaid\nflowchart TD\nA-->B\n```', final: true, revision: 1 },
      ]

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: threadA,
          threadKey: 'thread-a',
          stickToBottom: 'auto',
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'bottom', distanceFromBottomPx: 0 },
            itemHeights: { a1: 360 },
            itemSizeSources: { a1: timelineMarkdownItemSource('thread-a', 'a1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            if (props.itemKey === 'a1') {
              return h('div', { ref: props.measureRef }, [
                h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
                  h('div', { class: 'node-content' }, [
                    h('span', {
                      'data-markstream-math': 'inline',
                      'data-markstream-mode': 'fallback',
                      'data-markstream-pending': 'true',
                    }, '$x$'),
                  ]),
                ]),
              ])
            }

            latestMarkdownProps = props.markdownProps

            return h('div', { ref: props.measureRef, class: 'markstream-vue markdown-renderer' }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-mermaid': '1',
                    'data-markstream-mode': mermaidReady ? 'preview' : 'pending',
                    'data-markstream-pending': mermaidReady ? undefined : 'true',
                    'class': 'mermaid-block-container',
                  }, [
                    mermaidReady
                      ? h('svg', { width: 100, height: 100 })
                      : h('div', { class: 'mermaid-preview-area' }),
                  ]),
                ]),
              ]),
            ])
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await wrapper.setProps({
        items: threadB,
        threadKey: 'thread-b',
      })
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      mermaidReady = true
      await wrapper.setProps({ items: [...threadB] })
      await nextTick()
      markMarkdownMetricsReady(latestMarkdownProps)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals restore loading after max timeout when restoreMaxLoadingMs is configured', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          restoreMaxLoadingMs: 3000,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-code-block': '1',
                    'data-markstream-enhanced': 'false',
                  }, [
                    h('div', { class: 'code-editor-container is-hidden' }, [
                      h('div', { class: 'stream-diffs-shell' }),
                    ]),
                  ]),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(3500)
      await nextTick()
      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('restore viewport did not become ready before timeout'))
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps restore loading by default when visible content never becomes ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-code-block': '1',
                    'data-markstream-enhanced': 'false',
                  }, [
                    h('div', { class: 'code-editor-container is-hidden' }, [
                      h('div', { class: 'stream-diffs-shell' }),
                    ]),
                  ]),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(5000)
      await nextTick()
      await vi.advanceTimersByTimeAsync(2000)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('treats settled math fallback content as restore-ready', async () => {
    stubTimelineDom()
    installRestoreGeometryStub()

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [{ kind: 'assistant-markdown', id: 'm1', content: 'math', final: true, revision: 1 }],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
          itemHeights: { m1: 360 },
          itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, [
            h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
              h('div', { class: 'node-content' }, [
                h('span', {
                  'data-markstream-math': 'inline',
                  'data-markstream-mode': 'fallback',
                }, '$x$'),
              ]),
            ]),
          ])
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)

    await waitForTimelineRestoreSettled(root)

    wrapper.unmount()
  })

  it('does not reveal restored viewport at settle timer while visible code block is still async-loading', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let codeReady = false

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  codeReady
                    ? h('div', {
                        'data-markstream-code-block': '1',
                        'data-markstream-enhanced': 'true',
                        'class': 'code-block-container',
                      }, 'ready code block')
                    : h('pre', {
                        'class': 'code-pre-fallback',
                        'data-markstream-code-loading': '1',
                        'style': 'height: 240px; min-height: 240px;',
                      }, 'loading code block'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // This crosses the old 640ms forced reveal window.
      await vi.advanceTimersByTimeAsync(800)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      codeReady = true
      await wrapper.setProps({ items: [...wrapper.props('items')] })
      await nextTick()

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals restored viewport when a pending code block has a stable visible pre fallback', async () => {
    stubTimelineDom()
    installRestoreGeometryStub()

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [{ kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 }],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
          itemHeights: { m1: 360 },
          itemSizeSources: { m1: timelineMarkdownItemSource('thread-a', 'm1', 1) },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, [
            h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
              h('div', { class: 'node-content' }, [
                h('div', {
                  'class': 'code-block-container',
                  'data-markstream-code-block': '1',
                  'data-markstream-enhanced': 'false',
                  'data-markstream-pending': 'true',
                }, [
                  h('pre', { class: 'code-pre-fallback' }, 'const readyFallback = true'),
                ]),
              ]),
            ]),
          ])
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)

    await waitForTimelineRestoreSettled(root)

    wrapper.unmount()
  })

  it('reserves async code block loading fallback height from block estimates', async () => {
    const { CodeBlockNodeLoading } = await import('../src/components/NodeRenderer/asyncComponent')

    const wrapper = mount(CodeBlockNodeLoading as any, {
      attrs: {
        'node': {
          type: 'code_block',
          language: 'ts',
          code: 'const x = 1',
          raw: '```ts src/example.ts\nconst x = 1\n```',
          loading: true,
        },
        'estimatedHeightPx': 240,
        'estimatedContentHeightPx': 123.2,
        'style': { width: '73%' },
        'data-root-probe': 'outer',
      },
    })

    const pre = wrapper.get('pre.code-pre-fallback')
    const root = wrapper.get('.code-block-container')
    expect(pre.attributes('data-markstream-code-loading')).toBe('1')
    expect(root.attributes('data-markstream-code-loading')).toBe('1')
    expect(root.attributes('data-root-probe')).toBe('outer')
    expect(root.attributes('style')).toContain('width: 73%')
    expect(pre.attributes('data-root-probe')).toBeUndefined()
    expect(pre.attributes('style')).not.toMatch(/(?:^|;\s*)height: 123px/)
    expect(pre.attributes('style')).not.toMatch(/(?:^|;\s*)min-height: 123px/)
    expect(pre.attributes('style')).toContain('max-height: 124px')
    expect(pre.attributes('style')).toContain('overflow: auto')
    expect((pre.element as HTMLElement).style.fontSize).toBe('12px')
    expect((pre.element as HTMLElement).style.lineHeight).toBe('18px')
    expect((pre.element as HTMLElement).style.tabSize).toBe('4')
    expect((pre.element as HTMLElement).style.paddingTop).toBe('8px')
    expect((pre.element as HTMLElement).style.paddingBottom).toBe('8px')
    expect(wrapper.get('.code-header-title').text()).toBe('src/example.ts')
    expect(wrapper.get('.code-header-caption').text()).toBe('Typescript')
    const headerMain = wrapper.get('.code-header-main').element as HTMLElement
    const headerCopy = wrapper.get('.code-header-copy').element as HTMLElement
    const headerTitle = wrapper.get('.code-header-title').element as HTMLElement
    const headerCaption = wrapper.get('.code-header-caption').element as HTMLElement
    const iconSlot = wrapper.get('.icon-slot')
    expect(headerMain.style.display).toBe('flex')
    expect(headerMain.style.gap).toBe('var(--ms-gap-header-main, 0.625rem)')
    expect(headerCopy.style.display).toBe('grid')
    expect(headerTitle.style.fontSize).toBe('var(--ms-text-label, 0.75rem)')
    expect(headerTitle.style.fontWeight).toBe('500')
    expect(headerTitle.style.textOverflow).toBe('ellipsis')
    expect(headerCaption.style.fontSize).toBe('0.75rem')
    expect(headerCaption.style.textOverflow).toBe('ellipsis')
    expect(iconSlot.attributes('aria-hidden')).toBe('true')
    expect((iconSlot.element as HTMLElement).style.display).toBe('inline-flex')
    expect((iconSlot.element as HTMLElement).style.width).toBe('1rem')
    expect((iconSlot.element as HTMLElement).style.height).toBe('1rem')
    expect((iconSlot.element as HTMLElement).style.flex).toBe('0 0 auto')
    for (const icon of wrapper.findAll('.code-action-btn .action-icon')) {
      expect(icon.attributes('width')).toBe('14')
      expect(icon.attributes('height')).toBe('14')
    }
    expect(wrapper.get('.code-block-container').classes()).toContain('border')
    expect((root.element as HTMLElement).style.color).toBe('var(--vscode-editor-foreground, var(--markstream-code-fallback-fg, var(--code-fg)))')
    expect((root.element as HTMLElement).style.backgroundColor).toBe('var(--markstream-code-fallback-bg, var(--code-bg, #fff))')
    expect((root.element as HTMLElement).style.borderColor).toBe('var(--markstream-code-border-color, var(--code-border))')
    expect(pre.classes()).not.toContain('border')

    wrapper.unmount()
  })

  it('reserves preview-only and diff-only header chrome while loading', async () => {
    const { CodeBlockNodeLoading } = await import('../src/components/NodeRenderer/asyncComponent')
    const disabledActions = {
      showCopyButton: false,
      showCollapseButton: false,
      showFontSizeButtons: false,
      enableFontSizeControl: false,
      showExpandButton: false,
    }

    const preview = mount(CodeBlockNodeLoading as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'html',
          code: '<p>preview</p>',
          raw: '```html\n<p>preview</p>\n```',
          loading: true,
        },
        ...disabledActions,
        isShowPreview: true,
        showPreviewButton: true,
      },
    })
    expect(preview.findAll('.code-action-btn')).toHaveLength(1)
    preview.unmount()

    const diff = mount(CodeBlockNodeLoading as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '',
          raw: '```diff\n-old\n+new\n```',
          diff: true,
          originalCode: 'old',
          updatedCode: 'new',
          loading: true,
        },
        estimatedContentHeightPx: 36,
        ...disabledActions,
        showPreviewButton: false,
      },
    })
    expect(diff.findAll('.code-action-btn')).toHaveLength(0)
    expect(diff.findAll('.code-diff-stat')).toHaveLength(2)
    expect(diff.get('.code-block-container').classes()).toContain('is-diff')
    expect(diff.get('pre.code-pre-fallback').attributes('style')).not.toContain('36px')
    expect(diff.get('pre.code-pre-fallback').classes()).not.toContain('markstream-pre--diff-inline')
    diff.unmount()
  })

  it('keeps async loading container state aligned with the final shell', async () => {
    const { CodeBlockNodeLoading } = await import('../src/components/NodeRenderer/asyncComponent')
    const wrapper = mount(CodeBlockNodeLoading as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '-const before = true\n+const ready = true',
          raw: '```diff\n-const before = true\n+const ready = true\n```',
          diff: true,
          originalCode: 'const before = true',
          updatedCode: 'const ready = true',
          loading: true,
        },
        loading: true,
        stream: false,
        isDark: true,
        minWidth: 120,
        maxWidth: '80%',
      },
    })

    const root = wrapper.get('.code-block-container')
    expect(root.classes()).toContain('dark')
    expect(root.classes()).toContain('is-dark')
    expect(root.classes()).toContain('is-rendering')
    expect(root.attributes('style')).toContain('min-width: 120px')
    expect(root.attributes('style')).toContain('max-width: 80%')
    expect(wrapper.get('pre.code-pre-fallback').attributes('style')).toContain('--markstream-pre-diff-line-height: 18px')
    expect(wrapper.get('.code-block-shell-content').attributes('style')).toContain('display: none')
    expect(wrapper.get('.code-loading-placeholder').attributes('style') ?? '').not.toContain('display: none')

    await wrapper.setProps({ loading: false })
    expect(wrapper.get('.code-block-shell-content').attributes('style') ?? '').not.toContain('display: none')
    expect(wrapper.get('.code-loading-placeholder').attributes('style')).toContain('display: none')
    wrapper.unmount()
  })

  it('keeps configured item overscan mounted during restore', async () => {
    const itemHeight = 88

    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList.contains('markstream-virtual-timeline__item'))
        return Number.parseFloat(el.style.minHeight || '0') || itemHeight

      return itemHeight
    })
    installRestoreGeometryStub(itemHeight)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = Array.from({ length: 20 }, (_, index) => ({
      kind: 'user-message',
      id: `u${index}`,
      text: `Item ${index}`,
    }))

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        overscanPx: 1000,
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: { type: 'item', itemKey: 'u10', offsetWithinItemPx: 0 },
          itemHeights: Object.fromEntries(items.map(item => [item.id, itemHeight])),
          itemSizeSources: Object.fromEntries(items.map(item => [item.id, timelineItemSource('thread-a', item.id)])),
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', {
            'ref': props.measureRef,
            'data-test-top': props.index * itemHeight,
            'data-test-height': itemHeight,
          }, props.item.text)
        },
      },
    })

    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)
    const restoreItemCount = wrapper.findAll('.markstream-virtual-timeline__item').length
    expect(restoreItemCount).toBe(items.length)

    await waitForTimelineRestoreSettled(root)
    await nextTick()

    expect(wrapper.findAll('.markstream-virtual-timeline__item').length).toBe(restoreItemCount)

    wrapper.unmount()
  })
})
