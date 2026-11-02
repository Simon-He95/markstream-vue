import { useLayoutEffect } from 'octane'
import type { NodeComponentProps } from '../../types/node-component'
import * as Octane from 'octane'
import { useStreamStateRef } from '../../context/streamState'
import { useStreamingText } from '../../hooks/useStreamingText'

export function TextNode(props: NodeComponentProps<{ type: 'text', content: string, center?: boolean }>) {
  const { node, children, ctx, indexKey, fade } = props
  const content = String(node.content ?? '')
  const streamState = useStreamStateRef()?.textStreamState ?? ctx?.textStreamState
  const key = indexKey == null ? '' : String(indexKey)
  const { host, initial } = useStreamingText(content, fade ?? ctx?.fade ?? true, ctx?.final, key ? streamState?.get(key) : undefined, children == null)
  useLayoutEffect(() => {
    if (key)
      streamState?.set(key, content)
  }, [streamState, key, content])
  return <span ref={host} className={'text-node whitespace-pre-wrap break-words' + (node.center ? ' text-node-center' : '')}>{children ?? <span>{initial}</span>}</span>
}

export default TextNode
