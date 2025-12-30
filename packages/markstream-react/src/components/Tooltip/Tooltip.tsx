import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  visible: boolean
  anchorEl: HTMLElement | null
  content: string
  placement?: TooltipPlacement
  offset?: number
  originX?: number | null
  originY?: number | null
  id?: string | null
  isDark?: boolean | null
}

function detectDarkModeHint(hint?: boolean | null) {
  if (typeof hint === 'boolean')
    return hint
  if (typeof document !== 'undefined') {
    try {
      if (document.documentElement.classList.contains('dark'))
        return true
    }
    catch {}
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    catch {}
  }
  return false
}

export function Tooltip(props: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({ transform: 'translate3d(0px, 0px, 0px)', left: '0px', top: '0px' })

  const isDarkEffective = useMemo(() => detectDarkModeHint(props.isDark), [props.isDark])

  useEffect(() => {
    if (!props.visible) {
      setReady(false)
      return
    }
    if (!props.anchorEl || !tooltipRef.current) {
      setReady(true)
      return
    }
    let cleanup: (() => void) | null = null
    let cancelled = false

    const update = async () => {
      if (!props.anchorEl || !tooltipRef.current)
        return
      const { x, y } = await computePosition(props.anchorEl, tooltipRef.current, {
        placement: props.placement ?? 'top',
        middleware: [offset(props.offset ?? 8), flip(), shift({ padding: 8 })],
        strategy: 'fixed',
      })
      if (cancelled)
        return
      setStyle({
        position: 'fixed',
        left: '0px',
        top: '0px',
        transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
      })
    }

    void update().then(() => {
      if (!cancelled)
        setReady(true)
    })

    cleanup = autoUpdate(props.anchorEl, tooltipRef.current, update)
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [props.anchorEl, props.offset, props.placement, props.visible])

  if (typeof document === 'undefined')
    return null

  if (!props.visible || !ready)
    return null

  return createPortal(
    <div
      id={props.id ?? undefined}
      ref={tooltipRef}
      style={style}
      className={[
        'ms-tooltip z-[9999] inline-block text-base py-2 px-3 rounded-md shadow-md whitespace-nowrap pointer-events-none border tooltip-element',
        isDarkEffective ? 'bg-gray-900 text-white border-gray-700 is-dark' : 'bg-white text-gray-900 border-gray-200',
      ].join(' ')}
      role="tooltip"
    >
      {props.content}
    </div>,
    document.body,
  )
}

export default Tooltip
