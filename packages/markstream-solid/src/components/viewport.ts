import type { Accessor } from 'solid-js'
import type { SolidRenderContext } from './shared/node-helpers'
import { createEffect, createSignal, onCleanup, onMount, sharedConfig } from 'solid-js'
import { isServer } from 'solid-js/web'

export function useHeavyNodeVisibility(props: { context?: SolidRenderContext }, element: Accessor<Element | undefined>) {
  const [visible, setVisible] = createSignal(isServer || !!sharedConfig.context || props.context?.viewportPriority === false)
  onMount(() => {
    createEffect(() => {
      if (props.context?.viewportPriority === false || typeof IntersectionObserver === 'undefined') {
        setVisible(true)
        return
      }
      if (visible())
        return
      const target = element()
      if (!target)
        return
      const observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      }, { rootMargin: props.context?.viewportPriorityOptions?.heavyBlockMargin ?? props.context?.viewportPriorityOptions?.rootMargin ?? '400px' })
      observer.observe(target)
      onCleanup(() => observer.disconnect())
    })
  })
  return visible
}
