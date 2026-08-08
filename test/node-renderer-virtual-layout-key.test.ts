import { describe, expect, it } from 'vitest'
import {
  buildVirtualMeasurementKey,
  buildVirtualRendererLayoutKey,
  stringifyVirtualToken,
} from '../src/components/NodeRenderer/virtualLayoutKey'

describe('virtual layout key helpers', () => {
  it('serializes virtual tokens the same way as the renderer metrics path', () => {
    expect(stringifyVirtualToken(null)).toBe('')
    expect(stringifyVirtualToken(undefined)).toBe('')
    expect(stringifyVirtualToken(false)).toBe('false')
    expect(stringifyVirtualToken(12)).toBe('12')
    expect(stringifyVirtualToken({ width: 320 })).toBe('{"width":320}')

    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(stringifyVirtualToken(circular)).toBe('[object Object]')
  })

  it('combines host and renderer layout keys without dropping empty host keys', () => {
    const layoutKey = buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      isDark: false,
      codeBlockStream: true,
    })

    expect(buildVirtualMeasurementKey(undefined, layoutKey)).toBe(`\u0000${layoutKey}`)
    expect(buildVirtualMeasurementKey('host-theme', layoutKey)).toBe(`host-theme\u0000${layoutKey}`)
    expect(buildVirtualMeasurementKey(42, layoutKey)).toBe(`42\u0000${layoutKey}`)
  })

  it('tracks renderer mode, theme, stream, and code block sizing dimensions', () => {
    const base = buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      isDark: false,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })

    expect(base).toContain('light')
    expect(base).toContain('code-rich')
    expect(base).toContain('code-stream')
    expect(base).toContain('320')
    expect(base).toContain('100%')

    expect(buildVirtualRendererLayoutKey({
      renderer: 'pre',
      isDark: false,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      isDark: true,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      isDark: false,
      codeBlockStream: false,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)
  })

  it('preserves the exact stream-diffs layout key token sequence', () => {
    const key = buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      isDark: true,
      codeBlockStream: false,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
      codeBlockProps: {
        showHeader: true,
        showCopyButton: false,
        showExpandButton: true,
        showPreviewButton: false,
        showCollapseButton: true,
        showFontSizeButtons: false,
      },
    })

    expect(key).toBe([
      'dark',
      'code-rich',
      'code-static',
      '320',
      '100%',
      'true',
      'false',
      'true',
      'false',
      'true',
      'false',
    ].join('\u0000'))
  })

  it('tracks code block chrome options that can affect layout', () => {
    const base = buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      codeBlockProps: {
        showHeader: true,
        showCopyButton: true,
      },
    })

    expect(buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      codeBlockProps: {
        showHeader: false,
        showCopyButton: true,
      },
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'stream-diffs',
      codeBlockProps: {
        showHeader: true,
        showCopyButton: false,
      },
    })).not.toBe(base)
  })
})
