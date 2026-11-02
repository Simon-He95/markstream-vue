import { useLayoutEffect } from 'octane'
import type { NodeComponentProps } from '../../types/node-component'
import * as Octane from 'octane'
import { useStreamStateRef } from '../../context/streamState'
import { useStreamingText } from '../../hooks/useStreamingText'

export function InlineCodeNode(props: NodeComponentProps<{ type: 'inline_code', code: string }>) {
  const { node, children, ctx, indexKey, fade } = props
  const content = String(node.code ?? '')
  const streamState = useStreamStateRef()?.textStreamState ?? ctx?.textStreamState
  const key = indexKey == null ? '' : String(indexKey)
  const { host, initial } = useStreamingText(content, fade ?? ctx?.fade ?? true, ctx?.final, key ? streamState?.get(key) : undefined, children == null)
  useLayoutEffect(() => {
    if (key)
      streamState?.set(key, content)
  }, [streamState, key, content])
  return <code ref={host} className={'inline-code inline text-[85%] px-1 py-0.5 rounded font-mono bg-[hsl(var(--secondary))] whitespace-normal break-words max-w-full'}>{children ?? <span>{initial}</span>}</code>
}

export default InlineCodeNode
