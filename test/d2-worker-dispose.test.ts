import { disposeOwnedD2Instance } from 'markstream-core'
import { describe, expect, it, vi } from 'vitest'

describe('disposeOwnedD2Instance', () => {
  it('terminates an already assigned worker once', () => {
    const terminate = vi.fn()
    const instance = { worker: { terminate } }

    disposeOwnedD2Instance(instance)
    disposeOwnedD2Instance(instance)

    expect(terminate).toHaveBeenCalledOnce()
  })

  it.each(['resolves', 'rejects'])('terminates a worker assigned while initialization %s', async (result) => {
    const terminate = vi.fn()
    let finishInit: (() => void) | undefined
    const instance: { worker?: { terminate: () => void }, ready: Promise<void> } = {
      ready: new Promise<void>((resolve, reject) => {
        finishInit = () => {
          instance.worker = { terminate }
          if (result === 'rejects')
            reject(new Error('D2 initialization failed'))
          else
            resolve()
        }
      }),
    }

    disposeOwnedD2Instance(instance)
    expect(terminate).not.toHaveBeenCalled()

    finishInit?.()
    await Promise.resolve()

    expect(terminate).toHaveBeenCalledOnce()
  })

  it('does nothing without an owned instance', () => {
    expect(() => disposeOwnedD2Instance(null)).not.toThrow()
    expect(() => disposeOwnedD2Instance(undefined)).not.toThrow()
  })

  it('does not let a failing terminate abort cleanup', () => {
    const instance = {
      worker: {
        terminate: () => {
          throw new Error('worker already gone')
        },
      },
    }

    expect(() => disposeOwnedD2Instance(instance)).not.toThrow()
  })
})
