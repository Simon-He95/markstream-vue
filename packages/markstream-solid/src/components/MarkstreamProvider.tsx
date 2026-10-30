import type { JSX } from 'solid-js'
import type { MarkstreamSolidOptions } from '../configuration'
import { MarkstreamConfigContext } from '../configuration'

export function MarkstreamProvider(props: MarkstreamSolidOptions & {
  children?: JSX.Element
}): JSX.Element {
  return <MarkstreamConfigContext.Provider value={() => props}>{props.children}</MarkstreamConfigContext.Provider>
}
