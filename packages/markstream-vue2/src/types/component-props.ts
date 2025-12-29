// Centralized exported props interfaces for components

export interface CodeBlockNodeProps {
  node: {
    type: 'code_block'
    language: string
    code: string
    raw: string
    diff?: boolean
    originalCode?: string
    updatedCode?: string
  }
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  darkTheme?: any
  lightTheme?: any
  isShowPreview?: boolean
  monacoOptions?: { [k: string]: any }
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: any[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showFontSizeButtons?: boolean
  customId?: string
}

export interface ImageNodeProps {
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  fallbackSrc?: string
  showCaption?: boolean
  lazy?: boolean
  svgMinHeight?: string
  usePlaceholder?: boolean
}

export interface LinkNodeProps {
  node: {
    type: 'link'
    href: string
    title: string | null
    text: string
    children: { type: string, raw: string }[]
    raw: string
    loading?: boolean
  }
  indexKey: number | string
  customId?: string
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

export interface PreCodeNodeProps {
  node: any
}

export interface MermaidBlockNodeProps {
  node: any
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  workerTimeoutMs?: number
  parseTimeoutMs?: number
  renderTimeoutMs?: number
  fullRenderTimeoutMs?: number
  // header customization
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  // When false, relax all sanitization/security (not recommended)
  isStrict?: boolean
}

// Generic event wrapper used by MermaidBlockNode emits. Consumers can call
// `preventDefault()` to stop the component's default action.
export interface MermaidBlockEvent<TPayload = any> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault: () => void
  // optional: direct access to the rendered SVG element (if available)
  svgElement?: SVGElement | null
  // optional: serialized SVG string (may be absent to avoid extra work)
  svgString?: string | null
}

export interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
}

export interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
  }
}
