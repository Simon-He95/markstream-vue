/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useScrollListener } from '../src/components/NodeRenderer/composables/useScrollListener'

function createRoot() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

function createHarness(options: {
  isClient?: boolean
  virtualized?: boolean
  root?: HTMLElement | null
} = {}) {
  const root = ref<HTMLElement | null>(
    options.root === undefined ? createRoot() : options.root,
  )
  const virtualized = ref(options.virtualized ?? true)
  const scrollRootElement = ref<HTMLElement | null>(null)
  const resolveScrollContainer = vi.fn(() => root.value)
  const scheduleFocusSync = vi.fn()

  const listener = useScrollListener({
    isClient: options.isClient ?? true,
    virtualizationEnabled: computed(() => virtualized.value),
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
  })

  return {
    root,
    virtualized,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
    listener,
  }
}

describe('useScrollListener', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does nothing when not running on the client', () => {
    const h = createHarness({
      isClient: false,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).not.toHaveBeenCalled()
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('does nothing when virtualization is disabled', () => {
    const h = createHarness({
      virtualized: false,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).not.toHaveBeenCalled()
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('does nothing when no scroll root is resolved', () => {
    const h = createHarness({
      root: null,
    })

    h.listener.setupScrollListener()

    expect(h.resolveScrollContainer).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()
  })

  it('attaches a passive scroll listener and stores the scroll root', () => {
    const h = createHarness()
    const addEventListener = vi.spyOn(h.root.value!, 'addEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)
    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true },
    )

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
    expect(h.scheduleFocusSync).toHaveBeenCalledWith()
  })

  it('does not attach a duplicate listener for the same root', () => {
    const h = createHarness()
    const addEventListener = vi.spyOn(h.root.value!, 'addEventListener')

    h.listener.setupScrollListener()
    h.listener.setupScrollListener()
    h.listener.setupScrollListener()

    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('detaches the old root and attaches the new root when root changes', () => {
    const oldRoot = createRoot()
    const newRoot = createRoot()
    const h = createHarness({
      root: oldRoot,
    })

    const oldRemoveEventListener = vi.spyOn(oldRoot, 'removeEventListener')
    const newAddEventListener = vi.spyOn(newRoot, 'addEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(oldRoot)

    h.root.value = newRoot
    h.listener.setupScrollListener()

    expect(oldRemoveEventListener).toHaveBeenCalledTimes(1)
    expect(newAddEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBe(newRoot)

    h.scheduleFocusSync.mockClear()

    oldRoot.dispatchEvent(new Event('scroll'))
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()

    newRoot.dispatchEvent(new Event('scroll'))
    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('cleanup removes the listener and clears the stored scroll root', () => {
    const h = createHarness()
    const removeEventListener = vi.spyOn(h.root.value!, 'removeEventListener')

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.listener.cleanupScrollListener()

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(h.scrollRootElement.value).toBeNull()

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('cleanup is safe when no listener is attached', () => {
    const h = createHarness()

    h.listener.cleanupScrollListener()
    h.listener.cleanupScrollListener()

    expect(h.scrollRootElement.value).toBeNull()
    expect(h.scheduleFocusSync).not.toHaveBeenCalled()
  })

  it('can attach again after cleanup', () => {
    const h = createHarness()

    h.listener.setupScrollListener()
    h.listener.cleanupScrollListener()
    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })

  it('rechecks virtualization on later setup calls', () => {
    const h = createHarness({
      virtualized: false,
    })

    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBeNull()

    h.virtualized.value = true
    h.listener.setupScrollListener()

    expect(h.scrollRootElement.value).toBe(h.root.value)

    h.root.value!.dispatchEvent(new Event('scroll'))

    expect(h.scheduleFocusSync).toHaveBeenCalledTimes(1)
  })
})
