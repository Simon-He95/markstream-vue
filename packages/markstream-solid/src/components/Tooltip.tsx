import type { JSX } from 'solid-js'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { isServer, Portal } from 'solid-js/web'

export interface TooltipProps {
  visible: boolean
  anchorEl: HTMLElement | null
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  offset?: number
  originX?: number | null
  originY?: number | null
  id?: string | null
  isDark?: boolean | null
}
export function Tooltip(props: TooltipProps): JSX.Element {
  const [element, setElement] = createSignal<HTMLDivElement>()
  const [position, setPosition] = createSignal({ x: 0, y: 0 })
  createEffect(() => {
    const anchor = props.anchorEl
    const tooltip = element()
    const visible = props.visible
    const placement = props.placement ?? 'top'
    const gap = props.offset ?? 6
    void props.content
    if (!anchor || !tooltip || !visible)
      return
    let cancelled = false
    const update = async () => {
      const result = await computePosition(anchor, tooltip, { strategy: 'fixed', placement, middleware: [offset(gap), flip(), shift({ padding: 6 })] })
      if (!cancelled)
        setPosition(result)
    }
    const cleanup = autoUpdate(anchor, tooltip, () => void update())
    if (props.id)
      anchor.setAttribute('aria-describedby', props.id)
    onCleanup(() => {
      cancelled = true
      cleanup()
      if (props.id && anchor.getAttribute('aria-describedby') === props.id)
        anchor.removeAttribute('aria-describedby')
    })
  })
  return <Show when={!isServer && props.visible}><Portal><div ref={setElement} id={props.id ?? undefined} class="ms-tooltip" role="tooltip" data-visible="true" data-dark={props.isDark ? 'true' : 'false'} style={{ 'position': 'fixed', 'left': '0', 'top': '0', 'transform': `translate3d(${position().x}px,${position().y}px,0)`, 'transform-origin': props.originX != null && props.originY != null ? `${props.originX}px ${props.originY}px` : undefined }}>{props.content}</div></Portal></Show>
}
