import type { NodeRendererCodeRenderer, NodeRendererProps } from '../../types/node-renderer-props'

export interface VirtualRendererLayoutKeyOptions {
  renderer: NodeRendererCodeRenderer
  isDark?: boolean
  codeBlockStream?: boolean
  codeBlockMinWidth?: NodeRendererProps['codeBlockMinWidth']
  codeBlockMaxWidth?: NodeRendererProps['codeBlockMaxWidth']
  codeBlockProps?: NodeRendererProps['codeBlockProps']
}

export function stringifyVirtualToken(value: unknown) {
  if (value == null)
    return ''

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

export function buildVirtualRendererLayoutKey(options: VirtualRendererLayoutKeyOptions) {
  const renderer = options.renderer
  const codeProps = options.codeBlockProps as Record<string, unknown> | undefined

  return [
    options.isDark ? 'dark' : 'light',
    renderer === 'stream-diffs'
      ? 'code-rich'
      : 'code-pre',
    options.codeBlockStream === false ? 'code-static' : 'code-stream',
    stringifyVirtualToken(options.codeBlockMinWidth),
    stringifyVirtualToken(options.codeBlockMaxWidth),
    stringifyVirtualToken(codeProps?.showHeader),
    stringifyVirtualToken(codeProps?.showCopyButton),
    stringifyVirtualToken(codeProps?.showExpandButton),
    stringifyVirtualToken(codeProps?.showPreviewButton),
    stringifyVirtualToken(codeProps?.showCollapseButton),
    stringifyVirtualToken(codeProps?.showFontSizeButtons),
  ].join('\u0000')
}

export function buildVirtualMeasurementKey(
  hostMeasurementKey: string | number | null | undefined,
  rendererLayoutKey: string,
) {
  return [
    hostMeasurementKey == null ? '' : String(hostMeasurementKey),
    rendererLayoutKey,
  ].join('\u0000')
}
