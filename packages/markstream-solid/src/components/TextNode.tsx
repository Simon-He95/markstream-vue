import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { resolveStreamingTextState } from 'markstream-core'
import { createMemo } from 'solid-js'
import { getString } from '../node-helpers'

export interface TextNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  indexKey?: string | number
  typewriter?: boolean
}

export function TextNode(props: TextNodeProps) {
  let previousKey = ''
  let previousContent = ''
  let deltaClass = 'markstream-solid-text__stream-delta--a'
  const streamInfo = createMemo(() => {
    const content = getString((props.node as any)?.content ?? (props.node as any)?.raw)
    const key = `${props.context?.customId ?? 'global'}:${props.context?.streamRenderVersion ?? 0}:${props.indexKey ?? 'node'}`
    const previous = key === previousKey ? previousContent : (props.context?.textStreamState?.get(key) ?? '')
    const result = resolveStreamingTextState({ nextContent: content, previousContent: previous, typewriterEnabled: props.context?.fade !== false })
    if (result.appended)
      deltaClass = deltaClass.endsWith('--a') ? 'markstream-solid-text__stream-delta--b' : 'markstream-solid-text__stream-delta--a'
    previousKey = key
    previousContent = content
    props.context?.textStreamState?.set(key, content)
    return { stable: result.settledContent, delta: result.streamedDelta, deltaClass }
  })
  return (
    <span data-typewriter={props.context?.typewriter ? '1' : undefined} class={`markstream-solid-text-node text-node${(props.node as any)?.center ? ' markstream-solid-text--centered' : ''}`}>
      {streamInfo().stable}
      {streamInfo().delta && <span class={`markstream-solid-text__stream-delta text-node-stream-delta ${streamInfo().deltaClass}`}>{streamInfo().delta}</span>}
    </span>
  )
}
