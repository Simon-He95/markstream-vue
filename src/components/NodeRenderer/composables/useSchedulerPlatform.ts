export interface SchedulerPlatformOptions {
  isClient: boolean
}

export interface SchedulerPlatform {
  requestFrame: typeof window.requestAnimationFrame | null
  cancelFrame: typeof window.cancelAnimationFrame | null
  hasIdleCallback: boolean
  isTestEnv: boolean
}

function getNodeEnv() {
  if (typeof globalThis === 'undefined' || !('process' in globalThis))
    return undefined

  const nodeProcess = Object.getOwnPropertyDescriptor(globalThis, 'process')?.value as {
    env?: {
      NODE_ENV?: string
    }
  } | undefined

  return nodeProcess?.env
}

export function useSchedulerPlatform(
  options: SchedulerPlatformOptions,
): SchedulerPlatform {
  const requestFrame = options.isClient && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : null

  const cancelFrame = options.isClient && typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : null

  const hasIdleCallback = options.isClient
    && typeof window.requestIdleCallback === 'function'

  const processEnv = getNodeEnv()
  const isTestEnv = processEnv?.NODE_ENV === 'test'

  return {
    requestFrame,
    cancelFrame,
    hasIdleCallback,
    isTestEnv,
  }
}
