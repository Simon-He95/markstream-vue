import { createApp, h, ref } from 'vue'

const visible = ref(false)
const content = ref('')
const placement = ref<'top' | 'bottom' | 'left' | 'right'>('top')
const anchorEl = ref<HTMLElement | null>(null)
const tooltipId = ref<string | null>(null)
const originX = ref<number | null>(null)
const originY = ref<number | null>(null)
const tooltipIsDark = ref<boolean | null>(null)

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

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

// Mount singleton Tooltip once
let mounted = false
let mountPromise: Promise<void> | null = null
function ensureMounted() {
  if (mounted)
    return
  if (typeof document === 'undefined')
    return
  if (mountPromise)
    return

  mountPromise = import('../components/Tooltip/Tooltip.vue')
    .then(({ default: Tooltip }) => {
      mounted = true
      const container = document.createElement('div')
      container.setAttribute('data-singleton-tooltip', '1')
      document.body.appendChild(container)

      const App = {
        setup() {
          return () => h(Tooltip as any, {
            'visible': visible.value,
            'anchor-el': anchorEl.value,
            'content': content.value,
            'placement': placement.value,
            'id': tooltipId.value,
            'originX': originX.value,
            'originY': originY.value,
            'isDark': tooltipIsDark.value ?? undefined,
          })
        },
      }

      createApp(App).mount(container)
    })
    .catch((err) => {
      mountPromise = null
      mounted = false
      console.warn('[markstream-vue] Failed to load Tooltip component. Tooltips will be disabled.', err)
    })
}

export function showTooltipForAnchor(
  el: HTMLElement | null,
  text: string,
  place: typeof placement.value = 'top',
  immediate = false,
  origin?: { x: number, y: number } | undefined,
  isDark?: boolean | null,
) {
  if (!el)
    return
  ensureMounted()
  clearTimers()
  const doShow = () => {
    tooltipId.value = `tooltip-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    anchorEl.value = el
    content.value = text
    placement.value = place
    // expose origin coordinates for initial animation
    originX.value = origin?.x ?? null
    originY.value = origin?.y ?? null
    // allow caller to hint dark mode; if omitted, remain null (tooltip will detect global)
    tooltipIsDark.value = typeof isDark === 'boolean' ? isDark : null
    visible.value = true
    try {
      el.setAttribute('aria-describedby', tooltipId.value!)
    }
    catch {}
  }
  if (immediate)
    doShow()
  else showTimer = setTimeout(doShow, 80)
}

export function hideTooltip(immediate = false) {
  clearTimers()
  const doHide = () => {
    if (anchorEl.value && tooltipId.value) {
      try {
        anchorEl.value.removeAttribute('aria-describedby')
      }
      catch {}
    }
    visible.value = false
    anchorEl.value = null
    tooltipId.value = null
    originX.value = null
    originY.value = null
  }
  if (immediate)
    doHide()
  else hideTimer = setTimeout(doHide, 120)
}

export default {
  showTooltipForAnchor,
  hideTooltip,
}
