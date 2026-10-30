import type { Component, JSX } from 'solid-js'
import type { SolidRenderableNode, SolidRenderContext } from './components/shared/node-helpers'
import type { CodeBlockOptions, CodeBlockPreviewPayload } from './types/component-props'
import { createSignal } from 'solid-js'

export interface NodeComponentProps<TNode = SolidRenderableNode> {
  node: TNode
  context?: SolidRenderContext
  ctx?: SolidRenderContext
  showTooltips?: boolean
  codeBlockOptions?: CodeBlockOptions
  onCopy?: (payload: any) => void
  onHandleArtifactClick?: (payload: CodeBlockPreviewPayload) => void
  indexKey?: string | number
  isDark?: boolean
  customId?: string
  typewriter?: boolean | 'simple' | 'precise'
  fade?: boolean
}
export type CustomComponentMap = Record<string, Component<NodeComponentProps<any>>>
export type StreamingComponent<TNode = SolidRenderableNode> = Component<NodeComponentProps<TNode>>
export type StreamingComponentMap = Record<string, StreamingComponent<any>>
export type HtmlComponent<P = Record<string, unknown>> = Component<P & {
  children?: JSX.Element
}>
export type HtmlComponentMap = Record<string, HtmlComponent<any>>
export type CustomComponentDisplayMode = 'inline' | 'block'
export function defineStreamingComponents<T extends StreamingComponentMap>(components: T): T {
  return components
}
export function defineHtmlComponents<T extends HtmlComponentMap>(components: T): T {
  return components
}
export function withMarkstreamComponentDisplay<T extends Component<any>>(component: T, display: CustomComponentDisplayMode) {
  return Object.assign(component, { markstreamDisplay: display })
}
export function getCustomComponentDisplay(component?: Component<any> | null): CustomComponentDisplayMode | undefined {
  return (component as (Component<any> & {
    markstreamDisplay?: CustomComponentDisplayMode
  }) | undefined)?.markstreamDisplay
}
const mappings = new Map<string, CustomComponentMap>()
const [revision, setRevision] = createSignal(0)
export function setCustomComponents(mapping: CustomComponentMap): void
export function setCustomComponents(id: string, mapping: CustomComponentMap): void
export function setCustomComponents(id: string | CustomComponentMap, mapping?: CustomComponentMap) {
  mappings.set(typeof id === 'string' ? id : '', typeof id === 'string' ? { ...mapping } : { ...id })
  setRevision(value => value + 1)
}
export function getCustomNodeComponents(id?: string): CustomComponentMap {
  revision()
  return { ...mappings.get(''), ...(id ? mappings.get(id) : {}) }
}
export function removeCustomComponents(id: string) {
  mappings.delete(id)
  setRevision(value => value + 1)
}
export function clearGlobalCustomComponents() {
  mappings.delete('')
  setRevision(value => value + 1)
}
