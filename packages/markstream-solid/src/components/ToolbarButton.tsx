import type { JSX } from 'solid-js'
import { createEffect, onCleanup } from 'solid-js'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'

export function ToolbarButton(props: {
  label: string
  children?: JSX.Element
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  menu?: boolean
  hasPopup?: boolean
  showTooltips?: boolean
  isDark?: boolean
}): JSX.Element {
  onCleanup(() => hideTooltip(true))
  createEffect(() => {
    if (props.showTooltips === false)
      hideTooltip(true)
  })
  const hover: JSX.EventHandler<HTMLButtonElement, MouseEvent | FocusEvent> = (event) => {
    if (props.showTooltips !== false)
      showTooltipForAnchor(event.currentTarget, props.label, 'top', false, undefined, props.isDark)
  }
  return (
    <button
      type="button"
      role={props.menu ? 'menuitem' : undefined}
      class="code-action-btn"
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      aria-haspopup={props.hasPopup ? 'menu' : undefined}
      disabled={props.disabled}
      onClick={(event) => {
        hideTooltip(true)
        props.onClick?.(event)
      }}
      onMouseEnter={hover}
      onFocus={hover}
      onMouseLeave={() => hideTooltip()}
      onBlur={() => hideTooltip()}
    >
      {props.children ?? props.label}
    </button>
  )
}
