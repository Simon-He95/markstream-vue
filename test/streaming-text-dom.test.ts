import { afterEach, describe, expect, it } from 'vitest'
import { createStreamingTextDom, createStreamingTextScope } from '../packages/markstream-core/src/streaming-text-dom'

const dispose: Array<() => void> = []
afterEach(() => {
  dispose.splice(0).forEach(work => work())
  document.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})
function setup(initial = 'Hello') {
  const host = document.createElement('span')
  host.textContent = initial
  document.body.appendChild(host)
  const cleanups: Array<() => void> = []
  const scope = createStreamingTextScope(work => cleanups.push(work))
  const binding = createStreamingTextDom(host, initial, scope)
  dispose.push(binding.dispose)
  return { host, scope, binding, cleanup: () => cleanups.splice(0).forEach(work => work()) }
}
describe('shared streaming text DOM', () => {
  it('keeps word identities through dense arrivals and stops all fade on final', () => {
    const { host, scope, binding, cleanup } = setup()
    const initialText = host.firstChild
    binding.update('Hello one tw', true)
    const words = [...host.querySelectorAll('.text-node-stream-delta')]
    binding.update('Hello one two three four five six', true)
    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(6)
    expect(host.querySelectorAll('.text-node-stream-delta')[1]).toBe(words[1])
    scope.setFinal(true)
    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(0)
    binding.update('Hello one two three four five six END', true)
    cleanup()
    expect(host.textContent).toBe('Hello one two three four five six END')
    expect(host.firstChild).toBe(initialText)
  })
  it('preserves selection in a fading word while immediately revealing the final suffix', () => {
    const { host, scope, binding, cleanup } = setup()
    binding.update('Hello world', true)
    const delta = host.querySelector('.text-node-stream-delta')!
    const text = delta.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    selection.addRange(range)
    binding.update('Hello world, final tail', true)
    scope.setFinal(true)
    cleanup()
    expect(selection.toString()).toBe('world')
    expect(host.textContent).toBe('Hello world, final tail')
    expect(host.querySelector('.text-node-stream-delta')).toBeNull()
    selection.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    expect(host.textContent).toBe('Hello world, final tail')
    expect(host.querySelector('.text-node-stream-final')).toBeNull()
  })
  it('preserves the framework-owned initial span across replacement and further appends', () => {
    const host = document.createElement('span')
    host.innerHTML = '<span>before</span>'
    document.body.appendChild(host)
    const initial = host.firstChild
    const binding = createStreamingTextDom(host, 'before')
    dispose.push(binding.dispose)
    binding.update('replacement', true)
    expect(host.firstChild).toBe(initial)
    binding.update('replacement tail', true)
    host.querySelector('.text-node-stream-delta')!.dispatchEvent(new Event('animationend'))
    expect(host.firstChild).toBe(initial)
    expect(initial?.textContent).toBe('replacement')
    expect(host.textContent).toBe('replacement tail')
  })

  it('finishes one nested block independently and inherits parent completion', () => {
    const cleanups: Array<() => void> = []
    const parent = createStreamingTextScope(work => cleanups.push(work))
    const first = createStreamingTextScope(work => work(), parent)
    const second = createStreamingTextScope(work => work(), parent)
    const hosts = [first, second].map((scope) => {
      const host = document.createElement('span')
      host.textContent = 'Hello'
      document.body.appendChild(host)
      const binding = createStreamingTextDom(host, 'Hello', scope)
      dispose.push(binding.dispose)
      binding.update('Hello world', true)
      return host
    })
    first.setFinal(true)
    expect(hosts[0].querySelector('.text-node-stream-delta')).toBeNull()
    expect(hosts[1].querySelector('.text-node-stream-delta')).not.toBeNull()
    parent.setFinal(true)
    expect(hosts[1].querySelector('.text-node-stream-delta')).toBeNull()
    parent.setFinal(false)
    expect(first.final).toBe(true)
    expect(second.final).toBe(false)
    cleanups.forEach(work => work())
    expect(hosts.map(host => host.textContent)).toEqual(['Hello world', 'Hello world'])
  })

  it('retains finished-word identity on continuation and resumes after effect replay', () => {
    const { host, binding } = setup()
    binding.update('Hello wor', true)
    host.querySelector('span')!.dispatchEvent(new Event('animationend'))
    binding.dispose()
    binding.resume()
    binding.update('Hello world next', true)
    expect(host.textContent).toBe('Hello world next')
    expect([...host.querySelectorAll('.text-node-stream-delta')].map(el => el.textContent)).toEqual(['next'])
  })
})
