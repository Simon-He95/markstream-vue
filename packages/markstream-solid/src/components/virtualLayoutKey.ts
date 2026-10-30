import type { NodeRendererProps } from '../types/node-renderer-props'

export interface VirtualRendererLayoutKeyOptions {
  renderCodeBlocksAsPre: boolean
  isDark?: boolean
  codeBlockStream?: boolean
  codeBlockMinWidth?: NodeRendererProps['codeBlockMinWidth']
  codeBlockMaxWidth?: NodeRendererProps['codeBlockMaxWidth']
  codeBlockOptions?: NodeRendererProps['codeBlockOptions']
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
  const codeProps = options.codeBlockProps as Record<string, unknown> | undefined
  const codeOptions = options.codeBlockOptions
  const parseDiffOptions = codeOptions?.parseDiffOptions

  return [
    options.isDark ? 'dark' : 'light',
    options.renderCodeBlocksAsPre ? 'code-pre' : 'code-rich',
    options.codeBlockStream === false ? 'code-static' : 'code-stream',
    stringifyVirtualToken(options.codeBlockMinWidth),
    stringifyVirtualToken(options.codeBlockMaxWidth),
    stringifyVirtualToken(codeOptions?.fontSize),
    stringifyVirtualToken(codeOptions?.lineHeight),
    stringifyVirtualToken(codeOptions?.fontFamily),
    stringifyVirtualToken(codeOptions?.maxHeight),
    stringifyVirtualToken(codeOptions?.tabSize),
    stringifyVirtualToken(codeOptions?.padding),
    stringifyVirtualToken(codeOptions?.overflow),
    stringifyVirtualToken(codeOptions?.disableLineNumbers),
    stringifyVirtualToken(codeOptions?.diffStyle),
    stringifyVirtualToken(codeOptions?.diffIndicators),
    stringifyVirtualToken(codeOptions?.hunkSeparators),
    stringifyVirtualToken(codeOptions?.expandUnchanged),
    stringifyVirtualToken(codeOptions?.collapsedContextThreshold),
    stringifyVirtualToken(codeOptions?.expansionLineCount),
    stringifyVirtualToken(parseDiffOptions?.context),
    stringifyVirtualToken(codeProps?.showHeader),
    stringifyVirtualToken(codeProps?.showCopyButton),
    stringifyVirtualToken(codeProps?.showExpandButton),
    stringifyVirtualToken(codeProps?.showPreviewButton),
    stringifyVirtualToken(codeProps?.showCollapseButton),
    stringifyVirtualToken(codeProps?.showFontSizeButtons),
    stringifyVirtualToken(codeProps?.showLineNumbers),
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
