import type { NodeComponentProps } from '../customComponents'
import { createStreamingTextFade } from 'markstream-core'
import { createEffect, For, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { getString } from './shared/node-helpers'

export function StreamingTextNode(props: NodeComponentProps) {
  const initial = getString(props.node.content ?? props.node.raw)
  const controller = createStreamingTextFade(initial)
  const [state, setState] = createStore(controller.getSnapshot())
  let settled!: HTMLSpanElement
  let appends!: HTMLSpanElement
  let frozen = initial
  const deltas = new Map<number, HTMLElement>()
  let queued: string | undefined
  let watched = false
  let settleAfterSelection = false
  const publish = () => setState(reconcile(controller.getSnapshot(), { key: 'id' }))
  function touches(element: Element) {
    const selection = document.getSelection?.()
    return !!selection && !!((selection.anchorNode && element.contains(selection.anchorNode)) || (selection.focusNode && element.contains(selection.focusNode)))
  }
  function selectedDelta() {
    const selection = document.getSelection?.()
    if (!selection || selection.isCollapsed)
      return false
    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index)
      if ([...deltas.values()].some(element => range.intersectsNode(element)))
        return true
    }
    return false
  }
  function stopWatching() {
    if (watched)
      document.removeEventListener('selectionchange', selectionChanged)
    watched = false
  }
  function selectionChanged() {
    if (selectedDelta())
      return
    if (settleAfterSelection) {
      controller.settleFinished()
      settleAfterSelection = false
    }
    if (queued !== undefined) {
      controller.update(queued, undefined, props.context?.fade !== false)
      queued = undefined
    }
    publish()
    stopWatching()
  }
  function watchSelection() {
    if (!watched)
      document.addEventListener('selectionchange', selectionChanged)
    watched = true
  }
  createEffect(() => {
    const value = getString(props.node.content ?? props.node.raw)
    const enabled = props.context?.fade !== false
    if (selectedDelta()) {
      queued = value
      watchSelection()
      return
    }
    controller.update(value, undefined, enabled)
    publish()
  })
  createEffect(() => {
    const value = state.settledContent
    if (!value.startsWith(frozen)) {
      settled.textContent = value
      appends.textContent = ''
    }
    else if (value.length > frozen.length) {
      appends.appendChild(document.createTextNode(value.slice(frozen.length)))
      if (appends.childNodes.length > 4 && !touches(appends)) {
        const merged = [...appends.childNodes].map(node => node.textContent ?? '').join('')
        appends.textContent = merged
      }
    }
    frozen = value
  })
  onCleanup(stopWatching)
  return (
    <span class="text-node markstream-solid-text-node" classList={{ 'markstream-solid-text--centered': !!props.node.center }} data-typewriter={props.context?.typewriter ? '1' : undefined}>
      <span ref={settled}>{initial}</span>
      <span ref={appends} />
      <For each={state.segments}>
        {(segment) => {
          onCleanup(() => deltas.delete(segment.id))
          return (
            <span
              ref={element => deltas.set(segment.id, element)}
              class="text-node-stream-delta"
              onAnimationEnd={() => {
                const selected = selectedDelta()
                controller.finish(segment.id, selected)
                if (selected) {
                  settleAfterSelection = true
                  watchSelection()
                }
                publish()
              }}
            >
              {segment.content}
            </span>
          )
        }}
      </For>
    </span>
  )
}
