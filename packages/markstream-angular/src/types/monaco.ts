export interface CodeBlockThemeObject {
  name: string
  base?: string
  inherit?: boolean
  colors?: Record<string, string>
  rules?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type CodeBlockTheme = string | CodeBlockThemeObject

export interface CodeBlockDiffHideUnchangedRegionsOptions {
  enabled?: boolean
  contextLineCount?: number
  minimumLineCount?: number
  revealLineCount?: number
}

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | CodeBlockDiffHideUnchangedRegionsOptions

export type CodeBlockDiffLineStyle = 'background' | 'bar'

export type CodeBlockDiffAppearance = 'auto' | 'light' | 'dark'

export type CodeBlockDiffUnchangedRegionStyle = 'line-info' | 'line-info-basic' | 'metadata' | 'simple'

export type CodeBlockDiffHunkActionKind = 'revert' | 'stage'

export type CodeBlockDiffHunkSide = 'upper' | 'lower'

export interface CodeBlockDiffHunkActionContext {
  action: CodeBlockDiffHunkActionKind
  side: CodeBlockDiffHunkSide
  lineChange: unknown
  originalModel: unknown
  modifiedModel: unknown
}
