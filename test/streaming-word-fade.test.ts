import { describe, expect, it } from 'vitest'
import { createStreamingTextFade } from '../packages/markstream-core/src/streaming-text-fade'

function content(controller: ReturnType<typeof createStreamingTextFade>) {
  const state = controller.getSnapshot()
  return state.settledContent + state.segments.map(segment => segment.content).join('')
}

describe('streaming word fade', () => {
  it('gives new words their own animation identity after four active words', () => {
    const controller = createStreamingTextFade('base ')
    for (let index = 1; index <= 20; index++)
      controller.update(`base ${Array.from({ length: index }, (_, i) => `word${i} `).join('')}`, undefined, true)
    const segments = controller.getSnapshot().segments
    expect(segments).toHaveLength(20)
    expect(new Set(segments.map(segment => segment.id)).size).toBe(20)
    expect(segments.map(segment => segment.content)).toEqual(Array.from({ length: 20 }, (_, i) => `word${i} `))
  })

  it('keeps a growing word stable and starts the following word independently', () => {
    const controller = createStreamingTextFade('base ')
    controller.update('base hel', undefined, true)
    const first = controller.getSnapshot().segments[0]
    controller.update('base hello, world!', undefined, true)
    const segments = controller.getSnapshot().segments
    expect(segments.map(segment => segment.content)).toEqual(['hello, ', 'world!'])
    expect(segments[0]).toMatchObject({ id: first.id, startedAt: first.startedAt })
    expect(segments[1].id).not.toBe(first.id)
  })

  it('segments CJK words and attaches punctuation without losing emoji or combining marks', () => {
    const controller = createStreamingTextFade('base ')
    const suffix = '中文测试，hello 👨‍👩‍👧‍👦 cafe\u0301！'
    controller.update(`base ${suffix}`, undefined, true)
    expect(controller.getSnapshot().segments.map(segment => segment.content)).toEqual(['中文', '测试，', 'hello 👨‍👩‍👧‍👦 ', 'cafe\u0301！'])
    expect(content(controller)).toBe(`base ${suffix}`)
  })

  it('does not replay a settled partial word and reclaims completed prefixes in order', () => {
    const controller = createStreamingTextFade('base ')
    controller.update('base hel', undefined, true)
    controller.finish(controller.getSnapshot().segments[0].id)
    controller.update('base hello world again', undefined, true)
    expect(controller.getSnapshot().settledContent).toBe('base hello ')
    const segments = controller.getSnapshot().segments
    expect(segments.map(segment => segment.content)).toEqual(['world ', 'again'])
    controller.finish(segments[1].id)
    expect(controller.getSnapshot().segments).toHaveLength(2)
    controller.finish(segments[0].id)
    expect(controller.getSnapshot().segments).toHaveLength(0)
    expect(content(controller)).toBe('base hello world again')
  })

  it('coalesces only newly arrived words for a large single chunk', () => {
    const controller = createStreamingTextFade('base ')
    controller.update('base existing ', undefined, true)
    const first = controller.getSnapshot().segments[0]
    const next = `base existing ${'word '.repeat(10000)}tail`
    controller.update(next, undefined, true)
    const segments = controller.getSnapshot().segments
    expect(segments[0]).toEqual(first)
    expect(segments.length).toBeLessThanOrEqual(65)
    expect(segments.at(-1)?.content).toBe('tail')
    expect(content(controller)).toBe(next)
  })

  it('defers bulk completion without replaying a word continued before cleanup', () => {
    const controller = createStreamingTextFade('base ')
    controller.update('base hello wor', undefined, true)
    controller.update('base hello world', undefined, true)
    controller.finishAll(true)
    expect(controller.getSnapshot().segments.every(segment => segment.finished)).toBe(true)
    controller.update('base hello worlds again', undefined, true)
    controller.settleFinished()
    expect(controller.getSnapshot().settledContent).toBe('base hello worlds ')
    expect(controller.getSnapshot().segments.map(segment => segment.content)).toEqual(['again'])
    controller.finishAll()
    expect(content(controller)).toBe('base hello worlds again')
    expect(controller.getSnapshot().segments).toHaveLength(0)
  })

  it('resets word identity on replacement or disabled fade', () => {
    const controller = createStreamingTextFade('base ')
    controller.update('base hello', undefined, true)
    controller.update('replacement ', undefined, true)
    controller.update('replacement word', undefined, false)
    expect(controller.getSnapshot().segments).toHaveLength(0)
    controller.update('replacement word next', undefined, true)
    expect(content(controller)).toBe('replacement word next')
    expect(controller.getSnapshot().segments.map(segment => segment.content)).toEqual(['next'])
  })
})
