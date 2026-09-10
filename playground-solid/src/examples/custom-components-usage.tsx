import { NodeRenderer, setCustomComponents } from 'markstream-solid'
import { ThinkingNode } from '../components/ThinkingNode'
import { PLAYGROUND_CUSTOM_HTML_TAGS } from '../shared/markstreamPlayground'

const SCOPE = 'solid-usage-thinking'

export function registerSolidThinkingExample() {
  setCustomComponents(SCOPE, { thinking: ThinkingNode })
}

export function SolidCustomComponentsUsage(props: { content: string, isDark?: boolean }) {
  return (
    <NodeRenderer
      content={props.content}
      isDark={props.isDark}
      customId={SCOPE}
      customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
      final
    />
  )
}
