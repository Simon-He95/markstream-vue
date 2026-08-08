/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  normalizeRendererMode,
  RENDERER_MODE_DEFAULTS,
  resolveNodeRendererCodeRenderer,
} from '../src/components/NodeRenderer/rendererModeDefaults'

describe('rendererModeDefaults', () => {
  it('normalizes unknown modes to docs', () => {
    expect(normalizeRendererMode('docs')).toBe('docs')
    expect(normalizeRendererMode('chat')).toBe('chat')
    expect(normalizeRendererMode('minimal')).toBe('minimal')
    expect(normalizeRendererMode('unknown')).toBe('docs')
    expect(normalizeRendererMode(undefined)).toBe('docs')
  })

  it('keeps docs and chat/minimal defaults distinct', () => {
    expect(RENDERER_MODE_DEFAULTS.docs).toMatchObject({
      showTooltips: true,
      fade: true,
      initialRenderBatchSize: 40,
      renderBatchSize: 80,
      maxLiveNodes: 220,
    })
    expect(RENDERER_MODE_DEFAULTS.chat).toMatchObject({
      showTooltips: false,
      fade: false,
      initialRenderBatchSize: 32,
      renderBatchSize: 48,
      maxLiveNodes: 0,
      liveNodeBuffer: 0,
    })
    expect(RENDERER_MODE_DEFAULTS.minimal).toMatchObject(RENDERER_MODE_DEFAULTS.chat)
  })

  it('resolves code renderer defaults and legacy pre flag precedence', () => {
    expect(resolveNodeRendererCodeRenderer({
      mode: 'docs',
      codeRenderer: undefined,
      renderCodeBlocksAsPre: undefined,
    })).toBe('stream-diffs')
    expect(resolveNodeRendererCodeRenderer({
      mode: 'chat',
      codeRenderer: undefined,
      renderCodeBlocksAsPre: undefined,
    })).toBe('pre')
    expect(resolveNodeRendererCodeRenderer({
      mode: 'chat',
      codeRenderer: 'stream-diffs',
      renderCodeBlocksAsPre: false,
    })).toBe('stream-diffs')
    expect(resolveNodeRendererCodeRenderer({
      mode: 'docs',
      codeRenderer: 'stream-diffs',
      renderCodeBlocksAsPre: true,
    })).toBe('pre')
    expect(resolveNodeRendererCodeRenderer({
      mode: 'chat',
      codeRenderer: undefined,
      renderCodeBlocksAsPre: false,
    })).toBe('stream-diffs')
  })
})
