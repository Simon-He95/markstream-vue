import type { MarkdownRenderProps, NodeRendererEvents } from '../src/index'
import MarkdownRender, {
  CodeBlockNode,
  setCustomComponents,
  useSmoothMarkdownStream,
} from '../src/index'

const props = {
  content: '# Packed types',
  final: true,
  codeBlockStream: true,
  smoothStreaming: 'auto',
  onCopy(code: string) {
    return code
  },
  onHandleArtifactClick(payload) {
    return payload.artifactType
  },
} satisfies MarkdownRenderProps & NodeRendererEvents

export function TypeConsumerExample() {
  const stream = useSmoothMarkdownStream({ minCharsPerSecond: 40, maxCharsPerSecond: 80 })
  setCustomComponents({
    thinking: nodeProps => <section data-thinking>{String(nodeProps.node.content ?? '')}</section>,
  })
  return (
    <>
      <MarkdownRender {...props} content={stream.visible()} final={stream.final()} />
      <CodeBlockNode
        node={{ type: 'code_block', language: 'typescript', code: 'const ready = true' } as any}
        stream
      />
    </>
  )
}
