import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

let tooltipEl: HTMLDivElement | null = null
let currentAnchor: HTMLElement | null = null
let cleanupAutoUpdate: (() => void) | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let currentId: string | null = null
let visible = false
let requestId = 0

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function ensureTooltipEl() {
  if (tooltipEl || typeof document === 'undefined')
    return tooltipEl
  tooltipEl = document.createElement('div')
  tooltipEl.className = 'markstream-react ms-tooltip'
  tooltipEl.setAttribute('role', 'tooltip')
  tooltipEl.dataset.visible = 'false'
  tooltipEl.style.position = 'fixed'
  tooltipEl.style.left = '0px'
  tooltipEl.style.top = '0px'
  tooltipEl.style.transform = 'translate3d(0,0,0)'
  document.body.appendChild(tooltipEl)
  return tooltipEl
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

function isCurrentRequest(anchor: HTMLElement, request: number) {
  if (request !== requestId || anchor !== currentAnchor)
    return false
  if (!anchor.isConnected) {
    hideTooltip(true, anchor)
    return false
  }
  return true
}

async function updatePosition(anchor: HTMLElement, placement: TooltipPlacement, request: number) {
  const el = tooltipEl
  if (!el || !isCurrentRequest(anchor, request))
    return false
  const { x, y } = await computePosition(anchor, el, {
    placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    strategy: 'fixed',
  })
  if (!isCurrentRequest(anchor, request))
    return false
  el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  return true
}

export function showTooltipForAnchor(
  anchor: HTMLElement | null,
  content: string,
  placement: TooltipPlacement = 'top',
  immediate = false,
  _origin?: { x: number, y: number } | undefined,
  isDark?: boolean | null,
) {
  if (!anchor?.isConnected || typeof document === 'undefined')
    return
  ensureTooltipEl()
  if (!tooltipEl)
    return
  hideTooltip(true)
  currentAnchor = anchor
  const request = requestId
  const doShow = async () => {
    if (!tooltipEl || !isCurrentRequest(anchor, request))
      return
    tooltipEl.textContent = content
    tooltipEl.dataset.placement = placement
    tooltipEl.dataset.dark = detectDarkModeHint(isDark) ? 'true' : 'false'
    tooltipEl.dataset.visible = 'false'
    currentId = `tooltip-${Date.now()}-${Math.random().toString(36).slice(2)}`
    tooltipEl.id = currentId
    try {
      anchor.setAttribute('aria-describedby', currentId)
    }
    catch {}
    if (!await updatePosition(anchor, placement, request) || !isCurrentRequest(anchor, request))
      return
    tooltipEl.dataset.visible = 'true'
    visible = true
    cleanupAutoUpdate = autoUpdate(anchor, tooltipEl!, () => {
      void updatePosition(anchor, placement, request)
    })
  }
  if (immediate)
    void doShow()
  else
    showTimer = setTimeout(doShow, 80)
}

export function hideTooltip(immediate = false, anchor?: HTMLElement | null) {
  if (anchor !== undefined && anchor !== currentAnchor)
    return
  // Invalidate pending positioning immediately, including during the hide delay.
  requestId += 1
  clearTimers()
  if (!tooltipEl)
    return
  const doHide = () => {
    if (!tooltipEl)
      return
    tooltipEl.dataset.visible = 'false'
    visible = false
    if (currentAnchor && currentId && currentAnchor.getAttribute('aria-describedby') === currentId) {
      try {
        currentAnchor.removeAttribute('aria-describedby')
      }
      catch {}
    }
    currentAnchor = null
    currentId = null
    if (cleanupAutoUpdate) {
      cleanupAutoUpdate()
      cleanupAutoUpdate = null
    }
  }
  if (immediate)
    doHide()
  else
    hideTimer = setTimeout(doHide, 120)
}

export function isTooltipVisible() {
  return visible
}
