import type React from 'react'
import type { RenderContext, RenderNodeFn } from '../types'

export interface NodeComponentProps<TNode = unknown> {
  node: TNode
  ctx?: RenderContext
  renderNode?: RenderNodeFn
  indexKey?: React.Key
  customId?: string
  isDark?: boolean
  typewriter?: boolean
  children?: React.ReactNode
}
