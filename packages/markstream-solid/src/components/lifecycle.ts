import type { Accessor } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { MarkstreamNodeLifecycle } from '../types/node-renderer-props'
import { createContext, createEffect, onCleanup, useContext } from 'solid-js'

export const NodeLifecycleContext = createContext<MarkstreamNodeLifecycle>()

export function useNodeLifecycle(props: Pick<NodeComponentProps, 'indexKey'>, pending: Accessor<boolean>, element: Accessor<HTMLElement | undefined>) {
  const lifecycle = useContext(NodeLifecycleContext)
  createEffect(() => {
    const key = props.indexKey
    if (key == null || !lifecycle)
      return
    if (pending()) {
      lifecycle.markPending(key)
    }
    else {
      lifecycle.markSettled(key)
      const root = element()
      if (root)
        lifecycle.reportHeight(key, root.getBoundingClientRect().height)
    }
    onCleanup(() => lifecycle.markSettled(key))
  })
}

export function useMarkstreamNodeLifecycle() {
  return useContext(NodeLifecycleContext) ?? null
}
