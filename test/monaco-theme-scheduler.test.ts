import { describe, expect, it, vi } from 'vitest'

describe('monaco theme scheduler', () => {
  it('dedupes concurrent same-theme updates', async () => {
    vi.resetModules()
    const { scheduleMonacoThemeUpdate } = await import('../packages/markstream-react/src/components/CodeBlockNode/monacoThemeScheduler')

    const resolvers: Array<() => void> = []
    const setTheme = vi.fn(() => new Promise<void>(resolve => resolvers.push(resolve)))

    const p1 = scheduleMonacoThemeUpdate('vitesse-dark', setTheme)
    const p2 = scheduleMonacoThemeUpdate('vitesse-dark', setTheme)

    expect(setTheme).toHaveBeenCalledTimes(1)

    resolvers[0]?.()
    await p1
    await p2

    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('serializes theme updates to avoid parallel registrations', async () => {
    vi.resetModules()
    const { scheduleMonacoThemeUpdate } = await import('../packages/markstream-react/src/components/CodeBlockNode/monacoThemeScheduler')

    const resolvers: Array<() => void> = []
    const setTheme = vi.fn(() => new Promise<void>(resolve => resolvers.push(resolve)))

    const all = scheduleMonacoThemeUpdate('vitesse-dark', setTheme)
    scheduleMonacoThemeUpdate('vitesse-light', setTheme)

    expect(setTheme).toHaveBeenCalledTimes(1)
    resolvers[0]?.()

    await Promise.resolve()
    await Promise.resolve()

    expect(setTheme).toHaveBeenCalledTimes(2)
    resolvers[1]?.()

    await all
  })

  it('tracks each runtime theme setter independently', async () => {
    vi.resetModules()
    const { scheduleMonacoThemeUpdate } = await import('../packages/markstream-react/src/components/CodeBlockNode/monacoThemeScheduler')
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})

    await Promise.all([
      scheduleMonacoThemeUpdate('vitesse-dark', first),
      scheduleMonacoThemeUpdate('vitesse-dark', second),
    ])

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })
})
