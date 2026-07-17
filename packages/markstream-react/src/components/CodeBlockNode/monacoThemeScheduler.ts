type MonacoTheme = any
type SetThemeFn = (theme: MonacoTheme, force?: boolean) => Promise<void> | void

interface ThemeQueue {
  inFlight: Promise<void> | null
  inFlightKey: string | null
  pendingTheme: MonacoTheme | null
  pendingKey: string | null
  lastAppliedKey: string | null
}

const queues = new WeakMap<SetThemeFn, ThemeQueue>()

const themeKeyCache = new WeakMap<object, string>()
let themeKeySeq = 0

function themeKey(theme: MonacoTheme): string | null {
  if (theme == null)
    return null
  if (typeof theme === 'string')
    return theme
  if (typeof theme === 'object' && theme && 'name' in theme)
    return String((theme as any).name)
  if (typeof theme === 'object') {
    const cached = themeKeyCache.get(theme)
    if (cached)
      return cached
    try {
      const str = JSON.stringify(theme)
      if (str) {
        themeKeyCache.set(theme, str)
        return str
      }
    }
    catch {}
    const id = `__theme_${++themeKeySeq}`
    themeKeyCache.set(theme, id)
    return id
  }
  return String(theme)
}

export function scheduleMonacoThemeUpdate(theme: MonacoTheme, setTheme: SetThemeFn): Promise<void> {
  const key = themeKey(theme)
  if (!key)
    return Promise.resolve()

  let queue = queues.get(setTheme)
  if (!queue) {
    queue = {
      inFlight: null,
      inFlightKey: null,
      pendingTheme: null,
      pendingKey: null,
      lastAppliedKey: null,
    }
    queues.set(setTheme, queue)
  }

  if (!queue.inFlight && queue.lastAppliedKey === key)
    return Promise.resolve()

  if (queue.inFlight && (queue.pendingKey === key || queue.inFlightKey === key))
    return queue.inFlight

  queue.pendingTheme = theme
  queue.pendingKey = key

  if (queue.inFlight)
    return queue.inFlight

  queue.inFlight = (async () => {
    while (queue.pendingTheme != null && queue.pendingKey != null) {
      const nextTheme = queue.pendingTheme
      const nextKey = queue.pendingKey
      queue.pendingTheme = null
      queue.pendingKey = null
      if (queue.lastAppliedKey === nextKey)
        continue
      try {
        queue.inFlightKey = nextKey
        await Promise.resolve(setTheme(nextTheme))
        queue.lastAppliedKey = nextKey
      }
      catch {}
    }
  })().finally(() => {
    queue.inFlight = null
    queue.inFlightKey = null
  })

  return queue.inFlight
}
