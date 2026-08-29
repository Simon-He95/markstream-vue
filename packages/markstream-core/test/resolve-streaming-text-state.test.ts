import { describe, expect, it } from 'vitest'
import { resolveStreamingTextState, resolveStreamingTextUpdate } from '../src/resolve-streaming-text-state'

describe('resolveStreamingTextState', () => {
  it('returns full content when typewriter is disabled', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello world',
      previousContent: 'hello',
      typewriterEnabled: false,
    })
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '',
      appended: false,
    })
  })

  it('returns settled when content is unchanged', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello',
      previousContent: 'hello',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: '',
      appended: false,
    })
  })

  it('detects appended content and creates delta', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello world',
      previousContent: 'hello',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: ' world',
      appended: true,
    })
  })

  it('does not create delta when content is shorter', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello',
      previousContent: 'hello world',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: '',
      appended: false,
    })
  })

  it('does not create delta when content does not start with previous', () => {
    const result = resolveStreamingTextState({
      nextContent: 'world hello',
      previousContent: 'hello',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'world hello',
      streamedDelta: '',
      appended: false,
    })
  })

  it('does not create delta when previous is empty', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello',
      previousContent: '',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: '',
      appended: false,
    })
  })

  it('handles same-length content that starts with previous', () => {
    const result = resolveStreamingTextState({
      nextContent: 'hello',
      previousContent: 'hello',
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: '',
      appended: false,
    })
  })
})

describe('resolveStreamingTextUpdate', () => {
  it('returns full content when typewriter is disabled', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world',
      currentState: { settledContent: 'hello', streamedDelta: '' },
      typewriterEnabled: false,
    })
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '',
      appended: false,
    })
  })

  it('preserves active delta when rendered content matches and version unchanged', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world',
      currentState: { settledContent: 'hello', streamedDelta: ' world' },
      typewriterEnabled: true,
      streamRenderVersionChanged: false,
    })
    expect(result).toEqual({
      settledContent: 'hello',
      streamedDelta: ' world',
      appended: false,
    })
  })

  it('settles delta when stream render version changed', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world',
      currentState: { settledContent: 'hello', streamedDelta: ' world' },
      typewriterEnabled: true,
      streamRenderVersionChanged: true,
    })
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '',
      appended: false,
    })
  })

  it('falls through to basic resolver when content differs', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world!',
      currentState: { settledContent: 'hello', streamedDelta: ' world' },
      typewriterEnabled: true,
    })
    // renderedContent = "hello world", nextContent = "hello world!"
    // starts with previous, so delta = "!"
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '!',
      appended: true,
    })
  })

  it('uses persistedContent when provided', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world!',
      persistedContent: 'hello world',
      currentState: { settledContent: 'hello', streamedDelta: '' },
      typewriterEnabled: true,
    })
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '!',
      appended: true,
    })
  })

  it('falls back to renderedContent when persistedContent is undefined', () => {
    const result = resolveStreamingTextUpdate({
      nextContent: 'hello world!',
      currentState: { settledContent: 'hello', streamedDelta: ' world' },
      typewriterEnabled: true,
    })
    // renderedContent = "hello world", nextContent = "hello world!"
    expect(result).toEqual({
      settledContent: 'hello world',
      streamedDelta: '!',
      appended: true,
    })
  })
})
