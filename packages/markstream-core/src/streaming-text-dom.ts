import { createStreamingTextFade } from './streaming-text-fade'

export function createStreamingTextScope(scheduleCleanup: (work: () => void) => void) {
  let final = false
  const listeners = new Set<() => void>()
  return {
    get final() { return final },
    scheduleCleanup,
    setFinal(value: boolean) {
      if (final === value)
        return
      final = value
      for (const listener of [...listeners])
        listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type StreamingTextScope = ReturnType<typeof createStreamingTextScope>

// The framework owns the host and its initial (SSR) text. This binding owns
// subsequent children, so settled Text nodes survive both appends and selection.
export function createStreamingTextDom(host: HTMLElement, initial: string, scope?: StreamingTextScope) {
  const document = host.ownerDocument
  const controller = createStreamingTextFade(initial)
  const deltas = new Map<number, HTMLSpanElement>()
  let settled = initial
  let tail: Text | undefined
  let suffix: Text | undefined
  let content = initial
  let enabled = true
  let pending: string | undefined
  let alive = true
  let watching = false
  let unsubscribe: (() => void) | undefined
  function selected(element: Node) {
    const selection = document.getSelection()
    if (!selection || selection.isCollapsed)
      return false
    for (let i = 0; i < selection.rangeCount; i++) {
      if (selection.getRangeAt(i).intersectsNode(element))
        return true
    }
    return false
  }
  const selectedDelta = () => [...deltas.values()].some(selected)
  function watchSelection() {
    if (!watching)
      document.addEventListener('selectionchange', selectionChanged)
    watching = true
  }
  function selectionChanged() {
    if (selectedDelta())
      return
    document.removeEventListener('selectionchange', selectionChanged)
    watching = false
    suffix?.remove()
    suffix = undefined
    if (pending !== undefined) {
      controller.update(pending, undefined, enabled && !scope?.final)
      pending = undefined
    }
    controller.settleFinished()
    publish()
  }
  function publish() {
    const state = controller.getSnapshot()
    if (!state.settledContent.startsWith(settled)) {
      host.textContent = state.settledContent
      deltas.clear()
      tail = undefined
    }
    else if (state.settledContent.length > settled.length) {
      const append = state.settledContent.slice(settled.length)
      if (tail && !selected(tail)) {
        tail.appendData(append)
      }
      else {
        tail = document.createTextNode(append)
        host.insertBefore(tail, deltas.values().next().value ?? suffix ?? null)
      }
    }
    settled = state.settledContent
    const ids = new Set(state.segments.map(segment => segment.id))
    for (const [id, element] of deltas) {
      if (!ids.has(id)) {
        element.remove()
        deltas.delete(id)
      }
    }
    for (const segment of state.segments) {
      let element = deltas.get(segment.id)
      if (!element) {
        element = document.createElement('span')
        deltas.set(segment.id, element)
        element.addEventListener('animationend', () => {
          if (!alive)
            return
          const preserve = selectedDelta()
          controller.finish(segment.id, preserve)
          if (preserve)
            watchSelection()
          publish()
        })
        host.insertBefore(element, suffix ?? null)
      }
      if (element.textContent !== segment.content)
        element.textContent = segment.content
      element.className = segment.finished || scope?.final ? 'text-node-stream-final' : 'text-node-stream-delta'
    }
    if (state.segments.length && scope && !unsubscribe) {
      unsubscribe = scope.subscribe(finalChanged)
    }
    else if (!state.segments.length && unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
    }
  }
  function finalChanged() {
    if (!scope?.final)
      return
    controller.finishAll(true)
    publish()
    if (pending !== undefined) {
      const rendered = settled + [...deltas.values()].map(element => element.textContent).join('')
      suffix = document.createTextNode(pending.slice(rendered.length))
      host.appendChild(suffix)
    }
    scope.scheduleCleanup(() => {
      if (!alive)
        return
      if (selectedDelta()) {
        watchSelection()
        return
      }
      controller.settleFinished()
      publish()
    })
  }
  return {
    update(value: string, fade: boolean, persisted?: string) {
      content = value
      enabled = fade && document.visibilityState !== 'hidden'
      if (selectedDelta() && value.startsWith(settled + [...deltas.values()].map(element => element.textContent).join(''))) {
        pending = value
        if (scope?.final) {
          controller.finishAll(true)
          publish()
          const rendered = settled + [...deltas.values()].map(element => element.textContent).join('')
          const append = value.slice(rendered.length)
          if (!suffix) {
            suffix = document.createTextNode(append)
            host.appendChild(suffix)
          }
          else {
            suffix.data = append
          }
        }
        watchSelection()
        return
      }
      pending = undefined
      suffix?.remove()
      suffix = undefined
      controller.update(content, persisted, enabled && !scope?.final)
      publish()
    },
    resume() {
      alive = true
      publish()
      if (pending !== undefined)
        watchSelection()
    },
    dispose() {
      alive = false
      unsubscribe?.()
      unsubscribe = undefined
      watching = false
      document.removeEventListener('selectionchange', selectionChanged)
    },
  }
}
